'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';
import { b64urlEncode, b64urlDecode, encoder, decoder } from '../../core/crypto.js';
import { isEmail } from '../../core/validation.js';

export const CLIENT_TYPES=['individual','company'];
export const CLIENT_STATUSES=['active','on_hold','archived'];
export const CONTACT_STATUSES=['active','inactive'];
export const CLIENT_LANGUAGES=['ar','en'];

const CURRENCY_RE=/^[A-Z]{3}$/;
const COUNTRY_RE=/^[A-Z]{2}$/;
const PAGE_SIZE=50;
const CLIENT_LIFECYCLE_TRANSITIONS={
  active:{deactivate:'on_hold',archive:'archived'},
  on_hold:{activate:'active',archive:'archived'},
  archived:{restore:'active'}
};

function text(value,max,{required=false,field='value'}={}){
  const v=String(value??'').trim();
  if(required&&!v)throw new ApiError('CLIENT_VALIDATION_FAILED',`${field} is required.`,422,[{field,code:'required'}]);
  if(v.length>max)throw new ApiError('CLIENT_VALIDATION_FAILED',`${field} is too long.`,422,[{field,code:'too_long'}]);
  return v||null;
}
function enumValue(value,allowed,{field,required=true,fallback=null}={}){
  const v=String(value??fallback??'').trim();
  if(!v&&!required)return null;
  if(!allowed.includes(v))throw new ApiError('CLIENT_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid'}]);
  return v;
}
function email(value,{field='billing_email'}={}){
  const v=text(value,255,{field});
  if(v&&!isEmail(v))throw new ApiError('CLIENT_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid_email'}]);
  return v?.toLowerCase()||null;
}
function currency(value){
  const v=String(value??'').trim().toUpperCase();
  if(!CURRENCY_RE.test(v))throw new ApiError('CLIENT_VALIDATION_FAILED','default_currency must be a 3-letter currency code.',422,[{field:'default_currency',code:'invalid_currency'}]);
  return v;
}
function country(value){
  const v=String(value??'').trim().toUpperCase();
  if(!v)return null;
  if(!COUNTRY_RE.test(v))throw new ApiError('CLIENT_VALIDATION_FAILED','billing_country_code must be a 2-letter country code.',422,[{field:'billing_country_code',code:'invalid_country'}]);
  return v;
}
function flag(value){return value===true||value===1||value==='1'||value==='true'?1:0}
function publicId(prefix){return `${prefix}_${crypto.randomUUID().replace(/-/g,'').slice(0,24)}`}
function isConstraintError(err){return /UNIQUE constraint failed|FOREIGN KEY constraint failed|constraint failed/i.test(String(err?.message||err||''))}

function parseClientPayload(d){
  const clientType=enumValue(d.client_type,CLIENT_TYPES,{field:'client_type'});
  return {
    client_type:clientType,
    display_name:text(d.display_name,190,{required:true,field:'display_name'}),
    legal_name:text(d.legal_name,255,{field:'legal_name'}),
    default_currency:currency(d.default_currency),
    preferred_language:enumValue(d.preferred_language,CLIENT_LANGUAGES,{field:'preferred_language'}),
    billing_name:text(d.billing_name,255,{field:'billing_name'}),
    billing_email:email(d.billing_email),
    billing_phone:text(d.billing_phone,80,{field:'billing_phone'}),
    billing_address_line1:text(d.billing_address_line1,255,{field:'billing_address_line1'}),
    billing_address_line2:text(d.billing_address_line2,255,{field:'billing_address_line2'}),
    billing_city:text(d.billing_city,120,{field:'billing_city'}),
    billing_region:text(d.billing_region,120,{field:'billing_region'}),
    billing_postal_code:text(d.billing_postal_code,40,{field:'billing_postal_code'}),
    billing_country_code:country(d.billing_country_code),
    // Individual clients never retain a tax identifier. This rule is server-authoritative.
    tax_identifier:clientType==='company'?text(d.tax_identifier,120,{field:'tax_identifier'}):null
  };
}
function parseContactPayload(d,{allowInactive=true}={}){
  let status=enumValue(d.status??'active',CONTACT_STATUSES,{field:'contact_status'});
  if(!allowInactive&&status==='inactive')status='active';
  return {
    name:text(d.name,190,{required:true,field:'contact_name'}),
    email:email(d.email,{field:'contact_email'}),
    phone:text(d.phone,80,{field:'contact_phone'}),
    role_title:text(d.role_title,120,{field:'role_title'}),
    preferred_language:enumValue(d.preferred_language,CLIENT_LANGUAGES,{field:'contact_preferred_language'}),
    is_primary:status==='active'?flag(d.is_primary):0,
    status
  };
}

function encodeCursor(row){return b64urlEncode(encoder.encode(JSON.stringify({u:String(row.updated_at),i:Number(row.id)})))}
function decodeCursor(raw){
  if(!raw)return null;
  try{
    const p=JSON.parse(decoder.decode(b64urlDecode(String(raw))));
    if(typeof p.u!=='string'||!p.u||!Number.isInteger(Number(p.i))||Number(p.i)<=0)throw new Error('invalid');
    return {updated_at:p.u,id:Number(p.i)};
  }catch{throw new ApiError('CLIENT_CURSOR_INVALID','Invalid clients cursor.',422)}
}
function normalizeClientRow(x){return {...x,id:Number(x.id),contact_count:Number(x.contact_count||0),conversion_count:Number(x.conversion_count||0),project_count:Number(x.project_count||0)}}

export async function adminClientConfig(env){
  const {results=[]}=await env.DB.prepare(`SELECT option_key code,sort_order FROM inquiry_option_items WHERE group_key='currency' AND is_active=1 ORDER BY sort_order,id`).all();
  const currencies=results.map(x=>String(x.code||'').toUpperCase()).filter(x=>CURRENCY_RE.test(x));
  return {client_types:CLIENT_TYPES,statuses:CLIENT_STATUSES,languages:CLIENT_LANGUAGES,currencies,default_currency:currencies[0]||null,client_code:{prefix:'CU-',minimum_digits:3,server_generated:true}};
}

export async function adminClientList(env,url){
  const status=String(url.searchParams.get('status')||'').trim();
  if(status&&!CLIENT_STATUSES.includes(status))throw new ApiError('CLIENT_STATUS_INVALID','Invalid client status.',422);
  const q=String(url.searchParams.get('q')||'').trim().slice(0,160);
  const cursor=decodeCursor(url.searchParams.get('cursor'));
  const where=[],params=[];
  if(status){where.push('c.status=?');params.push(status)}
  if(q){const like=`%${q}%`;where.push(`(c.display_name LIKE ? OR c.legal_name LIKE ? OR c.client_code LIKE ? OR c.billing_email LIKE ? OR EXISTS(SELECT 1 FROM client_contacts sc WHERE sc.client_id=c.id AND (sc.name LIKE ? OR sc.email LIKE ? OR sc.phone LIKE ?)))`);params.push(like,like,like,like,like,like,like)}
  if(cursor){where.push('(c.updated_at<? OR (c.updated_at=? AND c.id<?))');params.push(cursor.updated_at,cursor.updated_at,cursor.id)}
  const sql=`SELECT c.id,c.public_id,c.client_code,c.client_type,c.display_name,c.legal_name,c.default_currency,c.preferred_language,c.status,c.billing_email,c.billing_phone,c.created_at,c.updated_at,c.archived_at,
    (SELECT cc.name FROM client_contacts cc WHERE cc.client_id=c.id AND cc.status='active' ORDER BY cc.is_primary DESC,cc.id LIMIT 1) primary_contact_name,
    (SELECT cc.email FROM client_contacts cc WHERE cc.client_id=c.id AND cc.status='active' ORDER BY cc.is_primary DESC,cc.id LIMIT 1) primary_contact_email,
    (SELECT cc.phone FROM client_contacts cc WHERE cc.client_id=c.id AND cc.status='active' ORDER BY cc.is_primary DESC,cc.id LIMIT 1) primary_contact_phone,
    (SELECT COUNT(*) FROM client_contacts cc WHERE cc.client_id=c.id) contact_count,
    (SELECT COUNT(*) FROM inquiry_conversions ic WHERE ic.client_id=c.id) conversion_count,
    (SELECT COUNT(*) FROM client_projects cp WHERE cp.client_id=c.id) project_count
    FROM clients c${where.length?' WHERE '+where.join(' AND '):''} ORDER BY c.updated_at DESC,c.id DESC LIMIT ${PAGE_SIZE+1}`;
  const {results=[]}=await env.DB.prepare(sql).bind(...params).all();
  const hasMore=results.length>PAGE_SIZE,items=results.slice(0,PAGE_SIZE).map(normalizeClientRow),last=items[items.length-1];
  return {items,meta:{count:items.length,has_more:hasMore,next_cursor:hasMore&&last?encodeCursor(last):null}};
}

export async function adminClientFind(env,id){
  const c=await env.DB.prepare(`SELECT c.*,a.name created_by_admin_name FROM clients c LEFT JOIN admin_users a ON a.id=c.created_by_admin_id WHERE c.id=? LIMIT 1`).bind(id).first();
  if(!c)return null;c.id=Number(c.id);
  const [contacts,conversions,projects]=await Promise.all([
    env.DB.prepare(`SELECT id,public_id,client_id,name,email,phone,role_title,preferred_language,is_primary,portal_enabled,status,created_at,updated_at FROM client_contacts WHERE client_id=? ORDER BY is_primary DESC,status='active' DESC,id`).bind(id).all(),
    env.DB.prepare(`SELECT ic.id,ic.project_inquiry_id,ic.converted_at,ic.context_json,i.public_id inquiry_public_id,i.name inquiry_name,i.email inquiry_email,i.status inquiry_status,a.name converted_by_admin_name FROM inquiry_conversions ic JOIN project_inquiries i ON i.id=ic.project_inquiry_id LEFT JOIN admin_users a ON a.id=ic.converted_by_admin_id WHERE ic.client_id=? ORDER BY ic.converted_at DESC,ic.id DESC`).bind(id).all(),
    env.DB.prepare(`SELECT p.id,p.public_id,p.project_code,p.name,p.status,p.priority,p.progress_mode,p.manual_progress_percent,p.target_date,p.updated_at,p.archived_at,(SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=p.id AND t.archived_at IS NULL AND t.status<>'cancelled') task_count,(SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=p.id AND t.archived_at IS NULL AND t.status='done') task_done_count FROM client_projects p WHERE p.client_id=? ORDER BY p.archived_at IS NOT NULL,p.updated_at DESC,p.id DESC LIMIT 100`).bind(id).all()
  ]);
  let projectCount={n:0};try{projectCount=await env.DB.prepare(`SELECT COUNT(*) n FROM client_projects WHERE client_id=?`).bind(id).first()||{n:0}}catch{}
  c.contacts=(contacts.results||[]).map(x=>({...x,id:Number(x.id),client_id:Number(x.client_id),is_primary:Number(x.is_primary||0),portal_enabled:Number(x.portal_enabled||0)}));
  c.inquiry_conversions=(conversions.results||[]).map(x=>({...x,id:Number(x.id),project_inquiry_id:Number(x.project_inquiry_id)}));
  c.client_projects=(projects.results||[]).map(x=>{const taskCount=Number(x.task_count||0),done=Number(x.task_done_count||0),calculated=taskCount>0?Math.round((done/taskCount)*100):0;return {...x,id:Number(x.id),manual_progress_percent:Number(x.manual_progress_percent||0),task_count:taskCount,task_done_count:done,calculated_progress_percent:calculated,effective_progress_percent:x.progress_mode==='calculated'?calculated:Number(x.manual_progress_percent||0),is_archived:Boolean(x.archived_at)}});
  c.client_project_count=c.client_projects.length;
  const projectCountValue=Number(projectCount?.n||0),knownBlockers=[];if(c.inquiry_conversions.length)knownBlockers.push({relation:'inquiry_conversions',count:c.inquiry_conversions.length});if(projectCountValue)knownBlockers.push({relation:'client_projects',count:projectCountValue});
  c.delete_eligibility={can_delete:knownBlockers.length===0,known_blockers:knownBlockers};
  return c;
}

async function requireClient(env,id,{allowArchived=true}={}){
  const c=await env.DB.prepare('SELECT id,public_id,client_code,client_type,status,tax_identifier FROM clients WHERE id=? LIMIT 1').bind(id).first();
  if(!c)throw new ApiError('CLIENT_NOT_FOUND','Client not found.',404);
  c.id=Number(c.id);
  if(!allowArchived&&c.status==='archived')throw new ApiError('CLIENT_ARCHIVED','Archived clients cannot be used for this operation.',409);
  if(!allowArchived&&c.status==='on_hold')throw new ApiError('CLIENT_INACTIVE','Deactivated clients cannot be used for this operation.',409);
  return c;
}

function clientInsertStatement(env,p,publicIdValue,adminId){
  return env.DB.prepare(`INSERT INTO clients(public_id,client_type,display_name,legal_name,default_currency,preferred_language,status,billing_name,billing_email,billing_phone,billing_address_line1,billing_address_line2,billing_city,billing_region,billing_postal_code,billing_country_code,tax_identifier,created_by_admin_id,created_at,updated_at,archived_at)
    VALUES(?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)`)
    .bind(publicIdValue,p.client_type,p.display_name,p.legal_name,p.default_currency,p.preferred_language,p.billing_name,p.billing_email,p.billing_phone,p.billing_address_line1,p.billing_address_line2,p.billing_city,p.billing_region,p.billing_postal_code,p.billing_country_code,p.tax_identifier,adminId);
}
function clientCodeAssignStatement(env,clientPublicId){
  // Width 3 is a minimum, not a maximum: id=1 -> CU-001 and id=1000 -> CU-1000.
  return env.DB.prepare(`UPDATE clients SET client_code='CU-' || printf('%03d', id) WHERE public_id=?`).bind(clientPublicId);
}
function contactInsertByClientPublicId(env,clientPublicId,cp,contactPublicId){
  return env.DB.prepare(`INSERT INTO client_contacts(public_id,client_id,name,email,phone,role_title,preferred_language,is_primary,portal_enabled,status,created_at,updated_at)
    SELECT ?,id,?,?,?,?,?,?,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM clients WHERE public_id=?`)
    .bind(contactPublicId,cp.name,cp.email,cp.phone,cp.role_title,cp.preferred_language,cp.is_primary,cp.status,clientPublicId);
}

export async function adminClientCreate(request,env,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const d=await readJson(request,env);
  const p=parseClientPayload(d),clientPublicId=publicId('cli');
  const batch=[clientInsertStatement(env,p,clientPublicId,auth.user.id),clientCodeAssignStatement(env,clientPublicId)];
  if(d.primary_contact){const cp=parseContactPayload(d.primary_contact,{allowInactive:false});batch.push(contactInsertByClientPublicId(env,clientPublicId,cp,publicId('ctc')))}
  try{await env.DB.batch(batch)}catch(err){if(isConstraintError(err))throw new ApiError('CLIENT_CREATE_CONFLICT','Client could not be created because a relational or identity constraint was violated.',409);throw err}
  const c=await env.DB.prepare('SELECT id,client_code FROM clients WHERE public_id=? LIMIT 1').bind(clientPublicId).first();
  await audit(env,{adminId:auth.user.id,action:'client.create',entityType:'client',entityId:String(c.id),rid,ip:clientIp(request),context:{public_id:clientPublicId,client_code:c.client_code,status:'active'}});
  return adminClientFind(env,Number(c.id));
}

export async function adminClientUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const current=await requireClient(env,id);const d=await readJson(request,env);const p=parseClientPayload(d);
  await env.DB.prepare(`UPDATE clients SET client_type=?,display_name=?,legal_name=?,default_currency=?,preferred_language=?,billing_name=?,billing_email=?,billing_phone=?,billing_address_line1=?,billing_address_line2=?,billing_city=?,billing_region=?,billing_postal_code=?,billing_country_code=?,tax_identifier=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(p.client_type,p.display_name,p.legal_name,p.default_currency,p.preferred_language,p.billing_name,p.billing_email,p.billing_phone,p.billing_address_line1,p.billing_address_line2,p.billing_city,p.billing_region,p.billing_postal_code,p.billing_country_code,p.tax_identifier,id).run();
  await audit(env,{adminId:auth.user.id,action:'client.update',entityType:'client',entityId:String(id),rid,ip:clientIp(request),context:{client_code:current.client_code,status:current.status,client_type:p.client_type,tax_identifier_cleared:current.client_type==='company'&&p.client_type==='individual'&&Boolean(current.tax_identifier)}});
  return adminClientFind(env,id);
}

export async function adminClientLifecycle(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const current=await requireClient(env,id);const d=await readJson(request,env);
  const action=String(d.action||'').trim();const next=CLIENT_LIFECYCLE_TRANSITIONS[current.status]?.[action];
  if(!next)throw new ApiError('CLIENT_LIFECYCLE_INVALID','This client lifecycle action is not allowed from the current status.',409,[{field:'action',code:'invalid_transition'}]);
  const lifecycleBatch=[env.DB.prepare(`UPDATE clients SET status=?,updated_at=CURRENT_TIMESTAMP,archived_at=CASE WHEN ?='archived' THEN COALESCE(archived_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=?`).bind(next,next,id)];
  if(next!=='active'){
    lifecycleBatch.push(env.DB.prepare(`UPDATE client_profile_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE client_id=? AND completed_at IS NULL AND revoked_at IS NULL`).bind(id));
    lifecycleBatch.push(env.DB.prepare(`UPDATE client_project_access_grants SET revoked_at=CURRENT_TIMESTAMP,status='revoked',updated_at=CURRENT_TIMESTAMP WHERE client_id=? AND revoked_at IS NULL`).bind(id));
    lifecycleBatch.push(env.DB.prepare(`UPDATE client_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE revoked_at IS NULL AND access_grant_id IN (SELECT id FROM client_project_access_grants WHERE client_id=?)`).bind(id));
  }
  await env.DB.batch(lifecycleBatch);
  await audit(env,{adminId:auth.user.id,action:'client.lifecycle',entityType:'client',entityId:String(id),rid,ip:clientIp(request),context:{client_code:current.client_code,action,from_status:current.status,to_status:next}});
  return adminClientFind(env,id);
}

function safeIdentifier(value){const s=String(value||'');if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s))throw new Error('Unsafe SQLite identifier');return `"${s}"`}
async function clientDeleteBlockers(env,clientId){
  const {results:tables=[]}=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
  const cleanupTables=new Set(['client_contacts','client_profile_tokens']);const blockers=[];
  for(const row of tables){
    const table=String(row.name||'');if(!table||cleanupTables.has(table))continue;
    let fks=[];try{({results:fks=[]}=await env.DB.prepare(`PRAGMA foreign_key_list(${safeIdentifier(table)})`).all())}catch{continue}
    for(const fk of fks){
      if(String(fk.table||'')!=='clients'||String(fk.to||'id')!=='id')continue;
      const column=String(fk.from||'');if(!column)continue;
      const countRow=await env.DB.prepare(`SELECT COUNT(*) n FROM ${safeIdentifier(table)} WHERE ${safeIdentifier(column)}=?`).bind(clientId).first();
      const count=Number(countRow?.n||0);if(count>0)blockers.push({relation:table,column,count});
    }
  }
  return blockers;
}

export async function adminClientDelete(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const current=await requireClient(env,id);const d=await readJson(request,env);
  const confirmCode=String(d.confirm_code||'').trim().toUpperCase();
  if(!current.client_code||confirmCode!==String(current.client_code).toUpperCase())throw new ApiError('CLIENT_DELETE_CONFIRMATION_MISMATCH','Client code confirmation does not match.',422,[{field:'confirm_code',code:'mismatch'}]);
  const blockers=await clientDeleteBlockers(env,id);
  if(blockers.length)throw new ApiError('CLIENT_DELETE_BLOCKED','This client has protected historical or operational relations. Deactivate or archive it instead.',409,blockers.map(x=>({field:x.relation,code:'relation_exists',count:x.count})));
  try{
    await env.DB.batch([
      env.DB.prepare('DELETE FROM client_profile_tokens WHERE client_id=?').bind(id),
      env.DB.prepare('DELETE FROM client_contacts WHERE client_id=?').bind(id),
      env.DB.prepare('DELETE FROM clients WHERE id=?').bind(id)
    ]);
  }catch(err){if(isConstraintError(err))throw new ApiError('CLIENT_DELETE_BLOCKED','This client is now referenced by protected history and cannot be permanently deleted.',409);throw err}
  await audit(env,{adminId:auth.user.id,action:'client.delete',entityType:'client',entityId:String(id),rid,ip:clientIp(request),context:{public_id:current.public_id,client_code:current.client_code,previous_status:current.status}});
  return {deleted:true,id,current_public_id:current.public_id,client_code:current.client_code};
}

export async function adminClientContactCreate(request,env,clientId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireClient(env,clientId);const d=await readJson(request,env),p=parseContactPayload(d,{allowInactive:false}),contactPublicId=publicId('ctc');
  const batch=[];if(p.is_primary)batch.push(env.DB.prepare('UPDATE client_contacts SET is_primary=0,updated_at=CURRENT_TIMESTAMP WHERE client_id=? AND is_primary=1').bind(clientId));
  batch.push(env.DB.prepare(`INSERT INTO client_contacts(public_id,client_id,name,email,phone,role_title,preferred_language,is_primary,portal_enabled,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(contactPublicId,clientId,p.name,p.email,p.phone,p.role_title,p.preferred_language,p.is_primary,p.status));
  await env.DB.batch(batch);const row=await env.DB.prepare('SELECT id FROM client_contacts WHERE public_id=? LIMIT 1').bind(contactPublicId).first();
  await audit(env,{adminId:auth.user.id,action:'client_contact.create',entityType:'client_contact',entityId:String(row.id),rid,ip:clientIp(request),context:{client_id:clientId,is_primary:p.is_primary}});
  return adminClientFind(env,clientId);
}

export async function adminClientContactUpdate(request,env,clientId,contactId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireClient(env,clientId);const exists=await env.DB.prepare('SELECT id FROM client_contacts WHERE id=? AND client_id=? LIMIT 1').bind(contactId,clientId).first();if(!exists)throw new ApiError('CLIENT_CONTACT_NOT_FOUND','Client contact not found.',404);
  const d=await readJson(request,env),p=parseContactPayload(d);const batch=[];if(p.is_primary)batch.push(env.DB.prepare('UPDATE client_contacts SET is_primary=0,updated_at=CURRENT_TIMESTAMP WHERE client_id=? AND id<>? AND is_primary=1').bind(clientId,contactId));
  batch.push(env.DB.prepare(`UPDATE client_contacts SET name=?,email=?,phone=?,role_title=?,preferred_language=?,is_primary=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?`).bind(p.name,p.email,p.phone,p.role_title,p.preferred_language,p.is_primary,p.status,contactId,clientId));
  await env.DB.batch(batch);await audit(env,{adminId:auth.user.id,action:'client_contact.update',entityType:'client_contact',entityId:String(contactId),rid,ip:clientIp(request),context:{client_id:clientId,is_primary:p.is_primary,status:p.status}});
  return adminClientFind(env,clientId);
}

async function existingConversion(env,inquiryId){
  const x=await env.DB.prepare(`SELECT ic.id,ic.project_inquiry_id,ic.client_id,ic.converted_by_admin_id,ic.converted_at,c.public_id client_public_id,c.display_name client_display_name FROM inquiry_conversions ic JOIN clients c ON c.id=ic.client_id WHERE ic.project_inquiry_id=? LIMIT 1`).bind(inquiryId).first();
  return x?{...x,id:Number(x.id),project_inquiry_id:Number(x.project_inquiry_id),client_id:Number(x.client_id),converted_by_admin_id:Number(x.converted_by_admin_id)}:null;
}
function conversionContext(inquiry){
  return JSON.stringify({inquiry_public_id:inquiry.public_id,status_at_conversion:inquiry.status,source_service_slug:inquiry.source_service_slug||null,source_package_key:inquiry.source_package_key||null,source_project_slug:inquiry.source_project_slug||null,submission_language:inquiry.submission_language||null});
}

export async function adminInquiryConvertToClient(request,env,inquiryId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);
  const already=await existingConversion(env,inquiryId);if(already)return {already_converted:true,conversion:already,client:await adminClientFind(env,already.client_id)};
  const inquiry=await env.DB.prepare(`SELECT id,public_id,name,email,phone,company,status,submission_language,budget_currency,source_service_slug,source_package_key,source_project_slug FROM project_inquiries WHERE id=? LIMIT 1`).bind(inquiryId).first();
  if(!inquiry)throw new ApiError('ADMIN_INQUIRY_NOT_FOUND','Inquiry not found.',404);
  const d=await readJson(request,env),mode=String(d.mode||'new').trim();if(!['new','existing'].includes(mode))throw new ApiError('CLIENT_CONVERSION_MODE_INVALID','Invalid conversion mode.',422);
  const context=conversionContext(inquiry);let clientId=null,newPublicId=null;
  try{
    if(mode==='existing'){
      clientId=Number(d.client_id);if(!Number.isInteger(clientId)||clientId<=0)throw new ApiError('CLIENT_SELECTION_REQUIRED','Select an existing client.',422);await requireClient(env,clientId,{allowArchived:false});
      await env.DB.prepare(`INSERT INTO inquiry_conversions(project_inquiry_id,client_id,converted_by_admin_id,converted_at,context_json) VALUES(?,?,?,CURRENT_TIMESTAMP,?)`).bind(inquiryId,clientId,auth.user.id,context).run();
    }else{
      const raw={...(d.client||{})};const p=parseClientPayload(raw);newPublicId=publicId('cli');
      const batch=[clientInsertStatement(env,p,newPublicId,auth.user.id),clientCodeAssignStatement(env,newPublicId)];
      if(d.create_primary_contact!==false){const cp=parseContactPayload({name:inquiry.name,email:inquiry.email,phone:inquiry.phone,role_title:null,preferred_language:raw.preferred_language,is_primary:true,status:'active'},{allowInactive:false});batch.push(contactInsertByClientPublicId(env,newPublicId,cp,publicId('ctc')))}
      batch.push(env.DB.prepare(`INSERT INTO inquiry_conversions(project_inquiry_id,client_id,converted_by_admin_id,converted_at,context_json) SELECT ?,id,?,CURRENT_TIMESTAMP,? FROM clients WHERE public_id=?`).bind(inquiryId,auth.user.id,context,newPublicId));
      await env.DB.batch(batch);const created=await env.DB.prepare('SELECT id FROM clients WHERE public_id=? LIMIT 1').bind(newPublicId).first();clientId=Number(created.id);
    }
  }catch(err){
    if(isConstraintError(err)){
      const raced=await existingConversion(env,inquiryId);if(raced)return {already_converted:true,conversion:raced,client:await adminClientFind(env,raced.client_id)};
    }
    throw err;
  }
  const conversion=await existingConversion(env,inquiryId);
  await audit(env,{adminId:auth.user.id,action:'inquiry.convert_client',entityType:'project_inquiry',entityId:String(inquiryId),rid,ip:clientIp(request),context:{client_id:clientId,mode}});
  return {already_converted:false,conversion,client:await adminClientFind(env,clientId)};
}
