'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';
import { b64urlEncode, b64urlDecode, encoder, decoder } from '../../core/crypto.js';
import { MILESTONE_STATUSES, TASK_STATUSES, TASK_PRIORITIES, EXECUTION_PROGRESS_MODES } from './client-project-execution.js';
import { publishProjectEvent } from '../../core/project-realtime.js';

export const CLIENT_PROJECT_STATUSES=['planning','active','on_hold','completed','cancelled'];
export const CLIENT_PROJECT_PRIORITIES=['low','normal','high','urgent'];
export const CLIENT_PROJECT_PROGRESS_MODES=['manual'];
export const CLIENT_PROJECT_FILTER_STATUSES=[...CLIENT_PROJECT_STATUSES,'archived'];

const PAGE_SIZE=50;
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE=/^[A-Z]{3}$/;
const ROLE_RE=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const PROJECT_STATUS_TRANSITIONS={
  planning:['active','on_hold','cancelled'],
  active:['on_hold','completed','cancelled'],
  on_hold:['active','cancelled'],
  completed:['active'],
  cancelled:['planning']
};

function text(value,max,{required=false,field='value'}={}){
  const v=String(value??'').trim();
  if(required&&!v)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED',`${field} is required.`,422,[{field,code:'required'}]);
  if(v.length>max)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED',`${field} is too long.`,422,[{field,code:'too_long'}]);
  return v||null;
}
function integer(value,{field,min,max,nullable=false}={}){
  if(nullable&&(value===null||value===undefined||String(value).trim()===''))return null;
  const n=Number(value);
  if(!Number.isInteger(n)||(min!==undefined&&n<min)||(max!==undefined&&n>max))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid'}]);
  return n;
}
function enumValue(value,allowed,{field}={}){
  const v=String(value??'').trim();
  if(!allowed.includes(v))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid'}]);
  return v;
}
function dateOnly(value,{field}={}){
  const v=String(value??'').trim();if(!v)return null;
  if(!DATE_RE.test(v))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid_date'}]);
  const d=new Date(`${v}T00:00:00Z`);
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid_date'}]);
  return v;
}
function currencyCode(value){
  const v=String(value??'').trim().toUpperCase();if(!v)return null;
  if(!CURRENCY_RE.test(v))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Invalid currency.',422,[{field:'currency',code:'invalid_currency'}]);
  return v;
}
function moneyMinor(value){
  const raw=String(value??'').trim();if(!raw)return null;
  if(!/^\d{1,13}(?:\.\d{1,2})?$/.test(raw))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Agreed amount must be a non-negative amount with at most 2 decimal places.',422,[{field:'agreed_amount',code:'invalid_amount'}]);
  const [whole,frac='']=raw.split('.');
  const minor=Number(whole)*100+Number(frac.padEnd(2,'0'));
  if(!Number.isSafeInteger(minor)||minor<0)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Agreed amount is too large.',422,[{field:'agreed_amount',code:'amount_too_large'}]);
  return minor;
}
function amountFromMinor(value){
  if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)return null;
  return `${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;
}
function publicId(){return `cpr_${crypto.randomUUID().replace(/-/g,'').slice(0,24)}`}
function isConstraintError(err){return /UNIQUE constraint failed|FOREIGN KEY constraint failed|constraint failed/i.test(String(err?.message||err||''))}
function encodeCursor(row){return b64urlEncode(encoder.encode(JSON.stringify({u:String(row.updated_at),i:Number(row.id)})))}
function decodeCursor(raw){
  if(!raw)return null;
  try{const p=JSON.parse(decoder.decode(b64urlDecode(String(raw))));if(typeof p.u!=='string'||!p.u||!Number.isInteger(Number(p.i))||Number(p.i)<=0)throw new Error('invalid');return {updated_at:p.u,id:Number(p.i)}}
  catch{throw new ApiError('CLIENT_PROJECT_CURSOR_INVALID','Invalid client projects cursor.',422)}
}
function normalizeProjectRow(row){
  const x={...row};
  x.id=Number(x.id);x.client_id=Number(x.client_id);x.manual_progress_percent=x.manual_progress_percent===null?null:Number(x.manual_progress_percent);x.agreed_amount_minor=x.agreed_amount_minor===null?null:Number(x.agreed_amount_minor);x.portal_visible=Number(x.portal_visible||0);
  x.agreed_amount=amountFromMinor(x.agreed_amount_minor);
  x.is_archived=Boolean(x.archived_at);
  return x;
}
async function supportedCurrencies(env){
  const {results=[]}=await env.DB.prepare(`SELECT option_key code,sort_order FROM inquiry_option_items WHERE group_key='currency' AND is_active=1 ORDER BY sort_order,id`).all();
  return results.map(x=>String(x.code||'').toUpperCase()).filter(x=>CURRENCY_RE.test(x));
}
async function requireSupportedCurrency(env,value,{required=false}={}){
  const v=currencyCode(value);if(!v&&!required)return null;if(!v)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Currency is required when an agreed amount is provided.',422,[{field:'currency',code:'required'}]);
  const currencies=await supportedCurrencies(env);if(!currencies.includes(v))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Unsupported currency.',422,[{field:'currency',code:'unsupported'}]);return v;
}
async function requireActiveClient(env,id){
  const row=await env.DB.prepare(`SELECT id,public_id,client_code,display_name,status,default_currency FROM clients WHERE id=? LIMIT 1`).bind(id).first();
  if(!row)throw new ApiError('CLIENT_PROJECT_CLIENT_NOT_FOUND','Client not found.',404);
  if(row.status!=='active')throw new ApiError('CLIENT_PROJECT_CLIENT_INACTIVE','Only active clients can receive a new Client Project.',409);
  return {...row,id:Number(row.id)};
}
async function requireProject(env,id,{allowArchived=true}={}){
  const row=await env.DB.prepare(`SELECT id,public_id,project_code,client_id,name,status,priority,progress_mode,manual_progress_percent,currency,agreed_amount_minor,portal_visible,archived_at FROM client_projects WHERE id=? LIMIT 1`).bind(id).first();
  if(!row)throw new ApiError('CLIENT_PROJECT_NOT_FOUND','Client Project not found.',404);
  const p=normalizeProjectRow(row);if(!allowArchived&&p.archived_at)throw new ApiError('CLIENT_PROJECT_ARCHIVED','Restore the Client Project before editing it.',409);return p;
}
function validateDates(start,target){if(start&&target&&target<start)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Target date cannot be before start date.',422,[{field:'target_date',code:'before_start'}])}
function validateTransition(from,to){if(to===from)return;if(!(PROJECT_STATUS_TRANSITIONS[from]||[]).includes(to))throw new ApiError('CLIENT_PROJECT_STATUS_TRANSITION_INVALID','This project status transition is not allowed.',409,[{field:'status',code:'invalid_transition',from,to}])}
function parseServiceItems(value){
  if(value===undefined)return undefined;if(!Array.isArray(value))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','services must be an array.',422,[{field:'services',code:'invalid'}]);
  const seen=new Set();return value.map((raw,index)=>{const serviceId=integer(raw?.service_id,{field:`services.${index}.service_id`,min:1});if(seen.has(serviceId))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Duplicate project service.',422,[{field:'services',code:'duplicate'}]);seen.add(serviceId);return {service_id:serviceId,sort_order:integer(raw?.sort_order??index,{field:`services.${index}.sort_order`,min:0,max:9999}),scope_note:text(raw?.scope_note,1000,{field:`services.${index}.scope_note`})}});
}
function parseMemberItems(value){
  if(value===undefined)return undefined;if(!Array.isArray(value))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','members must be an array.',422,[{field:'members',code:'invalid'}]);
  const seen=new Set();let leads=0;const items=value.map((raw,index)=>{const adminId=integer(raw?.admin_user_id,{field:`members.${index}.admin_user_id`,min:1});if(seen.has(adminId))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Duplicate project member.',422,[{field:'members',code:'duplicate'}]);seen.add(adminId);const isLead=raw?.is_lead===true||raw?.is_lead===1||raw?.is_lead==='1'||raw?.is_lead==='true'?1:0;if(isLead)leads++;const role=String(raw?.role_key??'').trim().toLowerCase();if(role&&!ROLE_RE.test(role))throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Invalid project member role key.',422,[{field:`members.${index}.role_key`,code:'invalid'}]);return {admin_user_id:adminId,role_key:role||null,is_lead:isLead}});if(leads>1)throw new ApiError('CLIENT_PROJECT_VALIDATION_FAILED','Only one project lead is allowed.',422,[{field:'members',code:'multiple_leads'}]);return items;
}
async function validateServices(env,items){if(items===undefined)return;for(const item of items){const row=await env.DB.prepare('SELECT id FROM services WHERE id=? LIMIT 1').bind(item.service_id).first();if(!row)throw new ApiError('CLIENT_PROJECT_SERVICE_NOT_FOUND','Selected service was not found.',422,[{field:'services',code:'service_not_found',service_id:item.service_id}])}}
async function validateMembers(env,items){if(items===undefined)return;for(const item of items){const row=await env.DB.prepare('SELECT id,is_active FROM admin_users WHERE id=? LIMIT 1').bind(item.admin_user_id).first();if(!row||Number(row.is_active)!==1)throw new ApiError('CLIENT_PROJECT_MEMBER_NOT_AVAILABLE','Selected Admin member is not available.',422,[{field:'members',code:'admin_not_available',admin_user_id:item.admin_user_id}])}}

export async function adminClientProjectConfig(env){
  const [currencies,services,admins]=await Promise.all([
    supportedCurrencies(env),
    env.DB.prepare(`SELECT id,slug,title_ar,title_en,icon_key,is_active FROM services ORDER BY sort_order,id`).all(),
    env.DB.prepare(`SELECT id,name,email FROM admin_users WHERE is_active=1 ORDER BY name,id`).all()
  ]);
  return {
    statuses:CLIENT_PROJECT_STATUSES,filter_statuses:CLIENT_PROJECT_FILTER_STATUSES,priorities:CLIENT_PROJECT_PRIORITIES,progress_modes:CLIENT_PROJECT_PROGRESS_MODES,
    status_transitions:PROJECT_STATUS_TRANSITIONS,currencies,default_currency:currencies[0]||null,
    execution:{progress_modes:EXECUTION_PROGRESS_MODES,milestone_statuses:MILESTONE_STATUSES,task_statuses:TASK_STATUSES,task_priorities:TASK_PRIORITIES},
    services:(services.results||[]).map(x=>({...x,id:Number(x.id),is_active:Number(x.is_active||0)})),
    admins:(admins.results||[]).map(x=>({...x,id:Number(x.id)})),
    project_code:{prefix:'PRJ-',minimum_digits:3,server_generated:true},
    money:{minor_digits:2,server_parsed:true}
  };
}

export async function adminClientProjectList(env,url){
  const status=String(url.searchParams.get('status')||'').trim();if(status&&!CLIENT_PROJECT_FILTER_STATUSES.includes(status))throw new ApiError('CLIENT_PROJECT_STATUS_INVALID','Invalid Client Project status filter.',422);
  const priority=String(url.searchParams.get('priority')||'').trim();if(priority&&!CLIENT_PROJECT_PRIORITIES.includes(priority))throw new ApiError('CLIENT_PROJECT_PRIORITY_INVALID','Invalid Client Project priority filter.',422);
  const clientIdRaw=String(url.searchParams.get('client_id')||'').trim();const clientId=clientIdRaw?integer(clientIdRaw,{field:'client_id',min:1}):null;
  const q=String(url.searchParams.get('q')||'').trim().slice(0,160),cursor=decodeCursor(url.searchParams.get('cursor'));const where=[],params=[];
  if(status==='archived')where.push('p.archived_at IS NOT NULL');else if(status){where.push('p.archived_at IS NULL');where.push('p.status=?');params.push(status)}
  if(priority){where.push('p.priority=?');params.push(priority)}if(clientId){where.push('p.client_id=?');params.push(clientId)}
  if(q){const like=`%${q}%`;where.push('(p.name LIKE ? OR p.project_code LIKE ? OR p.public_id LIKE ? OR c.display_name LIKE ? OR c.client_code LIKE ?)');params.push(like,like,like,like,like)}
  if(cursor){where.push('(p.updated_at<? OR (p.updated_at=? AND p.id<?))');params.push(cursor.updated_at,cursor.updated_at,cursor.id)}
  const sql=`SELECT p.id,p.public_id,p.project_code,p.client_id,p.name,p.status,p.priority,p.progress_mode,p.manual_progress_percent,p.start_date,p.target_date,p.agreed_amount_minor,p.currency,p.portal_visible,p.created_at,p.updated_at,p.archived_at,c.client_code,c.display_name client_display_name,
    (SELECT COUNT(*) FROM client_project_services ps WHERE ps.client_project_id=p.id) service_count,
    (SELECT COUNT(*) FROM client_project_members pm WHERE pm.client_project_id=p.id) member_count,
    (SELECT COUNT(*) FROM inquiry_project_links il WHERE il.client_project_id=p.id) inquiry_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=p.id AND t.archived_at IS NULL AND t.status<>'cancelled') task_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=p.id AND t.archived_at IS NULL AND t.status='done') task_done_count
    FROM client_projects p JOIN clients c ON c.id=p.client_id${where.length?' WHERE '+where.join(' AND '):''} ORDER BY p.updated_at DESC,p.id DESC LIMIT ${PAGE_SIZE+1}`;
  const {results=[]}=await env.DB.prepare(sql).bind(...params).all();const hasMore=results.length>PAGE_SIZE,items=results.slice(0,PAGE_SIZE).map(x=>{const item={...normalizeProjectRow(x),service_count:Number(x.service_count||0),member_count:Number(x.member_count||0),inquiry_count:Number(x.inquiry_count||0),task_count:Number(x.task_count||0),task_done_count:Number(x.task_done_count||0)};item.calculated_progress_percent=item.task_count>0?Math.round((item.task_done_count/item.task_count)*100):0;item.effective_progress_percent=item.progress_mode==='calculated'?item.calculated_progress_percent:Number(item.manual_progress_percent||0);return item}),last=items[items.length-1];
  return {items,meta:{count:items.length,has_more:hasMore,next_cursor:hasMore&&last?encodeCursor(last):null}};
}

export async function adminClientProjectFind(env,id){
  const row=await env.DB.prepare(`SELECT p.*,c.public_id client_public_id,c.client_code,c.display_name client_display_name,c.status client_status,ca.name created_by_admin_name,ua.name updated_by_admin_name FROM client_projects p JOIN clients c ON c.id=p.client_id LEFT JOIN admin_users ca ON ca.id=p.created_by_admin_id LEFT JOIN admin_users ua ON ua.id=p.updated_by_admin_id WHERE p.id=? LIMIT 1`).bind(id).first();
  if(!row)return null;const project=normalizeProjectRow(row);
  const [services,members,inquiries]=await Promise.all([
    env.DB.prepare(`SELECT ps.service_id,ps.sort_order,ps.scope_note,s.slug,s.title_ar,s.title_en,s.icon_key,s.is_active FROM client_project_services ps JOIN services s ON s.id=ps.service_id WHERE ps.client_project_id=? ORDER BY ps.sort_order,s.id`).bind(id).all(),
    env.DB.prepare(`SELECT pm.admin_user_id,pm.role_key,pm.is_lead,pm.joined_at,a.name,a.email,a.is_active FROM client_project_members pm JOIN admin_users a ON a.id=pm.admin_user_id WHERE pm.client_project_id=? ORDER BY pm.is_lead DESC,a.name,a.id`).bind(id).all(),
    env.DB.prepare(`SELECT l.project_inquiry_id,l.linked_at,i.public_id,i.client_request_id,i.name,i.email,i.status,a.name linked_by_admin_name FROM inquiry_project_links l JOIN project_inquiries i ON i.id=l.project_inquiry_id LEFT JOIN admin_users a ON a.id=l.linked_by_admin_id WHERE l.client_project_id=? ORDER BY l.linked_at DESC,l.project_inquiry_id DESC`).bind(id).all()
  ]);
  project.services=(services.results||[]).map(x=>({...x,service_id:Number(x.service_id),sort_order:Number(x.sort_order||0),is_active:Number(x.is_active||0)}));
  project.members=(members.results||[]).map(x=>({...x,admin_user_id:Number(x.admin_user_id),is_lead:Number(x.is_lead||0),is_active:Number(x.is_active||0)}));
  project.inquiries=(inquiries.results||[]).map(x=>({...x,project_inquiry_id:Number(x.project_inquiry_id)}));
  const execution=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status<>'cancelled') task_count,(SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status='done') task_done_count,(SELECT COUNT(*) FROM client_project_milestones m WHERE m.client_project_id=? AND m.archived_at IS NULL) milestone_count`).bind(id,id,id).first()||{};
  project.task_count=Number(execution.task_count||0);project.task_done_count=Number(execution.task_done_count||0);project.milestone_count=Number(execution.milestone_count||0);project.calculated_progress_percent=project.task_count>0?Math.round((project.task_done_count/project.task_count)*100):0;project.effective_progress_percent=project.progress_mode==='calculated'?project.calculated_progress_percent:Number(project.manual_progress_percent||0);
  project.allowed_statuses=[project.status,...(PROJECT_STATUS_TRANSITIONS[project.status]||[])];
  return project;
}

function projectBasePayload(d,{creating=false,current=null}={}){
  const start=dateOnly(d.start_date,{field:'start_date'}),target=dateOnly(d.target_date,{field:'target_date'});validateDates(start,target);
  const amount=moneyMinor(d.agreed_amount);
  return {
    client_id:creating?integer(d.client_id,{field:'client_id',min:1}):current?.client_id,
    name:text(d.name,190,{required:true,field:'name'}),description:text(d.description,10000,{field:'description'}),
    status:creating?'planning':enumValue(d.status,CLIENT_PROJECT_STATUSES,{field:'status'}),priority:enumValue(d.priority??'normal',CLIENT_PROJECT_PRIORITIES,{field:'priority'}),
    progress_mode:creating?'manual':(current?.progress_mode||'manual'),manual_progress_percent:integer(d.manual_progress_percent??0,{field:'manual_progress_percent',min:0,max:100}),start_date:start,target_date:target,
    agreed_amount_minor:amount,currency:currencyCode(d.currency)
  };
}

async function relationDiffStatements(env,projectId,services,members){
  const statements=[];
  if(services!==undefined){
    const {results:old=[]}=await env.DB.prepare('SELECT service_id FROM client_project_services WHERE client_project_id=?').bind(projectId).all();const next=new Set(services.map(x=>x.service_id));
    for(const row of old)if(!next.has(Number(row.service_id)))statements.push(env.DB.prepare('DELETE FROM client_project_services WHERE client_project_id=? AND service_id=?').bind(projectId,Number(row.service_id)));
    for(const item of services)statements.push(env.DB.prepare(`INSERT INTO client_project_services(client_project_id,service_id,sort_order,scope_note) VALUES(?,?,?,?) ON CONFLICT(client_project_id,service_id) DO UPDATE SET sort_order=excluded.sort_order,scope_note=excluded.scope_note`).bind(projectId,item.service_id,item.sort_order,item.scope_note));
  }
  if(members!==undefined){
    const {results:old=[]}=await env.DB.prepare('SELECT admin_user_id FROM client_project_members WHERE client_project_id=?').bind(projectId).all();const next=new Set(members.map(x=>x.admin_user_id));
    for(const row of old)if(!next.has(Number(row.admin_user_id))){const adminId=Number(row.admin_user_id);let assigned={n:0};try{assigned=await env.DB.prepare(`SELECT COUNT(*) n FROM client_project_task_assignees ta JOIN client_project_tasks t ON t.id=ta.client_project_task_id WHERE t.client_project_id=? AND ta.admin_user_id=? AND t.archived_at IS NULL`).bind(projectId,adminId).first()||{n:0}}catch{}if(Number(assigned.n||0)>0)throw new ApiError('CLIENT_PROJECT_MEMBER_HAS_TASKS','Reassign or archive this member tasks before removing them from the project.',409,[{field:'members',code:'assigned_tasks',admin_user_id:adminId,count:Number(assigned.n||0)}]);statements.push(env.DB.prepare('DELETE FROM client_project_members WHERE client_project_id=? AND admin_user_id=?').bind(projectId,adminId))}
    for(const item of members)statements.push(env.DB.prepare(`INSERT INTO client_project_members(client_project_id,admin_user_id,role_key,is_lead,joined_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(client_project_id,admin_user_id) DO UPDATE SET role_key=excluded.role_key,is_lead=excluded.is_lead`).bind(projectId,item.admin_user_id,item.role_key,item.is_lead));
  }
  return statements;
}

export async function adminClientProjectCreate(request,env,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const d=await readJson(request,env);const p=projectBasePayload(d,{creating:true});const client=await requireActiveClient(env,p.client_id);
  p.currency=await requireSupportedCurrency(env,p.currency||client.default_currency,{required:p.agreed_amount_minor!==null});
  const services=parseServiceItems(d.services),members=parseMemberItems(d.members??[{admin_user_id:auth.user.id,role_key:'project_lead',is_lead:true}]);await validateServices(env,services);await validateMembers(env,members);
  const pid=publicId();const batch=[env.DB.prepare(`INSERT INTO client_projects(public_id,project_code,client_id,name,description,status,priority,progress_mode,manual_progress_percent,start_date,target_date,completed_at,agreed_amount_minor,currency,portal_visible,created_by_admin_id,updated_by_admin_id,created_at,updated_at,archived_at) VALUES(?,NULL,?,?,?,'planning',?,'manual',?,?,?,NULL,?,?,0,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)`).bind(pid,p.client_id,p.name,p.description,p.priority,p.manual_progress_percent,p.start_date,p.target_date,p.agreed_amount_minor,p.currency,auth.user.id,auth.user.id),env.DB.prepare(`UPDATE client_projects SET project_code='PRJ-' || printf('%03d',id) WHERE public_id=?`).bind(pid)];
  if(services)for(const item of services)batch.push(env.DB.prepare(`INSERT INTO client_project_services(client_project_id,service_id,sort_order,scope_note) SELECT id,?,?,? FROM client_projects WHERE public_id=?`).bind(item.service_id,item.sort_order,item.scope_note,pid));
  if(members)for(const item of members)batch.push(env.DB.prepare(`INSERT INTO client_project_members(client_project_id,admin_user_id,role_key,is_lead,joined_at) SELECT id,?,?,?,CURRENT_TIMESTAMP FROM client_projects WHERE public_id=?`).bind(item.admin_user_id,item.role_key,item.is_lead,pid));
  try{await env.DB.batch(batch)}catch(err){if(isConstraintError(err))throw new ApiError('CLIENT_PROJECT_CREATE_CONFLICT','Client Project could not be created because a relational or identity constraint was violated.',409);throw err}
  const created=await env.DB.prepare('SELECT id,project_code FROM client_projects WHERE public_id=? LIMIT 1').bind(pid).first();await audit(env,{adminId:auth.user.id,action:'client_project.create',entityType:'client_project',entityId:String(created.id),rid,ip:clientIp(request),context:{public_id:pid,project_code:created.project_code,client_id:p.client_id,status:'planning'}});return adminClientProjectFind(env,Number(created.id));
}

export async function adminClientProjectUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const current=await requireProject(env,id,{allowArchived:false});const d=await readJson(request,env);const p=projectBasePayload(d,{current});validateTransition(current.status,p.status);
  p.currency=await requireSupportedCurrency(env,p.currency,{required:p.agreed_amount_minor!==null});const services=parseServiceItems(d.services),members=parseMemberItems(d.members);await validateServices(env,services);await validateMembers(env,members);
  if(p.status==='completed')p.manual_progress_percent=100;
  const completedSql=p.status==='completed'?`COALESCE(completed_at,CURRENT_TIMESTAMP)`:current.status==='completed'&&p.status!=='completed'?'NULL':'completed_at';
  const batch=[env.DB.prepare(`UPDATE client_projects SET name=?,description=?,status=?,priority=?,progress_mode=?,manual_progress_percent=?,start_date=?,target_date=?,completed_at=${completedSql},agreed_amount_minor=?,currency=?,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL`).bind(p.name,p.description,p.status,p.priority,p.progress_mode,p.manual_progress_percent,p.start_date,p.target_date,p.agreed_amount_minor,p.currency,auth.user.id,id),...(await relationDiffStatements(env,id,services,members))];
  try{await env.DB.batch(batch)}catch(err){if(isConstraintError(err))throw new ApiError('CLIENT_PROJECT_UPDATE_CONFLICT','Client Project update conflicted with a protected relation.',409);throw err}
  await audit(env,{adminId:auth.user.id,action:'client_project.update',entityType:'client_project',entityId:String(id),rid,ip:clientIp(request),context:{project_code:current.project_code,from_status:current.status,to_status:p.status,priority:p.priority,service_count:services?.length??null,member_count:members?.length??null}});const result=await adminClientProjectFind(env,id);await publishProjectEvent(env,id,{type:'project.updated',visibility:'client'});return result;
}

export async function adminClientProjectLifecycle(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const current=await requireProject(env,id);const d=await readJson(request,env);const action=String(d.action||'').trim();
  if(action==='archive'){
    if(current.archived_at)throw new ApiError('CLIENT_PROJECT_LIFECYCLE_INVALID','Client Project is already archived.',409);
    await env.DB.batch([
      env.DB.prepare(`UPDATE client_projects SET archived_at=CURRENT_TIMESTAMP,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,id),
      env.DB.prepare(`UPDATE client_project_access_grants SET revoked_at=CURRENT_TIMESTAMP,status='revoked',updated_at=CURRENT_TIMESTAMP WHERE client_project_id=? AND revoked_at IS NULL`).bind(id),
      env.DB.prepare(`UPDATE client_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE revoked_at IS NULL AND access_grant_id IN (SELECT id FROM client_project_access_grants WHERE client_project_id=?)`).bind(id)
    ]);
  }else if(action==='restore'){
    if(!current.archived_at)throw new ApiError('CLIENT_PROJECT_LIFECYCLE_INVALID','Client Project is not archived.',409);
    await env.DB.prepare(`UPDATE client_projects SET archived_at=NULL,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,id).run();
  }else throw new ApiError('CLIENT_PROJECT_LIFECYCLE_INVALID','Invalid Client Project lifecycle action.',422,[{field:'action',code:'invalid'}]);
  await audit(env,{adminId:auth.user.id,action:'client_project.lifecycle',entityType:'client_project',entityId:String(id),rid,ip:clientIp(request),context:{project_code:current.project_code,action}});const result=await adminClientProjectFind(env,id);await publishProjectEvent(env,id,{type:`project.${action}`,visibility:'client'});return result;
}

export async function adminClientProjectInquiryOptions(env,id,url){
  const project=await requireProject(env,id);const q=String(url.searchParams.get('q')||'').trim().slice(0,160),params=[project.client_id],where=[`ic.client_id=?`];if(q){const like=`%${q}%`;where.push('(i.name LIKE ? OR i.email LIKE ? OR i.public_id LIKE ? OR i.client_request_id LIKE ?)');params.push(like,like,like,like)}
  const {results=[]}=await env.DB.prepare(`SELECT i.id,i.public_id,i.client_request_id,i.name,i.email,i.status,i.created_at FROM inquiry_conversions ic JOIN project_inquiries i ON i.id=ic.project_inquiry_id WHERE ${where.join(' AND ')} AND NOT EXISTS(SELECT 1 FROM inquiry_project_links l WHERE l.project_inquiry_id=i.id AND l.client_project_id=?) ORDER BY i.created_at DESC,i.id DESC LIMIT 50`).bind(...params,id).all();return results.map(x=>({...x,id:Number(x.id)}));
}

export async function adminClientProjectInquiryLink(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const project=await requireProject(env,id,{allowArchived:false});const d=await readJson(request,env);const inquiryId=integer(d.project_inquiry_id,{field:'project_inquiry_id',min:1});
  const inquiry=await env.DB.prepare(`SELECT i.id,ic.client_id FROM project_inquiries i LEFT JOIN inquiry_conversions ic ON ic.project_inquiry_id=i.id WHERE i.id=? LIMIT 1`).bind(inquiryId).first();if(!inquiry)throw new ApiError('CLIENT_PROJECT_INQUIRY_NOT_FOUND','Inquiry not found.',404);if(!inquiry.client_id)throw new ApiError('CLIENT_PROJECT_INQUIRY_NOT_CONVERTED','Inquiry must be converted to a Client before it can be linked to a Client Project.',409);if(Number(inquiry.client_id)!==Number(project.client_id))throw new ApiError('CLIENT_PROJECT_INQUIRY_CLIENT_MISMATCH','Inquiry belongs to a different Client.',409);
  const existing=await env.DB.prepare('SELECT 1 ok FROM inquiry_project_links WHERE project_inquiry_id=? AND client_project_id=? LIMIT 1').bind(inquiryId,id).first();if(existing)return {already_linked:true,project:await adminClientProjectFind(env,id)};
  await env.DB.prepare(`INSERT INTO inquiry_project_links(project_inquiry_id,client_project_id,linked_by_admin_id,linked_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(inquiryId,id,auth.user.id).run();await audit(env,{adminId:auth.user.id,action:'client_project.inquiry_link',entityType:'client_project',entityId:String(id),rid,ip:clientIp(request),context:{project_code:project.project_code,project_inquiry_id:inquiryId}});return {already_linked:false,project:await adminClientProjectFind(env,id)};
}
