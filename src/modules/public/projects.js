'use strict';

import { ApiError } from '../../core/errors.js';
import { bool, isSlug } from '../../core/validation.js';

function mapProject(r) {
  return {
    id:Number(r.id), slug:r.slug, title:{ar:r.title_ar,en:r.title_en},
    short_description:{ar:r.short_description_ar||'',en:r.short_description_en||''},
    description:{ar:r.description_ar||'',en:r.description_en||''},
    challenge:{ar:r.challenge_ar||'',en:r.challenge_en||''}, solution:{ar:r.solution_ar||'',en:r.solution_en||''},
    website_url:r.website_url, domain:r.domain, status:r.status, cover_image:r.cover_image||'', is_featured:bool(r.is_featured), sort_order:Number(r.sort_order||0),
    seo:{title:{ar:r.seo_title_ar||'',en:r.seo_title_en||''},description:{ar:r.seo_description_ar||'',en:r.seo_description_en||''}}
  };
}

export async function listProjects(env) {
  const { results=[] } = await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE p.is_active=1 ORDER BY p.sort_order,p.id`).all();
  return results.map(mapProject);
}

export async function showProject(env, slug) {
  if (!isSlug(slug)) throw new ApiError('INVALID_SLUG', 'Invalid project slug.', 422);
  const row = await env.DB.prepare(`SELECT p.*,ma.url cover_image FROM projects p LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE p.slug=? AND p.is_active=1 LIMIT 1`).bind(slug).first();
  if (!row) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
  const p = mapProject(row);
  const [tech, svc, res, media] = await Promise.all([
    env.DB.prepare(`SELECT t.id,t.slug,t.name_ar,t.name_en,ma.url icon_url,pt.sort_order FROM project_technologies pt JOIN technologies t ON t.id=pt.technology_id AND t.is_active=1 LEFT JOIN media_assets ma ON ma.id=t.icon_media_id WHERE pt.project_id=? ORDER BY pt.sort_order,t.id`).bind(row.id).all(),
    env.DB.prepare(`SELECT s.id,s.slug,s.title_ar,s.title_en,s.icon_key,ps.sort_order FROM project_services ps JOIN services s ON s.id=ps.service_id AND s.is_active=1 WHERE ps.project_id=? ORDER BY ps.sort_order,s.id`).bind(row.id).all(),
    env.DB.prepare(`SELECT id,value,label_ar,label_en,note_ar,note_en FROM project_results WHERE project_id=? AND is_active=1 ORDER BY sort_order,id`).bind(row.id).all(),
    env.DB.prepare(`SELECT pm.id,ma.url,pm.alt_ar,pm.alt_en,pm.caption_ar,pm.caption_en FROM project_media pm JOIN media_assets ma ON ma.id=pm.media_id WHERE pm.project_id=? AND pm.is_active=1 ORDER BY pm.sort_order,pm.id`).bind(row.id).all()
  ]);
  p.technologies=(tech.results||[]).map(x=>({id:Number(x.id),slug:x.slug,name:{ar:x.name_ar,en:x.name_en},icon_url:x.icon_url||''}));
  p.services=(svc.results||[]).map(x=>({id:Number(x.id),slug:x.slug,name:{ar:x.title_ar,en:x.title_en},icon_url:''}));
  p.results=(res.results||[]).map(x=>({id:Number(x.id),value:x.value||'',label:{ar:x.label_ar,en:x.label_en},note:{ar:x.note_ar||'',en:x.note_en||''}}));
  p.gallery=(media.results||[]).map(x=>({id:Number(x.id),url:x.url,alt:{ar:x.alt_ar||'',en:x.alt_en||''},caption:{ar:x.caption_ar||'',en:x.caption_en||''}}));
  return p;
}
