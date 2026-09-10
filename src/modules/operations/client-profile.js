'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { assertSameOrigin, requireAdmin, requireCsrf } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';
import { b64urlEncode, sha256Hex } from '../../core/crypto.js';
import { rateAllow } from '../../core/rate-limit.js';
import { isEmail } from '../../core/validation.js';

const TOKEN_TTL_MS=7*24*60*60*1000;
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const CLIENT_LANGUAGES=['ar','en'];
const COUNTRY_RE=/^[A-Z]{2}$/;

function text(value,max,{required=false,field='value'}={}){
  const v=String(value??'').trim();
  if(required&&!v)throw new ApiError('CLIENT_PROFILE_VALIDATION_FAILED',`${field} is required.`,422,[{field,code:'required'}]);
  if(v.length>max)throw new ApiError('CLIENT_PROFILE_VALIDATION_FAILED',`${field} is too long.`,422,[{field,code:'too_long'}]);
  return v||null;
}
function email(value){
  const v=text(value,255,{field:'billing_email'});
  if(v&&!isEmail(v))throw new ApiError('CLIENT_PROFILE_VALIDATION_FAILED','Invalid billing_email.',422,[{field:'billing_email',code:'invalid_email'}]);
  return v?.toLowerCase()||null;
}
function language(value){
  const v=String(value??'').trim();
  if(!CLIENT_LANGUAGES.includes(v))throw new ApiError('CLIENT_PROFILE_VALIDATION_FAILED','Invalid preferred_language.',422,[{field:'preferred_language',code:'invalid'}]);
  return v;
}
function country(value){
  const v=String(value??'').trim().toUpperCase();
  if(!v)return null;
  if(!COUNTRY_RE.test(v))throw new ApiError('CLIENT_PROFILE_VALIDATION_FAILED','Invalid billing_country_code.',422,[{field:'billing_country_code',code:'invalid_country'}]);
  return v;
}
function publicId(prefix){return `${prefix}_${crypto.randomUUID().replace(/-/g,'').slice(0,24)}`}
function randomToken(){return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)))}
function normalizeToken(value){
  const token=String(value??'').trim();
  if(!TOKEN_RE.test(token))throw new ApiError('CLIENT_PROFILE_LINK_INVALID','This profile link is invalid or unavailable.',410);
  return token;
}
function profilePayload(input,clientType){
  const d=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return {
    display_name:text(d.display_name,190,{required:true,field:'display_name'}),
    legal_name:text(d.legal_name,255,{field:'legal_name'}),
    preferred_language:language(d.preferred_language),
    billing_name:text(d.billing_name,255,{field:'billing_name'}),
    billing_email:email(d.billing_email),
    billing_phone:text(d.billing_phone,80,{field:'billing_phone'}),
    billing_address_line1:text(d.billing_address_line1,255,{field:'billing_address_line1'}),
    billing_address_line2:text(d.billing_address_line2,255,{field:'billing_address_line2'}),
    billing_city:text(d.billing_city,120,{field:'billing_city'}),
    billing_region:text(d.billing_region,120,{field:'billing_region'}),
    billing_postal_code:text(d.billing_postal_code,40,{field:'billing_postal_code'}),
    billing_country_code:country(d.billing_country_code),
    tax_identifier:clientType==='company'?text(d.tax_identifier,120,{field:'tax_identifier'}):null
  };
}
function tokenState(row){
  if(!row)return null;
  return {
    public_id:row.public_id,
    state:row.state,
    expires_at:row.expires_at,
    completed_at:row.completed_at||null,
    revoked_at:row.revoked_at||null,
    created_at:row.created_at
  };
}
async function clientForAdmin(env,id){
  const c=await env.DB.prepare('SELECT id,public_id,client_code,status FROM clients WHERE id=? LIMIT 1').bind(id).first();
  if(!c)throw new ApiError('CLIENT_NOT_FOUND','Client not found.',404);
  return {...c,id:Number(c.id)};
}
async function latestState(env,clientId){
  const row=await env.DB.prepare(`SELECT t.public_id,t.expires_at,t.completed_at,t.revoked_at,t.created_at,
    CASE WHEN t.completed_at IS NOT NULL THEN 'completed'
         WHEN t.revoked_at IS NOT NULL THEN 'revoked'
         WHEN julianday(t.expires_at)<=julianday('now') THEN 'expired'
         ELSE 'active' END state
    FROM client_profile_tokens t WHERE t.client_id=? ORDER BY t.id DESC LIMIT 1`).bind(clientId).first();
  return tokenState(row);
}
export async function adminClientProfileCompletionState(env,id){
  const client=await clientForAdmin(env,id);
  const link=await latestState(env,id);
  return {client_id:client.id,client_code:client.client_code,client_status:client.status,link};
}

export async function adminClientProfileCompletionGenerate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);
  const client=await clientForAdmin(env,id);
  if(client.status!=='active')throw new ApiError('CLIENT_PROFILE_LINK_UNAVAILABLE','Profile completion links can only be generated for active clients.',409);
  const token=randomToken(),tokenHash=await sha256Hex(token),tokenPublicId=publicId('cpt'),expiresAt=new Date(Date.now()+TOKEN_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE client_profile_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE client_id=? AND completed_at IS NULL AND revoked_at IS NULL`).bind(id),
    env.DB.prepare(`INSERT INTO client_profile_tokens(public_id,client_id,token_hash,expires_at,created_by_admin_id,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(tokenPublicId,id,tokenHash,expiresAt,auth.user.id)
  ]);
  await audit(env,{adminId:auth.user.id,action:'client_profile_link.generate',entityType:'client',entityId:String(id),rid,ip:clientIp(request),context:{token_public_id:tokenPublicId,expires_at:expiresAt}});
  const base=new URL('/client-profile.html',request.url).toString();
  return {...await adminClientProfileCompletionState(env,id),completion_url:`${base}#token=${encodeURIComponent(token)}`};
}

export async function adminClientProfileCompletionRevoke(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await clientForAdmin(env,id);
  const result=await env.DB.prepare(`UPDATE client_profile_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE client_id=? AND completed_at IS NULL AND revoked_at IS NULL`).bind(id).run();
  if(Number(result?.meta?.changes||0)>0)await audit(env,{adminId:auth.user.id,action:'client_profile_link.revoke',entityType:'client',entityId:String(id),rid,ip:clientIp(request),context:null});
  return adminClientProfileCompletionState(env,id);
}

async function publicTokenRow(request,env,rawToken,scope){
  assertSameOrigin(request);
  const token=normalizeToken(rawToken),ip=clientIp(request),tokenHash=await sha256Hex(token);
  const [ipAllowed,tokenAllowed]=await Promise.all([
    rateAllow(env,`client-profile-${scope}-ip`,ip,40,900),
    rateAllow(env,`client-profile-${scope}-token`,tokenHash,20,900)
  ]);
  if(!ipAllowed||!tokenAllowed)throw new ApiError('CLIENT_PROFILE_RATE_LIMITED','Too many attempts. Please try again later.',429);
  const row=await env.DB.prepare(`SELECT t.id token_id,t.public_id token_public_id,t.client_id,t.expires_at,t.completed_at,t.revoked_at,
    c.client_code,c.client_type,c.display_name,c.legal_name,c.default_currency,c.preferred_language,c.status,
    c.billing_name,c.billing_email,c.billing_phone,c.billing_address_line1,c.billing_address_line2,c.billing_city,c.billing_region,c.billing_postal_code,c.billing_country_code,c.tax_identifier
    FROM client_profile_tokens t JOIN clients c ON c.id=t.client_id WHERE t.token_hash=? LIMIT 1`).bind(tokenHash).first();
  if(!row||row.completed_at||row.revoked_at||row.status!=='active'||!(new Date(row.expires_at).getTime()>Date.now()))throw new ApiError('CLIENT_PROFILE_LINK_INVALID','This profile link is invalid or unavailable.',410);
  return {...row,token_hash:tokenHash};
}
function safeProfileDto(row){
  return {
    client_code:row.client_code,
    client_type:row.client_type,
    default_currency:row.default_currency,
    profile:{
      display_name:row.display_name,
      legal_name:row.legal_name,
      preferred_language:row.preferred_language,
      billing_name:row.billing_name,
      billing_email:row.billing_email,
      billing_phone:row.billing_phone,
      billing_address_line1:row.billing_address_line1,
      billing_address_line2:row.billing_address_line2,
      billing_city:row.billing_city,
      billing_region:row.billing_region,
      billing_postal_code:row.billing_postal_code,
      billing_country_code:row.billing_country_code,
      tax_identifier:row.client_type==='company'?row.tax_identifier:null
    }
  };
}

export async function publicClientProfileResolve(request,env){
  const d=await readJson(request,env),row=await publicTokenRow(request,env,d.token,'resolve');
  return safeProfileDto(row);
}

export async function publicClientProfileComplete(request,env,rid){
  const d=await readJson(request,env),row=await publicTokenRow(request,env,d.token,'complete'),p=profilePayload(d.profile,row.client_type),completedAt=new Date().toISOString();
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE client_profile_tokens SET completed_at=? WHERE id=? AND completed_at IS NULL AND revoked_at IS NULL AND julianday(expires_at)>julianday('now') AND EXISTS(SELECT 1 FROM clients WHERE id=client_profile_tokens.client_id AND status='active')`).bind(completedAt,Number(row.token_id)),
    env.DB.prepare(`UPDATE clients SET display_name=?,legal_name=?,preferred_language=?,billing_name=?,billing_email=?,billing_phone=?,billing_address_line1=?,billing_address_line2=?,billing_city=?,billing_region=?,billing_postal_code=?,billing_country_code=?,tax_identifier=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM client_profile_tokens WHERE id=? AND completed_at=?)`)
      .bind(p.display_name,p.legal_name,p.preferred_language,p.billing_name,p.billing_email,p.billing_phone,p.billing_address_line1,p.billing_address_line2,p.billing_city,p.billing_region,p.billing_postal_code,p.billing_country_code,p.tax_identifier,Number(row.client_id),Number(row.token_id),completedAt)
  ]);
  const consumed=Number(results?.[0]?.meta?.changes||0),updated=Number(results?.[1]?.meta?.changes||0);
  if(consumed!==1||updated!==1)throw new ApiError('CLIENT_PROFILE_LINK_INVALID','This profile link is invalid or unavailable.',410);
  await audit(env,{adminId:null,action:'client_profile.complete',entityType:'client',entityId:String(row.client_id),rid,ip:clientIp(request),context:{token_public_id:row.token_public_id}});
  return {completed:true,client_code:row.client_code};
}
