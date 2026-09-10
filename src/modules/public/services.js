'use strict';

import { ApiError } from '../../core/errors.js';
import { bool, isSlug } from '../../core/validation.js';

function mapService(r) {
  return {
    id: Number(r.id), slug: r.slug,
    title: { ar: r.title_ar, en: r.title_en },
    shortDescription: { ar: r.short_description_ar || '', en: r.short_description_en || '' },
    description: { ar: r.description_ar || '', en: r.description_en || '' },
    icon: r.icon_key || 'custom', active: bool(r.is_active), featured: bool(r.is_featured), sortOrder: Number(r.sort_order || 0),
    seo: { title: { ar: r.seo_title_ar || '', en: r.seo_title_en || '' }, description: { ar: r.seo_description_ar || '', en: r.seo_description_en || '' } }
  };
}

export async function listServices(env) {
  const { results = [] } = await env.DB.prepare(`SELECT id,slug,title_ar,title_en,short_description_ar,short_description_en,description_ar,description_en,icon_key,is_active,is_featured,sort_order,seo_title_ar,seo_title_en,seo_description_ar,seo_description_en FROM services WHERE is_active=1 ORDER BY sort_order,id`).all();
  return results.map(mapService);
}

export async function showService(env, slug) {
  if (!isSlug(slug)) throw new ApiError('INVALID_SLUG', 'Invalid service slug.', 422);
  const row = await env.DB.prepare('SELECT * FROM services WHERE slug=? AND is_active=1 LIMIT 1').bind(slug).first();
  if (!row) throw new ApiError('SERVICE_NOT_FOUND', 'Service not found.', 404);
  const service = mapService(row);
  const [cap, tech, related] = await Promise.all([
    env.DB.prepare(`SELECT id,title_ar,title_en,description_ar,description_en,sort_order FROM service_capabilities WHERE service_id=? AND is_active=1 ORDER BY sort_order,id`).bind(row.id).all(),
    env.DB.prepare(`SELECT t.id,t.slug,t.name_ar,t.name_en,ma.url icon_url,st.sort_order FROM service_technologies st JOIN technologies t ON t.id=st.technology_id AND t.is_active=1 LEFT JOIN media_assets ma ON ma.id=t.icon_media_id WHERE st.service_id=? ORDER BY st.sort_order,t.id`).bind(row.id).all(),
    env.DB.prepare(`SELECT p.id,p.slug,p.title_ar,p.title_en,p.domain,ma.url image,ps.sort_order FROM project_services ps JOIN projects p ON p.id=ps.project_id AND p.is_active=1 LEFT JOIN media_assets ma ON ma.id=p.cover_media_id WHERE ps.service_id=? ORDER BY ps.sort_order,p.sort_order,p.id LIMIT 12`).bind(row.id).all()
  ]);
  service.capabilities = (cap.results || []).map(x => ({ id:Number(x.id), title:{ar:x.title_ar||'',en:x.title_en||''}, description:{ar:x.description_ar||'',en:x.description_en||''}, sortOrder:Number(x.sort_order||0) }));
  service.technologies = (tech.results || []).map(x => ({ id:Number(x.id), slug:x.slug, name:{ar:x.name_ar,en:x.name_en}, iconUrl:x.icon_url||'', sortOrder:Number(x.sort_order||0) }));
  service.relatedProjects = (related.results || []).map(x => ({ id:Number(x.id), slug:x.slug, title:{ar:x.title_ar,en:x.title_en}, image:x.image||'', domain:x.domain, sortOrder:Number(x.sort_order||0) }));
  return service;
}
