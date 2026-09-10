'use strict';

import { ApiError } from './errors.js';
import { encoder, decoder, b64urlEncode, b64urlDecode, hmacBytes, constantTimeEqualBytes, constantTimeEqualText } from './crypto.js';

function adminPasswordPepper(env) {
  const pepper = String(env.ADMIN_PASSWORD_PEPPER || '');
  if (pepper.length < 32) throw new ApiError('ADMIN_PASSWORD_PEPPER_MISSING', 'Admin password secret is not configured.', 503);
  return pepper;
}

async function passwordVerifierV2(env, password, salt) {
  const pepper = adminPasswordPepper(env);
  const saltText = b64urlEncode(salt);
  return hmacBytes(pepper, `nexora-admin-password-v2|${saltText}|${password}`);
}

export async function hashPassword(password, env) {
  // Cloudflare Workers Free allows only 10 ms CPU/request. A high-iteration
  // PBKDF2 verifier can exceed that budget, so the admin verifier uses a
  // random per-password salt plus a server-side HMAC pepper stored as a
  // Worker Secret. D1 alone is not sufficient to verify or crack passwords.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await passwordVerifierV2(env, password, salt);
  return `hmac_sha256_v2$${b64urlEncode(salt)}$${b64urlEncode(digest)}`;
}

export async function verifyPassword(password, stored, env) {
  const parts = String(stored || '').split('$');
  if (parts.length === 3 && parts[0] === 'hmac_sha256_v2') {
    let salt, expected;
    try { salt = b64urlDecode(parts[1]); expected = b64urlDecode(parts[2]); } catch { return false; }
    const actual = await passwordVerifierV2(env, password, salt);
    return constantTimeEqualBytes(actual, expected);
  }

  // Legacy compatibility for accounts created by the pre-hotfix build.
  // This branch may require more CPU and exists only to avoid silently
  // invalidating an already-created account.
  if (parts.length === 4 && parts[0] === 'pbkdf2_sha256') {
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    let salt, expected;
    try { salt = b64urlDecode(parts[2]); expected = b64urlDecode(parts[3]); } catch { return false; }
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8));
    return constantTimeEqualBytes(bits, expected);
  }
  return false;
}

function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

export async function sessionToken(env, adminId, ttlSeconds) {
  const secret = String(env.ADMIN_SESSION_SECRET || '');
  if (secret.length < 32) throw new ApiError('ADMIN_SESSION_SECRET_MISSING', 'Admin session secret is not configured.', 503);
  const payload = {
    v: 1,
    id: Number(adminId),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: b64urlEncode(crypto.getRandomValues(new Uint8Array(18)))
  };
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmacBytes(secret, body));
  return { token: `${body}.${sig}`, payload };
}

async function verifySessionToken(env, token) {
  const secret = String(env.ADMIN_SESSION_SECRET || '');
  if (secret.length < 32 || !token) return null;
  const [body, sigText, extra] = String(token).split('.');
  if (!body || !sigText || extra !== undefined) return null;
  let actualSig;
  try { actualSig = b64urlDecode(sigText); } catch { return null; }
  const expectedSig = await hmacBytes(secret, body);
  if (!constantTimeEqualBytes(actualSig, expectedSig)) return null;
  try {
    const payload = JSON.parse(decoder.decode(b64urlDecode(body)));
    if (payload?.v !== 1 || !Number.isInteger(payload.id) || payload.id <= 0 || !payload.nonce || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export async function csrfFor(env, nonce) {
  const secret = String(env.ADMIN_SESSION_SECRET || '');
  return b64urlEncode(await hmacBytes(secret, `csrf:${nonce}`));
}

export function adminCookie(token, ttlSeconds) {
  return `nexora_admin=${token}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; Secure; SameSite=Strict`;
}
export function clearAdminCookie() { return 'nexora_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'; }

export async function requireAdmin(request, env) {
  const payload = await verifySessionToken(env, parseCookies(request).nexora_admin);
  if (!payload) throw new ApiError('ADMIN_UNAUTHENTICATED', 'Authentication is required.', 401);
  const user = await env.DB.prepare('SELECT id,name,email,is_active,last_login_at FROM admin_users WHERE id=? AND is_active=1 LIMIT 1').bind(payload.id).first();
  if (!user) throw new ApiError('ADMIN_UNAUTHENTICATED', 'Authentication is required.', 401);
  return { user: { id: Number(user.id), name: user.name, email: user.email, last_login_at: user.last_login_at }, payload, csrf: await csrfFor(env, payload.nonce) };
}

export async function requireCsrf(request, env, auth) {
  const actual = request.headers.get('X-CSRF-Token') || '';
  if (!actual || !(await constantTimeEqualText(actual, auth.csrf))) throw new ApiError('ADMIN_CSRF_INVALID', 'Security token is invalid or expired.', 419);
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new ApiError('ORIGIN_NOT_ALLOWED', 'Cross-origin admin requests are not allowed.', 403);
}
