'use strict';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ADMIN_STATUSES = ['new','reviewing','qualified','contacted','proposal_sent','won','lost','spam','archived'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_RE = /^[a-z0-9_-]{2,80}$/;

class ApiError extends Error {
  constructor(code, message, status = 400, details = []) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function requestId() {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function json(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function dataResponse(data, status = 200, extraHeaders = {}) {
  return json({ data }, status, extraHeaders);
}

function errorResponse(err, rid) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, details: err.details || [] }, request_id: rid }, err.status);
  }
  console.error('NEXORA_WORKER_UNHANDLED', rid, err?.stack || err);
  return json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.', details: [] }, request_id: rid }, 500);
}

function intVar(env, key, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function bool(v) { return Number(v) === 1 || v === true; }
function emptyToNull(v) { const s = String(v ?? '').trim(); return s === '' ? null : s; }
function clamp(n, min, max) { n = Number(n) || 0; return Math.max(min, Math.min(max, Math.trunc(n))); }
function isSlug(v) { return typeof v === 'string' && v.length <= 160 && SLUG_RE.test(v); }
function isEmail(v) { return typeof v === 'string' && v.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isHttpUrl(v) { try { const u = new URL(String(v)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function clientIp(request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'; }
function nowSql() { return new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''); }

async function readJson(request, env) {
  const max = intVar(env, 'MAX_JSON_BYTES', 262144, 1024, 1048576);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > max) throw new ApiError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
  const text = await request.text();
  if (encoder.encode(text).byteLength > max) throw new ApiError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not-object');
    return parsed;
  } catch {
    throw new ApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
}

function b64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function constantTimeEqualBytes(a, b) {
  if (!(a instanceof Uint8Array)) a = new Uint8Array(a);
  if (!(b instanceof Uint8Array)) b = new Uint8Array(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function constantTimeEqualText(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(a))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(b)))
  ]);
  return constantTimeEqualBytes(new Uint8Array(ha), new Uint8Array(hb));
}

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

async function hashPassword(password, env) {
  // Cloudflare Workers Free allows only 10 ms CPU/request. A high-iteration
  // PBKDF2 verifier can exceed that budget, so the admin verifier uses a
  // random per-password salt plus a server-side HMAC pepper stored as a
  // Worker Secret. D1 alone is not sufficient to verify or crack passwords.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await passwordVerifierV2(env, password, salt);
  return `hmac_sha256_v2$${b64urlEncode(salt)}$${b64urlEncode(digest)}`;
}

async function verifyPassword(password, stored, env) {
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

async function sessionToken(env, adminId, ttlSeconds) {
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

async function csrfFor(env, nonce) {
  const secret = String(env.ADMIN_SESSION_SECRET || '');
  return b64urlEncode(await hmacBytes(secret, `csrf:${nonce}`));
}

function adminCookie(token, ttlSeconds) {
  return `nexora_admin=${token}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; Secure; SameSite=Strict`;
}
function clearAdminCookie() { return 'nexora_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'; }

async function requireAdmin(request, env) {
  const payload = await verifySessionToken(env, parseCookies(request).nexora_admin);
  if (!payload) throw new ApiError('ADMIN_UNAUTHENTICATED', 'Authentication is required.', 401);
  const user = await env.DB.prepare('SELECT id,name,email,is_active,last_login_at FROM admin_users WHERE id=? AND is_active=1 LIMIT 1').bind(payload.id).first();
  if (!user) throw new ApiError('ADMIN_UNAUTHENTICATED', 'Authentication is required.', 401);
  return { user: { id: Number(user.id), name: user.name, email: user.email, last_login_at: user.last_login_at }, payload, csrf: await csrfFor(env, payload.nonce) };
}

async function requireCsrf(request, env, auth) {
  const actual = request.headers.get('X-CSRF-Token') || '';
  if (!actual || !(await constantTimeEqualText(actual, auth.csrf))) throw new ApiError('ADMIN_CSRF_INVALID', 'Security token is invalid or expired.', 419);
}

function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new ApiError('ORIGIN_NOT_ALLOWED', 'Cross-origin admin requests are not allowed.', 403);
}

async function audit(env, { adminId = null, action, entityType = null, entityId = null, rid, ip = null, context = null }) {
  const salt = String(env.IP_HASH_SECRET || env.ADMIN_SESSION_SECRET || 'nexora');
  const ipHash = ip && ip !== 'unknown' ? await sha256Hex(`${salt}|${ip}`) : null;
  await env.DB.prepare(`INSERT INTO audit_logs(admin_user_id,action,entity_type,entity_id,request_id,ip_hash,context_json,created_at)
    VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(adminId, action, entityType, entityId, rid, ipHash, context ? JSON.stringify(context) : null).run();
}

async function rateAllow(env, scope, key, limit, windowSeconds) {
  const hash = await sha256Hex(`${scope}|${key}`);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`
    INSERT INTO api_rate_limits(key_hash,scope,attempts,window_started_at,updated_at)
    VALUES(?,?,1,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key_hash) DO UPDATE SET
      scope=excluded.scope,
      attempts=CASE WHEN (? - window_started_at) >= ? THEN 1 ELSE attempts + 1 END,
      window_started_at=CASE WHEN (? - window_started_at) >= ? THEN ? ELSE window_started_at END,
      updated_at=CURRENT_TIMESTAMP
    RETURNING attempts
  `).bind(hash, scope, now, now, windowSeconds, now, windowSeconds, now).first();
  return Number(row?.attempts || 0) <= limit;
}

function mapService(r) {
  return {
    id: Number(r.id), slug: r.slug,
    title: { ar: r.title_ar, en: r.title_en },
    shortDescription: { ar: r.short_description_ar || '', en: r.short_description_en || '' },
    description: { ar: r.description_ar || '', en: r.description_en || '' },
    icon: r.icon_key || 'custom', active: bool(r.is_active), featured: bool(r.is_featured), sortOrder: Number(r.sort_order || 0),
    seo: { title: { ar: r.seo_title_ar || '', en: r.seo_title_en || '' }, description: { ar: r.seo_description_ar || '', en: r.seo_description_en || '' } }
  };
}

async function listServices(env) {
  const { results = [] } = await env.DB.prepare(`SELECT id,slug,title_ar,title_en,short_description_ar,short_description_en,description_ar,description_en,icon_key,is_active,is_featured,sort_order,seo_title_ar,seo_title_en,seo_description_ar,seo_description_en FROM services WHERE is_active=1 ORDER BY sort_order,id`).all();
  return results.map(mapService);
}

async function showService(env, slug) {
  if (!isSlug(slug)) throw new ApiError('INVALID_SLUG', 'Invalid service slug.', 422);
  const row = await env.DB.prepare('SELECT * FROM services WHERE slug=? AND is_active=1 LIMIT 1').bind(slug).first();
  if (!row) throw new ApiError('SERVICE_NOT_FOUND', 'Service not found.', 404);
  const service = mapService(row);
  const [cap, tech, related] = await Promise.all([
    env.DB.prepare(`SELECT id,title_ar,title_en,description_ar,description_en,sort_order FROM service_capabilities WHERE service_id=? AND is_active=1 ORDER BY sort_order,id`).bind(row.id).all(),
    env.DB.prepare(`SELECT t.id,t.slug,t.name_ar,t.name_en,ma.url icon_url,st.sort_order FROM service_technologies st JOIN technologies t ON t.id=st.technology_id AND t.is_active=1 LEFT JOIN media_assets ma ON ma.id=t.icon_media_id WHERE st.service_id=? ORDER BY st.sort_order,t.id`).bind(row.id).all(),
    env.DB.prepare(`SELECT p.id,p.slug,p.title_ar,p.title_en,p.domain,ma.url image,ps.sort_order FROM project_services ps JOIN projects p ON p.id=ps.project_id AND p.is_active=1 LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE ps.service_id=? ORDER BY ps.sort_order,p.sort_order,p.id LIMIT 12`).bind(row.id).all()
  ]);
  service.capabilities = (cap.results || []).map(x => ({ id:Number(x.id), title:{ar:x.title_ar||'',en:x.title_en||''}, description:{ar:x.description_ar||'',en:x.description_en||''}, sortOrder:Number(x.sort_order||0) }));
  service.technologies = (tech.results || []).map(x => ({ id:Number(x.id), slug:x.slug, name:{ar:x.name_ar,en:x.name_en}, iconUrl:x.icon_url||'', sortOrder:Number(x.sort_order||0) }));
  service.relatedProjects = (related.results || []).map(x => ({ id:Number(x.id), slug:x.slug, title:{ar:x.title_ar,en:x.title_en}, image:x.image||'', domain:x.domain, sortOrder:Number(x.sort_order||0) }));
  return service;
}

function mapProject(r) {
  return {
    id:Number(r.id), slug:r.slug, title:{ar:r.title_ar,en:r.title_en},
    short_description:{ar:r.short_description_ar||'',en:r.short_description_en||''},
    description:{ar:r.description_ar||'',en:r.description_en||''},
    challenge:{ar:r.challenge_ar||'',en:r.challenge_en||''}, solution:{ar:r.solution_ar||'',en:r.solution_en||''},
    website_url:r.website_url, domain:r.domain, status:r.status, cover_image:r.cover_image||'', is_featured:bool(r.is_featured), sort_order:Number(r.sort_order||0),
    seo:{title:{ar:r.seo_title_ar||'',en:r.seo_title_en||''},description:{ar:r.seo_description_ar||'',en:r.seo_description_en||''}}
  };
}

async function listProjects(env) {
  const { results=[] } = await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE p.is_active=1 ORDER BY p.sort_order,p.id`).all();
  return results.map(mapProject);
}

async function showProject(env, slug) {
  if (!isSlug(slug)) throw new ApiError('INVALID_SLUG', 'Invalid project slug.', 422);
  const row = await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE p.slug=? AND p.is_active=1 LIMIT 1`).bind(slug).first();
  if (!row) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
  const p = mapProject(row);
  const [tech, svc, res, media] = await Promise.all([
    env.DB.prepare(`SELECT t.id,t.slug,t.name_ar,t.name_en,ma.url icon_url,pt.sort_order FROM project_technologies pt JOIN technologies t ON t.id=pt.technology_id AND t.is_active=1 LEFT JOIN media_assets ma ON ma.id=t.icon_media_id WHERE pt.project_id=? ORDER BY pt.sort_order,t.id`).bind(row.id).all(),
    env.DB.prepare(`SELECT s.id,s.slug,s.title_ar,s.title_en,s.icon_key,ps.sort_order FROM project_services ps JOIN services s ON s.id=ps.service_id AND s.is_active=1 WHERE ps.project_id=? ORDER BY ps.sort_order,s.id`).bind(row.id).all(),
    env.DB.prepare(`SELECT id,value,label_ar,label_en,note_ar,note_en FROM project_results WHERE project_id=? AND is_active=1 ORDER BY sort_order,id`).bind(row.id).all(),
    env.DB.prepare(`SELECT pm.id,ma.url,pm.alt_ar,pm.alt_en,pm.caption_ar,pm.caption_en FROM project_media pm JOIN media_assets ma ON ma.id=pm.media_id WHERE pm.project_id=? AND pm.is_active=1 ORDER BY pm.sort_order,pm.id`).bind(row.id).all()
  ]);
  p.technologies=(tech.results||[]).map(x=>({id:Number(x.id),slug:x.slug,name:{ar:x.name_ar,en:x.name_en},icon_url:x.icon_url||''}));
  p.services=(svc.results||[]).map(x=>({id:Number(x.id),slug:x.slug,name:{ar:x.title_ar,en:x.title_en},icon_url:''}));
  p.results=(res.results||[]).map(x=>({id:Number(x.id),value:x.value||'',label:{ar:x.label_ar,en:x.label_en},note:{ar:x.note_ar||'',en:x.note_en||''}}));
  p.gallery=(media.results||[]).map(x=>({id:Number(x.id),url:x.url,alt:{ar:x.alt_ar||'',en:x.alt_en||''},caption:{ar:x.caption_ar||'',en:x.caption_en||''}}));
  return p;
}

async function inquiryConfig(env) {
  const { results=[] } = await env.DB.prepare(`SELECT group_key,option_key,label_ar,label_en,sort_order FROM inquiry_option_items WHERE is_active=1 ORDER BY group_key,sort_order,id`).all();
  const out={projectStages:[],timelines:[],budgetModes:[],currencies:[]};
  for(const r of results){
    const entry={key:r.option_key,label:{ar:r.label_ar||'',en:r.label_en||''}};
    if(r.group_key==='project_stage')out.projectStages.push(entry);
    else if(r.group_key==='timeline')out.timelines.push(entry);
    else if(r.group_key==='budget_mode')out.budgetModes.push(entry);
    else if(r.group_key==='currency')out.currencies.push(r.option_key);
  }
  return out;
}

async function validOptions(env) {
  const { results=[] } = await env.DB.prepare(`SELECT group_key,option_key FROM inquiry_option_items WHERE is_active=1`).all();
  const out={};
  for(const r of results){ if(!out[r.group_key])out[r.group_key]=new Set(); out[r.group_key].add(r.option_key); }
  return out;
}

async function validateInquiry(env, p) {
  const e={}; const required=['client_request_id','name','email','project_stage','timeline','description','preferred_contact'];
  for(const k of required)if(String(p[k]??'').trim()==='')e[k]='required';
  if(p.email!==undefined&&!isEmail(String(p.email)))e.email='invalid';
  if(String(p.client_request_id??'').trim().length>120)e.client_request_id='too_long';
  if(String(p.name??'').trim().length>160)e.name='too_long';
  if(String(p.email??'').trim().length>255)e.email='too_long';
  if(String(p.phone??'').trim().length>80)e.phone='too_long';
  if(String(p.company??'').trim().length>190)e.company='too_long';
  const desc=String(p.description??'').trim(); if(desc&&desc.length<20)e.description='too_short'; if(desc.length>10000)e.description='too_long';
  if(p.privacy_accepted!==true)e.privacy_accepted='required';
  if(String(p.website_confirm??'').trim()!=='')e.request='spam_rejected';
  if(p.reference_url!==null&&p.reference_url!==undefined&&String(p.reference_url).trim()!==''&&!isHttpUrl(String(p.reference_url)))e.reference_url='invalid';
  if(!['email','phone','whatsapp'].includes(p.preferred_contact))e.preferred_contact='invalid';
  const opts=await validOptions(env);
  if(!e.project_stage&&!opts.project_stage?.has(String(p.project_stage||'')))e.project_stage='invalid';
  if(!e.timeline&&!opts.timeline?.has(String(p.timeline||'')))e.timeline='invalid';
  const budget=(p.budget&&typeof p.budget==='object'&&!Array.isArray(p.budget))?p.budget:{};
  const mode=String(budget.mode||''); if(!opts.budget_mode?.has(mode))e['budget.mode']='invalid';
  const currency=budget.currency; if(currency!==null&&currency!==undefined&&String(currency)!==''&&!opts.currency?.has(String(currency)))e['budget.currency']='invalid';
  const amount=budget.amount; if(amount!==null&&amount!==undefined&&amount!==''&&(!Number.isFinite(Number(amount))||Number(amount)<0))e['budget.amount']='invalid';
  if(!Array.isArray(p.service_ids||[])||!Array.isArray(p.service_slugs||[]))e.services='invalid';
  if(p.locale!==undefined&&p.locale!==null&&p.locale!==''&&!['ar','en'].includes(String(p.locale)))e.locale='invalid';
  return e;
}

async function activeServiceIds(env, ids, slugs) {
  ids=[...new Set((Array.isArray(ids)?ids:[]).map(Number).filter(x=>Number.isInteger(x)&&x>0))];
  slugs=[...new Set((Array.isArray(slugs)?slugs:[]).map(x=>String(x)).filter(isSlug))];
  if(!ids.length&&!slugs.length)return [];
  const parts=[], params=[];
  if(ids.length){parts.push(`id IN (${ids.map(()=>'?').join(',')})`);params.push(...ids);}
  if(slugs.length){parts.push(`slug IN (${slugs.map(()=>'?').join(',')})`);params.push(...slugs);}
  const {results=[]}=await env.DB.prepare(`SELECT id FROM services WHERE is_active=1 AND (${parts.join(' OR ')}) ORDER BY sort_order,id`).bind(...params).all();
  return results.map(x=>Number(x.id));
}

async function createInquiry(request, env) {
  const ip=clientIp(request);
  const limit=intVar(env,'INQUIRY_RATE_LIMIT',5,1,100);
  const windowSeconds=intVar(env,'INQUIRY_RATE_WINDOW_SECONDS',3600,60,86400);
  if(!(await rateAllow(env,'project-inquiry',ip,limit,windowSeconds)))throw new ApiError('RATE_LIMITED','Too many requests. Please try again later.',429);
  const p=await readJson(request,env);
  const errors=await validateInquiry(env,p);
  if(Object.keys(errors).length)throw new ApiError('VALIDATION_FAILED','Some fields are invalid.',422,errors);
  const clientId=String(p.client_request_id).trim();
  const headerId=(request.headers.get('Idempotency-Key')||'').trim();
  if(headerId&&headerId!==clientId)throw new ApiError('IDEMPOTENCY_MISMATCH','Idempotency-Key must match client_request_id.',409);
  const existing=await env.DB.prepare('SELECT public_id,status FROM project_inquiries WHERE client_request_id=? LIMIT 1').bind(clientId).first();
  if(existing)return {data:{public_id:existing.public_id,status:'received'},status:200};
  const serviceIds=await activeServiceIds(env,p.service_ids||[],p.service_slugs||[]);
  const budget=(p.budget&&typeof p.budget==='object')?p.budget:{}; const source=(p.source&&typeof p.source==='object')?p.source:{};
  const publicId=`inq_${crypto.randomUUID().replace(/-/g,'').slice(0,24)}`;
  const insert=env.DB.prepare(`INSERT INTO project_inquiries(public_id,client_request_id,submission_language,name,email,phone,company,project_stage_key,timeline_key,budget_mode_key,budget_amount,budget_currency,description,reference_url,preferred_contact,privacy_accepted_at,source_page,source_service_slug,source_package_key,source_project_slug,referrer,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,'new',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    publicId,clientId,['ar','en'].includes(String(p.locale||''))?String(p.locale):null,String(p.name).trim(),String(p.email).trim().toLowerCase(),emptyToNull(p.phone),emptyToNull(p.company),String(p.project_stage),String(p.timeline),String(budget.mode),budget.amount===null||budget.amount===undefined||budget.amount===''?null:Number(budget.amount),emptyToNull(budget.currency),String(p.description).trim(),emptyToNull(p.reference_url),String(p.preferred_contact),emptyToNull(source.page),emptyToNull(source.service),emptyToNull(source.package),emptyToNull(source.project),emptyToNull(source.referrer)
  );
  const batch=[insert];
  serviceIds.forEach((serviceId,i)=>batch.push(env.DB.prepare(`INSERT INTO project_inquiry_services(project_inquiry_id,service_id,sort_order) SELECT id,?,? FROM project_inquiries WHERE client_request_id=?`).bind(serviceId,i+1,clientId)));
  batch.push(env.DB.prepare(`INSERT INTO project_inquiry_status_history(project_inquiry_id,from_status,to_status,changed_by_admin_id,note,created_at) SELECT id,NULL,'new',NULL,NULL,CURRENT_TIMESTAMP FROM project_inquiries WHERE client_request_id=?`).bind(clientId));
  try { await env.DB.batch(batch); }
  catch(err){
    const raced=await env.DB.prepare('SELECT public_id FROM project_inquiries WHERE client_request_id=? LIMIT 1').bind(clientId).first();
    if(raced)return {data:{public_id:raced.public_id,status:'received'},status:200};
    throw err;
  }
  return {data:{public_id:publicId,status:'received'},status:201};
}

function mapAdminProject(r){return {id:Number(r.id),slug:r.slug,title_ar:r.title_ar,title_en:r.title_en,short_description_ar:r.short_description_ar||'',short_description_en:r.short_description_en||'',description_ar:r.description_ar||'',description_en:r.description_en||'',challenge_ar:r.challenge_ar||'',challenge_en:r.challenge_en||'',solution_ar:r.solution_ar||'',solution_en:r.solution_en||'',website_url:r.website_url,domain:r.domain,status:r.status,cover_image:r.cover_image||'',is_featured:bool(r.is_featured),is_active:bool(r.is_active),sort_order:Number(r.sort_order||0),seo_title_ar:r.seo_title_ar||'',seo_title_en:r.seo_title_en||'',seo_description_ar:r.seo_description_ar||'',seo_description_en:r.seo_description_en||'',updated_at:r.updated_at||null};}
function mapAdminService(r){return {id:Number(r.id),slug:r.slug,title_ar:r.title_ar,title_en:r.title_en,short_description_ar:r.short_description_ar||'',short_description_en:r.short_description_en||'',description_ar:r.description_ar||'',description_en:r.description_en||'',icon_key:r.icon_key||'custom',is_active:bool(r.is_active),is_featured:bool(r.is_featured),sort_order:Number(r.sort_order||0),seo_title_ar:r.seo_title_ar||'',seo_title_en:r.seo_title_en||'',seo_description_ar:r.seo_description_ar||'',seo_description_en:r.seo_description_en||'',updated_at:r.updated_at||null};}

async function adminSetupStatus(env){
  const row=await env.DB.prepare('SELECT COUNT(*) count FROM admin_users').first(); const count=Number(row?.count||0); const key=String(env.ADMIN_SETUP_KEY||''); const pepper=String(env.ADMIN_PASSWORD_PEPPER||'');
  return {configured:count>0,setup_enabled:count===0&&key.length>=24&&!key.toUpperCase().includes('CHANGE_THIS')&&pepper.length>=32};
}

async function adminSetup(request,env,rid){
  assertSameOrigin(request);
  const status=await adminSetupStatus(env); if(status.configured)throw new ApiError('ADMIN_ALREADY_CONFIGURED','Admin account is already configured.',409);
  if(!status.setup_enabled)throw new ApiError('ADMIN_SETUP_DISABLED','Set a strong ADMIN_SETUP_KEY Worker secret first.',503);
  const d=await readJson(request,env); const provided=String(d.setup_key||'').trim();
  if(!provided||!(await constantTimeEqualText(String(env.ADMIN_SETUP_KEY),provided)))throw new ApiError('ADMIN_SETUP_KEY_INVALID','Setup key is invalid.',403);
  const name=String(d.name||'').trim(), email=String(d.email||'').trim().toLowerCase(), password=String(d.password||'');
  if(name.length<2||name.length>190)throw new ApiError('ADMIN_NAME_INVALID','Name, email or password does not meet the setup requirements.',422);
  if(!isEmail(email))throw new ApiError('ADMIN_EMAIL_INVALID','Name, email or password does not meet the setup requirements.',422);
  if(password.length<12||password.length>200)throw new ApiError('ADMIN_PASSWORD_INVALID','Name, email or password does not meet the setup requirements.',422);
  const passwordHash=await hashPassword(password,env);
  try{await env.DB.prepare(`INSERT INTO admin_users(name,email,password_hash,is_active,created_at,updated_at) VALUES(?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(name,email,passwordHash).run();}
  catch(err){throw new ApiError('ADMIN_ALREADY_CONFIGURED','Admin account is already configured.',409);}
  const admin=await env.DB.prepare('SELECT id,name,email FROM admin_users WHERE email=? LIMIT 1').bind(email).first();
  await audit(env,{adminId:Number(admin.id),action:'admin.setup',entityType:'admin_user',entityId:String(admin.id),rid,ip:clientIp(request)});
  const ttl=intVar(env,'ADMIN_SESSION_TIMEOUT_SECONDS',28800,900,86400*7); const s=await sessionToken(env,Number(admin.id),ttl); const csrf=await csrfFor(env,s.payload.nonce);
  return dataResponse({user:{id:Number(admin.id),name:admin.name,email:admin.email},csrf_token:csrf},201,{'Set-Cookie':adminCookie(s.token,ttl)});
}

async function adminLogin(request,env,rid){
  assertSameOrigin(request); const ip=clientIp(request);
  const limit=intVar(env,'ADMIN_LOGIN_RATE_LIMIT',8,3,100), windowSeconds=intVar(env,'ADMIN_LOGIN_RATE_WINDOW_SECONDS',900,60,86400);
  if(!(await rateAllow(env,'admin-login',ip,limit,windowSeconds)))throw new ApiError('ADMIN_LOGIN_RATE_LIMITED','Too many login attempts. Try again later.',429);
  const d=await readJson(request,env); const email=String(d.email||'').trim().toLowerCase(), password=String(d.password||'');
  if(!isEmail(email)||!password)throw new ApiError('ADMIN_LOGIN_INVALID','Email or password is incorrect.',401);
  const admin=await env.DB.prepare('SELECT id,name,email,password_hash,is_active,last_login_at FROM admin_users WHERE email=? LIMIT 1').bind(email).first();
  if(!admin||!bool(admin.is_active)||!(await verifyPassword(password,admin.password_hash,env)))throw new ApiError('ADMIN_LOGIN_INVALID','Email or password is incorrect.',401);
  await env.DB.prepare('UPDATE admin_users SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(admin.id).run();
  await audit(env,{adminId:Number(admin.id),action:'admin.login',entityType:'admin_user',entityId:String(admin.id),rid,ip});
  const ttl=intVar(env,'ADMIN_SESSION_TIMEOUT_SECONDS',28800,900,86400*7); const s=await sessionToken(env,Number(admin.id),ttl); const csrf=await csrfFor(env,s.payload.nonce);
  return dataResponse({user:{id:Number(admin.id),name:admin.name,email:admin.email},csrf_token:csrf},200,{'Set-Cookie':adminCookie(s.token,ttl)});
}

async function adminMe(request,env){const auth=await requireAdmin(request,env);return {user:auth.user,csrf_token:auth.csrf};}
async function adminLogout(request,env,rid){assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await audit(env,{adminId:auth.user.id,action:'admin.logout',entityType:'admin_user',entityId:String(auth.user.id),rid,ip:clientIp(request)});return dataResponse({logged_out:true},200,{'Set-Cookie':clearAdminCookie()});}

async function adminDashboard(env){
  const statements=[
    env.DB.prepare('SELECT COUNT(*) value FROM projects'),env.DB.prepare('SELECT COUNT(*) value FROM projects WHERE is_active=1'),
    env.DB.prepare('SELECT COUNT(*) value FROM services'),env.DB.prepare('SELECT COUNT(*) value FROM services WHERE is_active=1'),
    env.DB.prepare('SELECT COUNT(*) value FROM project_inquiries'),env.DB.prepare("SELECT COUNT(*) value FROM project_inquiries WHERE status='new'"),
    env.DB.prepare('SELECT id,public_id,name,email,status,created_at FROM project_inquiries ORDER BY created_at DESC,id DESC LIMIT 6')
  ];
  const r=await env.DB.batch(statements); const val=i=>Number(r[i]?.results?.[0]?.value||0);
  return {counts:{projects:val(0),active_projects:val(1),services:val(2),active_services:val(3),inquiries:val(4),new_inquiries:val(5)},recent_inquiries:(r[6]?.results||[]).map(x=>({...x,id:Number(x.id)}))};
}

async function adminInquiryList(env,url){
  const status=String(url.searchParams.get('status')||'').trim(), search=String(url.searchParams.get('q')||'').trim(); const where=[],params=[];
  if(status){where.push('i.status=?');params.push(status);} if(search){where.push('(i.name LIKE ? OR i.email LIKE ? OR i.company LIKE ? OR i.public_id LIKE ?)');const q=`%${search}%`;params.push(q,q,q,q);}
  const sql=`SELECT i.id,i.public_id,i.name,i.email,i.phone,i.company,i.status,i.submission_language,i.source_service_slug,i.source_package_key,i.created_at,i.updated_at,s.title_ar source_service_title_ar,s.title_en source_service_title_en FROM project_inquiries i LEFT JOIN services s ON s.slug=i.source_service_slug${where.length?' WHERE '+where.join(' AND '):''} ORDER BY i.created_at DESC,i.id DESC LIMIT 100`;
  const {results=[]}=await env.DB.prepare(sql).bind(...params).all();return results.map(x=>({...x,id:Number(x.id)}));
}

async function adminInquiryFind(env,id){
  const r=await env.DB.prepare(`SELECT i.*,a.name assigned_admin_name,ps.label_ar project_stage_label_ar,ps.label_en project_stage_label_en,tl.label_ar timeline_label_ar,tl.label_en timeline_label_en,bm.label_ar budget_mode_label_ar,bm.label_en budget_mode_label_en,ss.title_ar source_service_title_ar,ss.title_en source_service_title_en FROM project_inquiries i LEFT JOIN admin_users a ON a.id=i.assigned_admin_id LEFT JOIN inquiry_option_items ps ON ps.group_key='project_stage' AND ps.option_key=i.project_stage_key LEFT JOIN inquiry_option_items tl ON tl.group_key='timeline' AND tl.option_key=i.timeline_key LEFT JOIN inquiry_option_items bm ON bm.group_key='budget_mode' AND bm.option_key=i.budget_mode_key LEFT JOIN services ss ON ss.slug=i.source_service_slug WHERE i.id=? LIMIT 1`).bind(id).first(); if(!r)return null; r.id=Number(r.id);
  const [sv,h]=await Promise.all([
    env.DB.prepare(`SELECT s.id,s.slug,s.title_ar,s.title_en,s.icon_key FROM project_inquiry_services pis JOIN services s ON s.id=pis.service_id WHERE pis.project_inquiry_id=? ORDER BY pis.sort_order,s.id`).bind(id).all(),
    env.DB.prepare(`SELECT h.id,h.from_status,h.to_status,h.note,h.created_at,a.name changed_by FROM project_inquiry_status_history h LEFT JOIN admin_users a ON a.id=h.changed_by_admin_id WHERE h.project_inquiry_id=? ORDER BY h.created_at DESC,h.id DESC`).bind(id).all()
  ]);
  r.services=(sv.results||[]).map(x=>({...x,id:Number(x.id)}));r.history=(h.results||[]).map(x=>({...x,id:Number(x.id)}));return r;
}

async function adminInquiryUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const d=await readJson(request,env);const status=String(d.status||'').trim(),notes=String(d.internal_notes||'').trim(),statusNote=String(d.status_note||'').trim();
  if(!ADMIN_STATUSES.includes(status))throw new ApiError('ADMIN_INQUIRY_STATUS_INVALID','Invalid inquiry status.',422);if(notes.length>20000)throw new ApiError('ADMIN_NOTES_TOO_LONG','Internal notes are too long.',422);if(statusNote.length>2000)throw new ApiError('ADMIN_STATUS_NOTE_TOO_LONG','Status note is too long.',422);
  const old=await env.DB.prepare('SELECT status FROM project_inquiries WHERE id=? LIMIT 1').bind(id).first();if(!old)throw new ApiError('ADMIN_INQUIRY_NOT_FOUND','Inquiry not found.',404);
  const contacted=['contacted','proposal_sent','won','lost'].includes(status)?1:0,closed=['won','lost','spam','archived'].includes(status)?1:0;
  const batch=[env.DB.prepare(`UPDATE project_inquiries SET status=?,internal_notes=?,assigned_admin_id=?,contacted_at=CASE WHEN ?=1 THEN COALESCE(contacted_at,CURRENT_TIMESTAMP) ELSE contacted_at END,closed_at=CASE WHEN ?=1 THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,notes||null,auth.user.id,contacted,closed,id)];
  if(old.status!==status)batch.push(env.DB.prepare(`INSERT INTO project_inquiry_status_history(project_inquiry_id,from_status,to_status,changed_by_admin_id,note,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,old.status,status,auth.user.id,statusNote||null));
  await env.DB.batch(batch);await audit(env,{adminId:auth.user.id,action:'inquiry.update',entityType:'project_inquiry',entityId:String(id),rid,ip:clientIp(request),context:{status}});return adminInquiryFind(env,id);
}

async function adminProjectList(env){const {results=[]}=await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id ORDER BY p.sort_order,p.id`).all();return results.map(mapAdminProject);}
async function adminProjectFind(env,id){const r=await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE p.id=? LIMIT 1`).bind(id).first();return r?mapAdminProject(r):null;}
function validateAdminProject(d){
  const v={};v.slug=String(d.slug||'').trim();if(!isSlug(v.slug))throw new ApiError('ADMIN_PROJECT_SLUG_INVALID','Invalid project slug.',422);
  for(const k of ['title_ar','title_en']){v[k]=String(d[k]||'').trim();if(!v[k]||v[k].length>255)throw new ApiError('ADMIN_PROJECT_TITLE_INVALID','Project title is required.',422);}
  for(const k of ['short_description_ar','short_description_en','description_ar','description_en','challenge_ar','challenge_en','solution_ar','solution_en','seo_title_ar','seo_title_en','seo_description_ar','seo_description_en'])v[k]=String(d[k]||'').trim();
  v.website_url=String(d.website_url||'').trim();if(!isHttpUrl(v.website_url))throw new ApiError('ADMIN_PROJECT_URL_INVALID','Project website URL is invalid.',422);
  v.domain=String(d.domain||'').trim();if(!v.domain||v.domain.length>255)throw new ApiError('ADMIN_PROJECT_DOMAIN_INVALID','Project domain is invalid.',422);
  v.status=String(d.status||'live').trim();if(!/^[a-z0-9_-]{2,40}$/.test(v.status))throw new ApiError('ADMIN_PROJECT_STATUS_INVALID','Project status is invalid.',422);
  v.is_featured=Boolean(d.is_featured);v.is_active=Boolean(d.is_active);v.sort_order=clamp(d.sort_order,-10000,10000);return v;
}
async function adminProjectUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);if(!(await adminProjectFind(env,id)))throw new ApiError('ADMIN_PROJECT_NOT_FOUND','Project not found.',404);const d=validateAdminProject(await readJson(request,env));
  try{await env.DB.prepare(`UPDATE projects SET slug=?,title_ar=?,title_en=?,short_description_ar=?,short_description_en=?,description_ar=?,description_en=?,challenge_ar=?,challenge_en=?,solution_ar=?,solution_en=?,website_url=?,domain=?,status=?,is_featured=?,is_active=?,sort_order=?,seo_title_ar=?,seo_title_en=?,seo_description_ar=?,seo_description_en=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(d.slug,d.title_ar,d.title_en,emptyToNull(d.short_description_ar),emptyToNull(d.short_description_en),emptyToNull(d.description_ar),emptyToNull(d.description_en),emptyToNull(d.challenge_ar),emptyToNull(d.challenge_en),emptyToNull(d.solution_ar),emptyToNull(d.solution_en),d.website_url,d.domain,d.status,d.is_featured?1:0,d.is_active?1:0,d.sort_order,emptyToNull(d.seo_title_ar),emptyToNull(d.seo_title_en),emptyToNull(d.seo_description_ar),emptyToNull(d.seo_description_en),id).run();}
  catch(err){if(String(err?.message||'').toLowerCase().includes('unique'))throw new ApiError('ADMIN_PROJECT_SLUG_EXISTS','Project slug already exists.',409);throw err;}
  await audit(env,{adminId:auth.user.id,action:'project.update',entityType:'project',entityId:String(id),rid,ip:clientIp(request),context:{slug:d.slug}});return adminProjectFind(env,id);
}

async function adminServiceList(env){const {results=[]}=await env.DB.prepare('SELECT * FROM services ORDER BY sort_order,id').all();return results.map(mapAdminService);}
async function adminServiceFind(env,id){const r=await env.DB.prepare('SELECT * FROM services WHERE id=? LIMIT 1').bind(id).first();return r?mapAdminService(r):null;}
function validateAdminService(d){
  const v={};v.slug=String(d.slug||'').trim();if(!isSlug(v.slug))throw new ApiError('ADMIN_SERVICE_SLUG_INVALID','Invalid service slug.',422);
  for(const k of ['title_ar','title_en']){v[k]=String(d[k]||'').trim();if(!v[k]||v[k].length>190)throw new ApiError('ADMIN_SERVICE_TITLE_INVALID','Service title is required.',422);}
  for(const k of ['short_description_ar','short_description_en','description_ar','description_en','seo_title_ar','seo_title_en','seo_description_ar','seo_description_en'])v[k]=String(d[k]||'').trim();
  v.icon_key=String(d.icon_key||'custom').trim();if(!ICON_RE.test(v.icon_key))v.icon_key='custom';v.is_featured=Boolean(d.is_featured);v.is_active=Boolean(d.is_active);v.sort_order=clamp(d.sort_order,-10000,10000);return v;
}
async function adminServiceUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);if(!(await adminServiceFind(env,id)))throw new ApiError('ADMIN_SERVICE_NOT_FOUND','Service not found.',404);const d=validateAdminService(await readJson(request,env));
  try{await env.DB.prepare(`UPDATE services SET slug=?,title_ar=?,title_en=?,short_description_ar=?,short_description_en=?,description_ar=?,description_en=?,icon_key=?,is_active=?,is_featured=?,sort_order=?,seo_title_ar=?,seo_title_en=?,seo_description_ar=?,seo_description_en=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(d.slug,d.title_ar,d.title_en,emptyToNull(d.short_description_ar),emptyToNull(d.short_description_en),emptyToNull(d.description_ar),emptyToNull(d.description_en),d.icon_key,d.is_active?1:0,d.is_featured?1:0,d.sort_order,emptyToNull(d.seo_title_ar),emptyToNull(d.seo_title_en),emptyToNull(d.seo_description_ar),emptyToNull(d.seo_description_en),id).run();}
  catch(err){if(String(err?.message||'').toLowerCase().includes('unique'))throw new ApiError('ADMIN_SERVICE_SLUG_EXISTS','Service slug already exists.',409);throw err;}
  await audit(env,{adminId:auth.user.id,action:'service.update',entityType:'service',entityId:String(id),rid,ip:clientIp(request),context:{slug:d.slug}});return adminServiceFind(env,id);
}

function match(path, pattern) {
  const keys=[];
  const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = pattern.split('/').map(segment => {
    if (segment.startsWith(':')) { keys.push(segment.slice(1)); return '([^/]+)'; }
    return escapeRe(segment);
  }).join('/');
  const m=path.match(new RegExp(`^${source}$`));
  if(!m)return null;
  const params={};
  keys.forEach((k,i)=>params[k]=decodeURIComponent(m[i+1]));
  return params;
}

async function handleApi(request, env, rid) {
  const url=new URL(request.url);const path=(url.pathname.replace(/\/+$/,'')||'/');const method=request.method.toUpperCase();
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});

  if(method==='GET'&&path==='/api/v1/health')return dataResponse({status:'UP',service:'nexora-worker',api:'v1',runtime:'cloudflare-workers'});
  if (!env.DB) throw new ApiError('DATABASE_UNAVAILABLE','D1 binding DB is not configured.',503);
  if(method==='GET'&&path==='/api/v1/health/db'){await env.DB.prepare('SELECT 1 ok').first();return dataResponse({status:'UP',database:'Cloudflare D1'});}
  if(method==='GET'&&path==='/api/v1/services')return dataResponse(await listServices(env));
  let p=match(path,'/api/v1/services/:slug');if(method==='GET'&&p)return dataResponse(await showService(env,p.slug));
  if(method==='GET'&&path==='/api/v1/projects')return dataResponse(await listProjects(env));
  p=match(path,'/api/v1/projects/:slug');if(method==='GET'&&p)return dataResponse(await showProject(env,p.slug));
  if(method==='GET'&&path==='/api/v1/project-inquiries/config')return dataResponse(await inquiryConfig(env));
  if(method==='POST'&&path==='/api/v1/project-inquiries'){const r=await createInquiry(request,env);return dataResponse(r.data,r.status);}

  if(method==='GET'&&path==='/api/v1/admin/setup/status')return dataResponse(await adminSetupStatus(env));
  if(method==='POST'&&path==='/api/v1/admin/setup')return adminSetup(request,env,rid);
  if(method==='POST'&&path==='/api/v1/admin/auth/login')return adminLogin(request,env,rid);
  if(method==='GET'&&path==='/api/v1/admin/auth/me')return dataResponse(await adminMe(request,env));
  if(method==='POST'&&path==='/api/v1/admin/auth/logout')return adminLogout(request,env,rid);
  if(method==='GET'&&path==='/api/v1/admin/dashboard'){await requireAdmin(request,env);return dataResponse(await adminDashboard(env));}
  if(method==='GET'&&path==='/api/v1/admin/inquiries'){await requireAdmin(request,env);return dataResponse(await adminInquiryList(env,url));}
  p=match(path,'/api/v1/admin/inquiries/:id');if(method==='GET'&&p){await requireAdmin(request,env);const item=await adminInquiryFind(env,Number(p.id));if(!item)throw new ApiError('ADMIN_INQUIRY_NOT_FOUND','Inquiry not found.',404);return dataResponse(item);}
  p=match(path,'/api/v1/admin/inquiries/:id/update');if(method==='POST'&&p)return dataResponse(await adminInquiryUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/inquiries/:id');if(method==='PATCH'&&p)return dataResponse(await adminInquiryUpdate(request,env,Number(p.id),rid));
  if(method==='GET'&&path==='/api/v1/admin/projects'){await requireAdmin(request,env);return dataResponse(await adminProjectList(env));}
  p=match(path,'/api/v1/admin/projects/:id/update');if(method==='POST'&&p)return dataResponse(await adminProjectUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/projects/:id');if(method==='PATCH'&&p)return dataResponse(await adminProjectUpdate(request,env,Number(p.id),rid));
  if(method==='GET'&&path==='/api/v1/admin/services'){await requireAdmin(request,env);return dataResponse(await adminServiceList(env));}
  p=match(path,'/api/v1/admin/services/:id/update');if(method==='POST'&&p)return dataResponse(await adminServiceUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/services/:id');if(method==='PATCH'&&p)return dataResponse(await adminServiceUpdate(request,env,Number(p.id),rid));

  throw new ApiError('API_ROUTE_NOT_FOUND','API route not found.',404);
}

export default {
  async fetch(request, env) {
    const rid=requestId();
    try {
      const path=new URL(request.url).pathname;
      if(path.startsWith('/api/'))return await handleApi(request,env,rid);
      if(env.ASSETS)return env.ASSETS.fetch(request);
      return new Response('Not found',{status:404});
    } catch(err) { return errorResponse(err,rid); }
  }
};
