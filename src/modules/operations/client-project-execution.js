'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';
import { publishProjectEvent } from '../../core/project-realtime.js';

export const MILESTONE_STATUSES=['pending','in_progress','completed','cancelled'];
export const TASK_STATUSES=['todo','in_progress','blocked','done','cancelled'];
export const TASK_PRIORITIES=['low','normal','high','urgent'];
export const EXECUTION_PROGRESS_MODES=['manual','calculated'];

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MILESTONE_TRANSITIONS={
  pending:['in_progress','completed','cancelled'],
  in_progress:['pending','completed','cancelled'],
  completed:['in_progress'],
  cancelled:['pending']
};
const TASK_TRANSITIONS={
  todo:['in_progress','blocked','done','cancelled'],
  in_progress:['todo','blocked','done','cancelled'],
  blocked:['todo','in_progress','done','cancelled'],
  done:['in_progress'],
  cancelled:['todo']
};

function text(value,max,{required=false,field='value'}={}){
  const v=String(value??'').trim();
  if(required&&!v)throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED',`${field} is required.`,422,[{field,code:'required'}]);
  if(v.length>max)throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED',`${field} is too long.`,422,[{field,code:'too_long'}]);
  return v||null;
}
function integer(value,{field,min=0,nullable=false}={}){
  if(nullable&&(value===null||value===undefined||String(value).trim()===''))return null;
  const n=Number(value);
  if(!Number.isInteger(n)||n<min)throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid'}]);
  return n;
}
function booleanFlag(value,defaultValue=0){if(value===undefined)return defaultValue;return value===true||value===1||value==='1'||value==='true'?1:0}
function enumValue(value,allowed,{field}={}){
  const v=String(value??'').trim();
  if(!allowed.includes(v))throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid'}]);
  return v;
}
function dateOnly(value,{field}={}){
  const v=String(value??'').trim();if(!v)return null;
  if(!DATE_RE.test(v))throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid_date'}]);
  const d=new Date(`${v}T00:00:00Z`);
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v)throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED',`Invalid ${field}.`,422,[{field,code:'invalid_date'}]);
  return v;
}
function validateDateOrder(start,due){if(start&&due&&due<start)throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED','Due date cannot be before start date.',422,[{field:'due_date',code:'before_start'}])}
function publicId(prefix){return `${prefix}_${crypto.randomUUID().replace(/-/g,'').slice(0,24)}`}
function validateTransition(from,to,map,field){if(from===to)return;if(!(map[from]||[]).includes(to))throw new ApiError('CLIENT_PROJECT_EXECUTION_TRANSITION_INVALID','This status transition is not allowed.',409,[{field,code:'invalid_transition',from,to}])}

async function requireProject(env,id,{allowArchived=true}={}){
  const row=await env.DB.prepare(`SELECT id,public_id,project_code,client_id,name,status,progress_mode,manual_progress_percent,archived_at FROM client_projects WHERE id=? LIMIT 1`).bind(id).first();
  if(!row)throw new ApiError('CLIENT_PROJECT_NOT_FOUND','Client Project not found.',404);
  row.id=Number(row.id);row.client_id=Number(row.client_id);
  if(!allowArchived&&row.archived_at)throw new ApiError('CLIENT_PROJECT_ARCHIVED','Archived Client Projects are read-only until restored.',409);
  return row;
}
async function requireMilestone(env,projectId,milestoneId,{allowArchived=true}={}){
  const row=await env.DB.prepare(`SELECT * FROM client_project_milestones WHERE id=? AND client_project_id=? LIMIT 1`).bind(milestoneId,projectId).first();
  if(!row)throw new ApiError('CLIENT_PROJECT_MILESTONE_NOT_FOUND','Milestone not found.',404);
  row.id=Number(row.id);row.client_project_id=Number(row.client_project_id);row.sort_order=Number(row.sort_order||0);row.client_visible=Number(row.client_visible||0);
  if(!allowArchived&&row.archived_at)throw new ApiError('CLIENT_PROJECT_MILESTONE_ARCHIVED','Archived milestones are read-only until restored.',409);
  return row;
}
async function requireTask(env,projectId,taskId,{allowArchived=true}={}){
  const row=await env.DB.prepare(`SELECT * FROM client_project_tasks WHERE id=? AND client_project_id=? LIMIT 1`).bind(taskId,projectId).first();
  if(!row)throw new ApiError('CLIENT_PROJECT_TASK_NOT_FOUND','Task not found.',404);
  row.id=Number(row.id);row.client_project_id=Number(row.client_project_id);row.milestone_id=row.milestone_id===null?null:Number(row.milestone_id);row.sort_order=Number(row.sort_order||0);row.client_visible=Number(row.client_visible||0);
  if(!allowArchived&&row.archived_at)throw new ApiError('CLIENT_PROJECT_TASK_ARCHIVED','Archived tasks are read-only until restored.',409);
  return row;
}
async function validateMilestoneForProject(env,projectId,milestoneId){
  if(milestoneId===null)return null;
  const row=await env.DB.prepare(`SELECT id,archived_at FROM client_project_milestones WHERE id=? AND client_project_id=? LIMIT 1`).bind(milestoneId,projectId).first();
  if(!row)throw new ApiError('CLIENT_PROJECT_TASK_MILESTONE_INVALID','Selected milestone does not belong to this project.',422,[{field:'milestone_id',code:'invalid_relation'}]);
  if(row.archived_at)throw new ApiError('CLIENT_PROJECT_TASK_MILESTONE_ARCHIVED','Archived milestones cannot receive task assignments.',409,[{field:'milestone_id',code:'archived'}]);
  return Number(row.id);
}
function parseAssignees(value){
  if(value===undefined)return undefined;if(!Array.isArray(value))throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED','assignees must be an array.',422,[{field:'assignees',code:'invalid'}]);
  const out=[],seen=new Set();
  for(const raw of value){const id=integer(raw?.admin_user_id??raw,{field:'admin_user_id',min:1});if(seen.has(id))throw new ApiError('CLIENT_PROJECT_EXECUTION_VALIDATION_FAILED','Duplicate task assignee.',422,[{field:'assignees',code:'duplicate'}]);seen.add(id);out.push(id)}
  return out;
}
async function validateAssignees(env,projectId,assignees){
  if(assignees===undefined)return;
  for(const adminId of assignees){const row=await env.DB.prepare(`SELECT pm.admin_user_id,a.is_active FROM client_project_members pm JOIN admin_users a ON a.id=pm.admin_user_id WHERE pm.client_project_id=? AND pm.admin_user_id=? LIMIT 1`).bind(projectId,adminId).first();if(!row||Number(row.is_active)!==1)throw new ApiError('CLIENT_PROJECT_TASK_ASSIGNEE_INVALID','Task assignees must be active members of this project.',422,[{field:'assignees',code:'not_project_member',admin_user_id:adminId}])}
}

function normalizeMilestone(row){return {...row,id:Number(row.id),client_project_id:Number(row.client_project_id),sort_order:Number(row.sort_order||0),client_visible:Number(row.client_visible||0),is_archived:Boolean(row.archived_at)}}
function normalizeTask(row){return {...row,id:Number(row.id),client_project_id:Number(row.client_project_id),milestone_id:row.milestone_id===null?null:Number(row.milestone_id),sort_order:Number(row.sort_order||0),client_visible:Number(row.client_visible||0),assignee_count:Number(row.assignee_count||0),is_archived:Boolean(row.archived_at)}}

export async function adminClientProjectExecutionSummary(env,projectId){
  const project=await requireProject(env,projectId);
  const row=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM client_project_milestones m WHERE m.client_project_id=? AND m.archived_at IS NULL) milestone_count,
    (SELECT COUNT(*) FROM client_project_milestones m WHERE m.client_project_id=? AND m.archived_at IS NULL AND m.status='completed') milestone_completed_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status<>'cancelled') task_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status='done') task_done_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status='in_progress') task_in_progress_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status='blocked') task_blocked_count,
    (SELECT COUNT(*) FROM client_project_tasks t WHERE t.client_project_id=? AND t.archived_at IS NULL AND t.status NOT IN('done','cancelled') AND t.due_date IS NOT NULL AND t.due_date<date('now')) task_overdue_count,
    (SELECT MIN(m.target_date) FROM client_project_milestones m WHERE m.client_project_id=? AND m.archived_at IS NULL AND m.status NOT IN('completed','cancelled') AND m.target_date IS NOT NULL) next_milestone_date
  `).bind(projectId,projectId,projectId,projectId,projectId,projectId,projectId,projectId).first()||{};
  const total=Number(row.task_count||0),done=Number(row.task_done_count||0),calculated=total>0?Math.round((done/total)*100):0;
  const effective=project.progress_mode==='calculated'?calculated:Number(project.manual_progress_percent||0);
  return {project_id:projectId,progress_mode:project.progress_mode||'manual',manual_progress_percent:Number(project.manual_progress_percent||0),calculated_progress_percent:calculated,effective_progress_percent:effective,milestone_count:Number(row.milestone_count||0),milestone_completed_count:Number(row.milestone_completed_count||0),task_count:total,task_done_count:done,task_in_progress_count:Number(row.task_in_progress_count||0),task_blocked_count:Number(row.task_blocked_count||0),task_overdue_count:Number(row.task_overdue_count||0),next_milestone_date:row.next_milestone_date||null};
}

export async function adminClientProjectMilestoneList(env,projectId){
  await requireProject(env,projectId);
  const {results=[]}=await env.DB.prepare(`SELECT m.*,(SELECT COUNT(*) FROM client_project_tasks t WHERE t.milestone_id=m.id AND t.archived_at IS NULL) task_count FROM client_project_milestones m WHERE m.client_project_id=? ORDER BY m.archived_at IS NOT NULL,m.sort_order,m.id`).bind(projectId).all();
  return results.map(x=>({...normalizeMilestone(x),task_count:Number(x.task_count||0)}));
}

export async function adminClientProjectMilestoneCreate(request,env,projectId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireProject(env,projectId,{allowArchived:false});const d=await readJson(request,env);
  const p={title:text(d.title,190,{required:true,field:'title'}),description:text(d.description,10000,{field:'description'}),sort_order:integer(d.sort_order??0,{field:'sort_order',min:0}),target_date:dateOnly(d.target_date,{field:'target_date'})};const pid=publicId('cpm');
  await env.DB.prepare(`INSERT INTO client_project_milestones(public_id,client_project_id,title,description,status,sort_order,target_date,completed_at,created_by_admin_id,updated_by_admin_id,created_at,updated_at,archived_at,client_visible) VALUES(?,?,?,?,'pending',?,?,NULL,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,?)`).bind(pid,projectId,p.title,p.description,p.sort_order,p.target_date,auth.user.id,auth.user.id,booleanFlag(d.client_visible,0)).run();
  const row=await env.DB.prepare(`SELECT * FROM client_project_milestones WHERE public_id=? LIMIT 1`).bind(pid).first();await audit(env,{adminId:auth.user.id,action:'client_project.milestone_create',entityType:'client_project_milestone',entityId:String(row.id),rid,ip:clientIp(request),context:{client_project_id:projectId,public_id:pid}});await publishProjectEvent(env,projectId,{type:'execution.updated',visibility:'client'});return normalizeMilestone(row);
}

export async function adminClientProjectMilestoneUpdate(request,env,projectId,milestoneId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireProject(env,projectId,{allowArchived:false});const current=await requireMilestone(env,projectId,milestoneId,{allowArchived:false});const d=await readJson(request,env);
  const status=enumValue(d.status,MILESTONE_STATUSES,{field:'status'});validateTransition(current.status,status,MILESTONE_TRANSITIONS,'status');const title=text(d.title,190,{required:true,field:'title'}),description=text(d.description,10000,{field:'description'}),sortOrder=integer(d.sort_order??0,{field:'sort_order',min:0}),target=dateOnly(d.target_date,{field:'target_date'});const completedSql=status==='completed'?`COALESCE(completed_at,CURRENT_TIMESTAMP)`:current.status==='completed'&&status!=='completed'?'NULL':'completed_at';
  await env.DB.prepare(`UPDATE client_project_milestones SET title=?,description=?,status=?,sort_order=?,target_date=?,client_visible=?,completed_at=${completedSql},updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_project_id=?`).bind(title,description,status,sortOrder,target,booleanFlag(d.client_visible,current.client_visible||0),auth.user.id,milestoneId,projectId).run();await audit(env,{adminId:auth.user.id,action:'client_project.milestone_update',entityType:'client_project_milestone',entityId:String(milestoneId),rid,ip:clientIp(request),context:{client_project_id:projectId,from_status:current.status,to_status:status}});await publishProjectEvent(env,projectId,{type:'execution.updated',visibility:'client'});return normalizeMilestone(await env.DB.prepare(`SELECT * FROM client_project_milestones WHERE id=?`).bind(milestoneId).first());
}

export async function adminClientProjectMilestoneLifecycle(request,env,projectId,milestoneId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireProject(env,projectId,{allowArchived:false});const current=await requireMilestone(env,projectId,milestoneId);const d=await readJson(request,env);const action=String(d.action||'').trim();
  if(action==='archive'){if(current.archived_at)throw new ApiError('CLIENT_PROJECT_MILESTONE_LIFECYCLE_INVALID','Milestone is already archived.',409);await env.DB.prepare(`UPDATE client_project_milestones SET archived_at=CURRENT_TIMESTAMP,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,milestoneId).run()}
  else if(action==='restore'){if(!current.archived_at)throw new ApiError('CLIENT_PROJECT_MILESTONE_LIFECYCLE_INVALID','Milestone is not archived.',409);await env.DB.prepare(`UPDATE client_project_milestones SET archived_at=NULL,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,milestoneId).run()}
  else throw new ApiError('CLIENT_PROJECT_MILESTONE_LIFECYCLE_INVALID','Invalid milestone lifecycle action.',422);
  await audit(env,{adminId:auth.user.id,action:'client_project.milestone_lifecycle',entityType:'client_project_milestone',entityId:String(milestoneId),rid,ip:clientIp(request),context:{client_project_id:projectId,action}});await publishProjectEvent(env,projectId,{type:'execution.updated',visibility:'client'});return normalizeMilestone(await env.DB.prepare(`SELECT * FROM client_project_milestones WHERE id=?`).bind(milestoneId).first());
}

export async function adminClientProjectTaskList(env,projectId,url){
  await requireProject(env,projectId);const where=['t.client_project_id=?'],params=[projectId];const status=String(url.searchParams.get('status')||'').trim();if(status){if(status==='archived')where.push('t.archived_at IS NOT NULL');else{if(!TASK_STATUSES.includes(status))throw new ApiError('CLIENT_PROJECT_TASK_STATUS_INVALID','Invalid task status filter.',422);where.push('t.archived_at IS NULL');where.push('t.status=?');params.push(status)}}
  const q=String(url.searchParams.get('q')||'').trim().slice(0,160);if(q){where.push('(t.title LIKE ? OR t.description LIKE ?)');const like=`%${q}%`;params.push(like,like)}
  const milestoneRaw=String(url.searchParams.get('milestone_id')||'').trim();if(milestoneRaw){const id=integer(milestoneRaw,{field:'milestone_id',min:1});where.push('t.milestone_id=?');params.push(id)}
  const {results=[]}=await env.DB.prepare(`SELECT t.*,m.title milestone_title,(SELECT COUNT(*) FROM client_project_task_assignees a WHERE a.client_project_task_id=t.id) assignee_count FROM client_project_tasks t LEFT JOIN client_project_milestones m ON m.id=t.milestone_id WHERE ${where.join(' AND ')} ORDER BY t.archived_at IS NOT NULL,t.sort_order,t.due_date IS NULL,t.due_date,t.id LIMIT 200`).bind(...params).all();
  const items=[];for(const row of results){const task=normalizeTask(row);const {results:assignees=[]}=await env.DB.prepare(`SELECT a.admin_user_id,a.assigned_at,u.name,u.email,u.is_active FROM client_project_task_assignees a JOIN admin_users u ON u.id=a.admin_user_id WHERE a.client_project_task_id=? ORDER BY u.name,u.id`).bind(task.id).all();task.assignees=assignees.map(x=>({...x,admin_user_id:Number(x.admin_user_id),is_active:Number(x.is_active||0)}));items.push(task)}return items;
}

export async function adminClientProjectTaskCreate(request,env,projectId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireProject(env,projectId,{allowArchived:false});const d=await readJson(request,env);const milestoneId=await validateMilestoneForProject(env,projectId,integer(d.milestone_id,{field:'milestone_id',min:1,nullable:true}));const start=dateOnly(d.start_date,{field:'start_date'}),due=dateOnly(d.due_date,{field:'due_date'});validateDateOrder(start,due);const assignees=parseAssignees(d.assignees||[]);await validateAssignees(env,projectId,assignees);const pid=publicId('cpt');
  const batch=[env.DB.prepare(`INSERT INTO client_project_tasks(public_id,client_project_id,milestone_id,title,description,status,priority,sort_order,start_date,due_date,completed_at,created_by_admin_id,updated_by_admin_id,created_at,updated_at,archived_at,client_visible) VALUES(?,?,?,?,?,'todo',?,?,?,?,NULL,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,?)`).bind(pid,projectId,milestoneId,text(d.title,190,{required:true,field:'title'}),text(d.description,10000,{field:'description'}),enumValue(d.priority??'normal',TASK_PRIORITIES,{field:'priority'}),integer(d.sort_order??0,{field:'sort_order',min:0}),start,due,auth.user.id,auth.user.id,booleanFlag(d.client_visible,0))];for(const adminId of assignees)batch.push(env.DB.prepare(`INSERT INTO client_project_task_assignees(client_project_task_id,client_project_id,admin_user_id,assigned_by_admin_id,assigned_at) SELECT id,client_project_id,?,?,CURRENT_TIMESTAMP FROM client_project_tasks WHERE public_id=?`).bind(adminId,auth.user.id,pid));await env.DB.batch(batch);const row=await env.DB.prepare(`SELECT id FROM client_project_tasks WHERE public_id=?`).bind(pid).first();await audit(env,{adminId:auth.user.id,action:'client_project.task_create',entityType:'client_project_task',entityId:String(row.id),rid,ip:clientIp(request),context:{client_project_id:projectId,public_id:pid,assignee_count:assignees.length}});await publishProjectEvent(env,projectId,{type:'execution.updated',visibility:'client'});return (await adminClientProjectTaskList(env,projectId,new URL(`https://local.invalid/?q=${encodeURIComponent(text(d.title,190,{required:true,field:'title'}))}`))).find(x=>x.id===Number(row.id))||normalizeTask(await env.DB.prepare(`SELECT * FROM client_project_tasks WHERE id=?`).bind(row.id).first());
}

async function replaceTaskAssignees(env,taskId,projectId,assignees,adminId){
  if(assignees===undefined)return;await validateAssignees(env,projectId,assignees);const {results:old=[]}=await env.DB.prepare(`SELECT admin_user_id FROM client_project_task_assignees WHERE client_project_task_id=?`).bind(taskId).all();const next=new Set(assignees);const batch=[];for(const row of old)if(!next.has(Number(row.admin_user_id)))batch.push(env.DB.prepare(`DELETE FROM client_project_task_assignees WHERE client_project_task_id=? AND admin_user_id=?`).bind(taskId,Number(row.admin_user_id)));for(const id of assignees)batch.push(env.DB.prepare(`INSERT INTO client_project_task_assignees(client_project_task_id,client_project_id,admin_user_id,assigned_by_admin_id,assigned_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(client_project_task_id,admin_user_id) DO NOTHING`).bind(taskId,projectId,id,adminId));if(batch.length)await env.DB.batch(batch);
}

export async function adminClientProjectTaskUpdate(request,env,projectId,taskId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireProject(env,projectId,{allowArchived:false});const current=await requireTask(env,projectId,taskId,{allowArchived:false});const d=await readJson(request,env);const status=enumValue(d.status,TASK_STATUSES,{field:'status'});validateTransition(current.status,status,TASK_TRANSITIONS,'status');const milestoneId=await validateMilestoneForProject(env,projectId,integer(d.milestone_id,{field:'milestone_id',min:1,nullable:true}));const start=dateOnly(d.start_date,{field:'start_date'}),due=dateOnly(d.due_date,{field:'due_date'});validateDateOrder(start,due);const assignees=parseAssignees(d.assignees);const completedSql=status==='done'?`COALESCE(completed_at,CURRENT_TIMESTAMP)`:current.status==='done'&&status!=='done'?'NULL':'completed_at';
  await env.DB.prepare(`UPDATE client_project_tasks SET milestone_id=?,title=?,description=?,status=?,priority=?,sort_order=?,start_date=?,due_date=?,client_visible=?,completed_at=${completedSql},updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_project_id=?`).bind(milestoneId,text(d.title,190,{required:true,field:'title'}),text(d.description,10000,{field:'description'}),status,enumValue(d.priority??current.priority,TASK_PRIORITIES,{field:'priority'}),integer(d.sort_order??0,{field:'sort_order',min:0}),start,due,booleanFlag(d.client_visible,current.client_visible||0),auth.user.id,taskId,projectId).run();await replaceTaskAssignees(env,taskId,projectId,assignees,auth.user.id);await audit(env,{adminId:auth.user.id,action:'client_project.task_update',entityType:'client_project_task',entityId:String(taskId),rid,ip:clientIp(request),context:{client_project_id:projectId,from_status:current.status,to_status:status,assignee_count:assignees?.length??null}});const tasks=await adminClientProjectTaskList(env,projectId,new URL('https://local.invalid/'));await publishProjectEvent(env,projectId,{type:'execution.updated',visibility:'client'});return tasks.find(x=>x.id===taskId);
}

export async function adminClientProjectTaskLifecycle(request,env,projectId,taskId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await requireProject(env,projectId,{allowArchived:false});const current=await requireTask(env,projectId,taskId);const d=await readJson(request,env);const action=String(d.action||'').trim();if(action==='archive'){if(current.archived_at)throw new ApiError('CLIENT_PROJECT_TASK_LIFECYCLE_INVALID','Task is already archived.',409);await env.DB.prepare(`UPDATE client_project_tasks SET archived_at=CURRENT_TIMESTAMP,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,taskId).run()}else if(action==='restore'){if(!current.archived_at)throw new ApiError('CLIENT_PROJECT_TASK_LIFECYCLE_INVALID','Task is not archived.',409);await env.DB.prepare(`UPDATE client_project_tasks SET archived_at=NULL,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,taskId).run()}else throw new ApiError('CLIENT_PROJECT_TASK_LIFECYCLE_INVALID','Invalid task lifecycle action.',422);await audit(env,{adminId:auth.user.id,action:'client_project.task_lifecycle',entityType:'client_project_task',entityId:String(taskId),rid,ip:clientIp(request),context:{client_project_id:projectId,action}});const tasks=await adminClientProjectTaskList(env,projectId,new URL('https://local.invalid/'));await publishProjectEvent(env,projectId,{type:'execution.updated',visibility:'client'});return tasks.find(x=>x.id===taskId);
}

export async function adminClientProjectProgressMode(request,env,projectId,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const project=await requireProject(env,projectId,{allowArchived:false});const d=await readJson(request,env);const mode=enumValue(d.progress_mode,EXECUTION_PROGRESS_MODES,{field:'progress_mode'});await env.DB.prepare(`UPDATE client_projects SET progress_mode=?,updated_by_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(mode,auth.user.id,projectId).run();await audit(env,{adminId:auth.user.id,action:'client_project.progress_mode',entityType:'client_project',entityId:String(projectId),rid,ip:clientIp(request),context:{project_code:project.project_code,from_mode:project.progress_mode,to_mode:mode}});await publishProjectEvent(env,projectId,{type:'project.updated',visibility:'client'});return adminClientProjectExecutionSummary(env,projectId);
}
