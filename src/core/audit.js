'use strict';

import { sha256Hex } from './crypto.js';

export async function audit(env, { adminId = null, action, entityType = null, entityId = null, rid, ip = null, context = null }) {
  const salt = String(env.IP_HASH_SECRET || env.ADMIN_SESSION_SECRET || 'nexora');
  const ipHash = ip && ip !== 'unknown' ? await sha256Hex(`${salt}|${ip}`) : null;
  await env.DB.prepare(`INSERT INTO audit_logs(admin_user_id,action,entity_type,entity_id,request_id,ip_hash,context_json,created_at)
    VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(adminId, action, entityType, entityId, rid, ipHash, context ? JSON.stringify(context) : null).run();
}
