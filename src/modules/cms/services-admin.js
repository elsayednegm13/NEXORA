'use strict';

import { ApiError } from '../../core/errors.js';
import { clientIp, readJson } from '../../core/http.js';
import { bool, isSlug, ICON_RE, clamp, emptyToNull } from '../../core/validation.js';
import { requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';

function mapAdminService(r){return {id:Number(r.id),slug:r.slug,title_ar:r.title_ar,title_en:r.title_en,short_description_ar:r.short_description_ar||'',short_description_en:r.short_description_en||'',description_ar:r.description_ar||'',description_en:r.description_en||'',icon_key:r.icon_key||'custom',is_active:bool(r.is_active),is_featured:bool(r.is_featured),sort_order:Number(r.sort_order||0),seo_title_ar:r.seo_title_ar||'',seo_title_en:r.seo_title_en||'',seo_description_ar:r.seo_description_ar||'',seo_description_en:r.seo_description_en||'',updated_at:r.updated_at||null};}

export async function adminServiceList(env){const {results=[]}=await env.DB.prepare('SELECT * FROM services ORDER BY sort_order,id').all();return results.map(mapAdminService);}
export async function adminServiceFind(env,id){const r=await env.DB.prepare('SELECT * FROM services WHERE id=? LIMIT 1').bind(id).first();return r?mapAdminService(r):null;}
function validateAdminService(d){
  const v={};v.slug=String(d.slug||'').trim();if(!isSlug(v.slug))throw new ApiError('ADMIN_SERVICE_SLUG_INVALID','Invalid service slug.',422);
  for(const k of ['title_ar','title_en']){v[k]=String(d[k]||'').trim();if(!v[k]||v[k].length>190)throw new ApiError('ADMIN_SERVICE_TITLE_INVALID','Service title is required.',422);}
  for(const k of ['short_description_ar','short_description_en','description_ar','description_en','seo_title_ar','seo_title_en','seo_description_ar','seo_description_en'])v[k]=String(d[k]||'').trim();
  v.icon_key=String(d.icon_key||'custom').trim();if(!ICON_RE.test(v.icon_key))v.icon_key='custom';v.is_featured=Boolean(d.is_featured);v.is_active=Boolean(d.is_active);v.sort_order=clamp(d.sort_order,-10000,10000);return v;
}
export async function adminServiceUpdate(request,env,id,rid){
  assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);if(!(await adminServiceFind(env,id)))throw new ApiError('ADMIN_SERVICE_NOT_FOUND','Service not found.',404);const d=validateAdminService(await readJson(request,env));
  try{await env.DB.prepare(`UPDATE services SET slug=?,title_ar=?,title_en=?,short_description_ar=?,short_description_en=?,description_ar=?,description_en=?,icon_key=?,is_active=?,is_featured=?,sort_order=?,seo_title_ar=?,seo_title_en=?,seo_description_ar=?,seo_description_en=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(d.slug,d.title_ar,d.title_en,emptyToNull(d.short_description_ar),emptyToNull(d.short_description_en),emptyToNull(d.description_ar),emptyToNull(d.description_en),d.icon_key,d.is_active?1:0,d.is_featured?1:0,d.sort_order,emptyToNull(d.seo_title_ar),emptyToNull(d.seo_title_en),emptyToNull(d.seo_description_ar),emptyToNull(d.seo_description_en),id).run();}
  catch(err){if(String(err?.message||'').toLowerCase().includes('unique'))throw new ApiError('ADMIN_SERVICE_SLUG_EXISTS','Service slug already exists.',409);throw err;}
  await audit(env,{adminId:auth.user.id,action:'service.update',entityType:'service',entityId:String(id),rid,ip:clientIp(request),context:{slug:d.slug}});return adminServiceFind(env,id);
}
