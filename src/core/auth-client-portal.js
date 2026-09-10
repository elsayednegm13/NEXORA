'use strict';

import { ApiError } from './errors.js';
import { b64urlEncode, sha256Hex, constantTimeEqualText } from './crypto.js';
import { intVar } from './validation.js';

const SESSION_COOKIE='nexora_client_portal';
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;

function parseCookies(request){
  const out={};
  for(const part of String(request.headers.get('Cookie')||'').split(';')){
    const idx=part.indexOf('=');
    if(idx>0)out[part.slice(0,idx).trim()]=part.slice(idx+1).trim();
  }
  return out;
}
export function randomPortalToken(){return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)))}
export function normalizePortalToken(value,code='CLIENT_PORTAL_LINK_INVALID'){
  const token=String(value??'').trim();
  if(!TOKEN_RE.test(token))throw new ApiError(code,'This project access link is invalid or unavailable.',410);
  return token;
}
export function portalSessionTtlSeconds(env){return intVar(env,'CLIENT_PORTAL_SESSION_TIMEOUT_SECONDS',28800,900,86400)}
export function portalCookie(rawToken,ttlSeconds){return `${SESSION_COOKIE}=${rawToken}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; Secure; SameSite=Strict`}
export function clearPortalCookie(){return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`}
export async function portalCsrfHash(raw){return sha256Hex(`nexora-client-portal-csrf|${String(raw)}`)}
export async function portalSessionHash(raw){return sha256Hex(`nexora-client-portal-session|${String(raw)}`)}

export async function requirePortalSession(request,env){
  const raw=parseCookies(request)[SESSION_COOKIE];
  if(!raw||!TOKEN_RE.test(raw))throw new ApiError('CLIENT_PORTAL_UNAUTHENTICATED','Project access is required.',401);
  const hash=await portalSessionHash(raw);
  const row=await env.DB.prepare(`SELECT s.id session_id,s.public_id session_public_id,s.csrf_hash,s.expires_at session_expires_at,s.revoked_at session_revoked_at,
      g.id grant_id,g.public_id grant_public_id,g.client_project_id,g.client_id,g.client_contact_id,g.status grant_status,g.expires_at grant_expires_at,g.revoked_at grant_revoked_at,
      g.can_view_progress,g.can_view_milestones,g.can_view_tasks,g.can_submit_tickets,g.can_comment_tickets,
      p.public_id project_public_id,p.project_code,p.name project_name,p.status project_status,p.archived_at project_archived_at,
      c.client_code,c.display_name client_display_name,c.status client_status,
      cc.name contact_name,cc.email contact_email,cc.status contact_status
    FROM client_portal_sessions s
    JOIN client_project_access_grants g ON g.id=s.access_grant_id
    JOIN client_projects p ON p.id=g.client_project_id
    JOIN clients c ON c.id=g.client_id
    LEFT JOIN client_contacts cc ON cc.id=g.client_contact_id
    WHERE s.session_hash=? LIMIT 1`).bind(hash).first();
  const now=Date.now();
  const valid=row&&!row.session_revoked_at&&!row.grant_revoked_at&&row.grant_status==='active'&&!row.project_archived_at&&row.client_status==='active'&&(!row.client_contact_id||row.contact_status==='active')&&new Date(row.session_expires_at).getTime()>now&&new Date(row.grant_expires_at).getTime()>now;
  if(!valid)throw new ApiError('CLIENT_PORTAL_UNAUTHENTICATED','Project access is invalid or expired.',401);
  return {
    session:{id:Number(row.session_id),public_id:row.session_public_id,csrf_hash:row.csrf_hash,expires_at:row.session_expires_at},
    grant:{id:Number(row.grant_id),public_id:row.grant_public_id,client_project_id:Number(row.client_project_id),client_id:Number(row.client_id),client_contact_id:row.client_contact_id===null?null:Number(row.client_contact_id),expires_at:row.grant_expires_at,permissions:{view_progress:Number(row.can_view_progress)===1,view_milestones:Number(row.can_view_milestones)===1,view_tasks:Number(row.can_view_tasks)===1,submit_tickets:Number(row.can_submit_tickets)===1,comment_tickets:Number(row.can_comment_tickets)===1}},
    project:{public_id:row.project_public_id,project_code:row.project_code,name:row.project_name,status:row.project_status},
    client:{client_code:row.client_code,display_name:row.client_display_name},
    contact:row.client_contact_id?{id:Number(row.client_contact_id),name:row.contact_name,email:row.contact_email}:null
  };
}

export async function requirePortalCsrf(request,auth){
  const actual=String(request.headers.get('X-CSRF-Token')||'');
  if(!actual||!(await constantTimeEqualText(await portalCsrfHash(actual),auth.session.csrf_hash)))throw new ApiError('CLIENT_PORTAL_CSRF_INVALID','Security token is invalid or expired.',419);
}
