'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';

export const ADMIN_STATUSES = ['new','reviewing','qualified','contacted','proposal_sent','won','lost','spam','archived'];

export async function adminInquiryList(env,url){
  const status=String(url.searchParams.get('status')||'').trim(), search=String(url.searchParams.get('q')||'').trim(); const where=[],params=[];
  if(status){where.push('i.status=?');params.push(status);} if(search){where.push('(i.name LIKE ? OR i.email LIKE ? OR i.company LIKE ? OR i.public_id LIKE ?)');const q=`%${search}%`;params.push(q,q,q,q);}
  const sql=`SELECT i.id,i.public_id,i.name,i.email,i.phone,i.company,i.status,i.submission_language,i.source_service_slug,i.source_package_key,i.created_at,i.updated_at,s.title_ar source_service_title_ar,s.title_en source_service_title_en FROM project_inquiries i LEFT JOIN services s ON s.slug=i.source_service_slug${where.length?' WHERE '+where.join(' AND '):''} ORDER BY i.created_at DESC,i.id DESC LIMIT 100`;
  const {results=[]}=await env.DB.prepare(sql).bind(...params).all();return results.map(x=>({...x,id:Number(x.id)}));
}

export async function adminInquiryFind(env,id){
  const r=await env.DB.prepare(`SELECT i.*,a.name assigned_admin_name,ps.label_ar project_stage_label_ar,ps.label_en project_stage_label_en,tl.label_ar timeline_label_ar,tl.label_en timeline_label_en,bm.label_ar budget_mode_label_ar,bm.label_en budget_mode_label_en,ss.title_ar source_service_title_ar,ss.title_en source_service_title_en FROM project_inquiries i LEFT JOIN admin_users a ON a.id=i.assigned_admin_id LEFT JOIN inquiry_option_items ps ON ps.group_key='project_stage' AND ps.option_key=i.project_stage_key LEFT JOIN inquiry_option_items tl ON tl.group_key='timeline' AND tl.option_key=i.timeline_key LEFT JOIN inquiry_option_items bm ON bm.group_key='budget_mode' AND bm.option_key=i.budget_mode_key LEFT JOIN services ss ON ss.slug=i.source_service_slug WHERE i.id=? LIMIT 1`).bind(id).first(); if(!r)return null; r.id=Number(r.id);
  const [sv,h,conversion]=await Promise.all([
    env.DB.prepare(`SELECT s.id,s.slug,s.title_ar,s.title_en,s.icon_key FROM project_inquiry_services pis JOIN services s ON s.id=pis.service_id WHERE pis.project_inquiry_id=? ORDER BY pis.sort_order,s.id`).bind(id).all(),
    env.DB.prepare(`SELECT h.id,h.from_status,h.to_status,h.note,h.created_at,a.name changed_by FROM project_inquiry_status_history h LEFT JOIN admin_users a ON a.id=h.changed_by_admin_id WHERE h.project_inquiry_id=? ORDER BY h.created_at DESC,h.id DESC`).bind(id).all(),
    env.DB.prepare(`SELECT ic.id,ic.client_id,ic.converted_at,c.public_id client_public_id,c.display_name client_display_name,c.status client_status,a.name converted_by_admin_name FROM inquiry_conversions ic JOIN clients c ON c.id=ic.client_id LEFT JOIN admin_users a ON a.id=ic.converted_by_admin_id WHERE ic.project_inquiry_id=? LIMIT 1`).bind(id).first()
  ]);
  r.services=(sv.results||[]).map(x=>({...x,id:Number(x.id)}));r.history=(h.results||[]).map(x=>({...x,id:Number(x.id)}));r.conversion=conversion?{...conversion,id:Number(conversion.id),client_id:Number(conversion.client_id)}:null;return r;
}

export async function adminInquiryUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);const d=await readJson(request,env);const status=String(d.status||'').trim(),notes=String(d.internal_notes||'').trim(),statusNote=String(d.status_note||'').trim();
  if(!ADMIN_STATUSES.includes(status))throw new ApiError('ADMIN_INQUIRY_STATUS_INVALID','Invalid inquiry status.',422);if(notes.length>20000)throw new ApiError('ADMIN_NOTES_TOO_LONG','Internal notes are too long.',422);if(statusNote.length>2000)throw new ApiError('ADMIN_STATUS_NOTE_TOO_LONG','Status note is too long.',422);
  const old=await env.DB.prepare('SELECT status FROM project_inquiries WHERE id=? LIMIT 1').bind(id).first();if(!old)throw new ApiError('ADMIN_INQUIRY_NOT_FOUND','Inquiry not found.',404);
  const contacted=['contacted','proposal_sent','won','lost'].includes(status)?1:0,closed=['won','lost','spam','archived'].includes(status)?1:0;
  const batch=[env.DB.prepare(`UPDATE project_inquiries SET status=?,internal_notes=?,assigned_admin_id=?,contacted_at=CASE WHEN ?=1 THEN COALESCE(contacted_at,CURRENT_TIMESTAMP) ELSE contacted_at END,closed_at=CASE WHEN ?=1 THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,notes||null,auth.user.id,contacted,closed,id)];
  if(old.status!==status)batch.push(env.DB.prepare(`INSERT INTO project_inquiry_status_history(project_inquiry_id,from_status,to_status,changed_by_admin_id,note,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,old.status,status,auth.user.id,statusNote||null));
  await env.DB.batch(batch);await audit(env,{adminId:auth.user.id,action:'inquiry.update',entityType:'project_inquiry',entityId:String(id),rid,ip:clientIp(request),context:{status}});return adminInquiryFind(env,id);
}
