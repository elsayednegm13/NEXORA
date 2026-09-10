'use strict';

import { state } from '../core/state.js';
import { $, $$, esc } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { api } from '../core/api.js';
import { toast, fields, textareas, switches, formSection, formObject, openDrawer, closeDrawer } from '../core/ui.js';
import { faIcon } from '../core/icons.js';

export async function loadServices(){state.services=await api('/admin/services');renderServices()}
export function renderServices(){
  const g=$('#servicesGrid');
  g.innerHTML=state.services.length?state.services.map(s=>`<article class="manage-card" data-service="${s.id}"><div class="manage-visual"><b>${esc(s.icon_key.slice(0,2).toUpperCase())}</b></div><div><h3>${esc(state.lang==='ar'?s.title_ar:s.title_en)}</h3><p>${esc(s.slug)}</p><div class="manage-meta"><span class="mini-pill ${s.is_active?'on':''}">${esc(s.is_active?t('live'):t('hidden'))}</span>${s.is_featured?`<span class="mini-pill on">${esc(t('featured'))}</span>`:''}<span class="mini-pill">#${s.sort_order}</span></div></div><span class="row-action">${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</span></article>`).join(''):`<div class="empty-state">${esc(t('noServices'))}</div>`;
  $$('[data-service]',g).forEach(c=>c.addEventListener('click',()=>openService(+c.dataset.service)));
}
export function openService(id){
  const s=state.services.find(x=>x.id===id);if(!s)return;
  openDrawer('SERVICE / '+s.slug,state.lang==='ar'?s.title_ar:s.title_en,serviceForm(s));
  const f=$('#serviceEdit');f.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',f);btn.disabled=true;try{const d=formObject(f);d.is_active=$('[name=is_active]',f).checked;d.is_featured=$('[name=is_featured]',f).checked;d.sort_order=Number(d.sort_order||0);const saved=await api('/admin/services/'+id+'/update',{method:'POST',csrf:true,body:d});state.services=state.services.map(x=>x.id===id?saved:x);renderServices();toast(t('saved'));closeDrawer()}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
}
function serviceForm(s){return `<form id="serviceEdit" class="edit-form">${formSection(t('basicInfo'),fields([[t('slug'),'slug',s.slug],[t('titleAr'),'title_ar',s.title_ar],[t('titleEn'),'title_en',s.title_en],[t('iconKey'),'icon_key',s.icon_key],[t('sortOrder'),'sort_order',s.sort_order,'number']]))}${formSection(t('arabicContent'),textareas([[t('shortAr'),'short_description_ar',s.short_description_ar],[t('fullAr'),'description_ar',s.description_ar]]))}${formSection(t('englishContent'),textareas([[t('shortEn'),'short_description_en',s.short_description_en],[t('fullEn'),'description_en',s.description_en]]))}${formSection(t('visibility'),switches([[t('active'),'is_active',s.is_active],[t('featured'),'is_featured',s.is_featured]]))}${formSection(t('seo'),fields([[t('seoTitleAr'),'seo_title_ar',s.seo_title_ar],[t('seoTitleEn'),'seo_title_en',s.seo_title_en]])+textareas([[t('seoDescAr'),'seo_description_ar',s.seo_description_ar],[t('seoDescEn'),'seo_description_en',s.seo_description_en]]))}<div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></form>`}
