'use strict';

import { ApiError } from './errors.js';
import { encoder } from './crypto.js';
import { intVar } from './validation.js';

export function requestId() {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function json(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

export function dataResponse(data, status = 200, extraHeaders = {}) {
  return json({ data }, status, extraHeaders);
}

export function errorResponse(err, rid) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, details: err.details || [] }, request_id: rid }, err.status);
  }
  console.error('NEXORA_WORKER_UNHANDLED', rid, err?.stack || err);
  return json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.', details: [] }, request_id: rid }, 500);
}

export function clientIp(request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'; }
export function nowSql() { return new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''); }

export async function readJson(request, env) {
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
