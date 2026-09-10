'use strict';

import { sha256Hex } from './crypto.js';

export async function rateAllow(env, scope, key, limit, windowSeconds) {
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
