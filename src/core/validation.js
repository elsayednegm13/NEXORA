'use strict';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ICON_RE = /^[a-z0-9_-]{2,80}$/;

export function intVar(env, key, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function bool(v) { return Number(v) === 1 || v === true; }
export function emptyToNull(v) { const s = String(v ?? '').trim(); return s === '' ? null : s; }
export function clamp(n, min, max) { n = Number(n) || 0; return Math.max(min, Math.min(max, Math.trunc(n))); }
export function isSlug(v) { return typeof v === 'string' && v.length <= 160 && SLUG_RE.test(v); }
export function isEmail(v) { return typeof v === 'string' && v.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
export function isHttpUrl(v) { try { const u = new URL(String(v)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
