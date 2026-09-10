'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { intVar, isEmail, isHttpUrl, isSlug, emptyToNull } from '../../core/validation.js';
import { rateAllow } from '../../core/rate-limit.js';

export async function inquiryConfig(env) {
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

export async function createInquiry(request, env) {
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
