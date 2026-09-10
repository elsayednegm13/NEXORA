'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { bool, isSlug, isHttpUrl, clamp, emptyToNull } from '../../core/validation.js';
import { requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';

function mapAdminProject(r){return {id:Number(r.id),slug:r.slug,title_ar:r.title_ar,title_en:r.title_en,short_description_ar:r.short_description_ar||'',short_description_en:r.short_description_en||'',description_ar:r.description_ar||'',description_en:r.description_en||'',challenge_ar:r.challenge_ar||'',challenge_en:r.challenge_en||'',solution_ar:r.solution_ar||'',solution_en:r.solution_en||'',website_url:r.website_url,domain:r.domain,status:r.status,cover_image:r.cover_image||'',is_featured:bool(r.is_featured),is_active:bool(r.is_active),sort_order:Number(r.sort_order||0),seo_title_ar:r.seo_title_ar||'',seo_title_en:r.seo_title_en||'',seo_description_ar:r.seo_description_ar||'',seo_description_en:r.seo_description_en||'',updated_at:r.updated_at||null};}

export async function adminProjectList(env){const {results=[]}=await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id ORDER BY p.sort_order,p.id`).all();return results.map(mapAdminProject);}
export async function adminProjectFind(env,id){const r=await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE p.id=? LIMIT 1`).bind(id).first();return r?mapAdminProject(r):null;}
function validateAdminProject(d){
  const v={};v.slug=String(d.slug||'').trim();if(!isSlug(v.slug))throw new ApiError('ADMIN_PROJECT_SLUG_INVALID','Invalid project slug.',422);
  for(const k of ['title_ar','title_en']){v[k]=String(d[k]||'').trim();if(!v[k]||v[k].length>255)throw new ApiError('ADMIN_PROJECT_TITLE_INVALID','Project title is required.',422);}
  for(const k of ['short_description_ar','short_description_en','description_ar','description_en','challenge_ar','challenge_en','solution_ar','solution_en','seo_title_ar','seo_title_en','seo_description_ar','seo_description_en'])v[k]=String(d[k]||'').trim();
  v.website_url=String(d.website_url||'').trim();if(!isHttpUrl(v.website_url))throw new ApiError('ADMIN_PROJECT_URL_INVALID','Project website URL is invalid.',422);
  v.domain=String(d.domain||'').trim();if(!v.domain||v.domain.length>255)throw new ApiError('ADMIN_PROJECT_DOMAIN_INVALID','Project domain is invalid.',422);
  v.status=String(d.status||'live').trim();if(!/^[a-z0-9_-]{2,40}$/.test(v.status))throw new ApiError('ADMIN_PROJECT_STATUS_INVALID','Project status is invalid.',422);
  v.is_featured=Boolean(d.is_featured);v.is_active=Boolean(d.is_active);v.sort_order=clamp(d.sort_order,-10000,10000);return v;
}
export async function adminProjectUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);if(!(await adminProjectFind(env,id)))throw new ApiError('ADMIN_PROJECT_NOT_FOUND','Project not found.',404);const d=validateAdminProject(await readJson(request,env));
  try{await env.DB.prepare(`UPDATE projects SET slug=?,title_ar=?,title_en=?,short_description_ar=?,short_description_en=?,description_ar=?,description_en=?,challenge_ar=?,challenge_en=?,solution_ar=?,solution_en=?,website_url=?,domain=?,status=?,is_featured=?,is_active=?,sort_order=?,seo_title_ar=?,seo_title_en=?,seo_description_ar=?,seo_description_en=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(d.slug,d.title_ar,d.title_en,emptyToNull(d.short_description_ar),emptyToNull(d.short_description_en),emptyToNull(d.description_ar),emptyToNull(d.description_en),emptyToNull(d.challenge_ar),emptyToNull(d.challenge_en),emptyToNull(d.solution_ar),emptyToNull(d.solution_en),d.website_url,d.domain,d.status,d.is_featured?1:0,d.is_active?1:0,d.sort_order,emptyToNull(d.seo_title_ar),emptyToNull(d.seo_title_en),emptyToNull(d.seo_description_ar),emptyToNull(d.seo_description_en),id).run();}
  catch(err){if(String(err?.message||'').toLowerCase().includes('unique'))throw new ApiError('ADMIN_PROJECT_SLUG_EXISTS','Project slug already exists.',409);throw err;}
  await audit(env,{adminId:auth.user.id,action:'project.update',entityType:'project',entityId:String(id),rid,ip:clientIp(request),context:{slug:d.slug}});return adminProjectFind(env,id);
}
