'use strict';

import { state } from '../core/state.js';
import { $, $$, esc, safeUrl } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { api } from '../core/api.js';
import { toast, fields, textareas, switches, formSection, formObject, openDrawer, closeDrawer } from '../core/ui.js';
import { faIcon } from '../core/icons.js';

export async function loadProjects(){state.projects=await api('/admin/projects');renderProjects()}
export function renderProjects(){
  const g=$('#projectsGrid');
  g.innerHTML=state.projects.length?state.projects.map(p=>`<article class="manage-card" data-project="${p.id}"><div class="manage-visual">${p.cover_image?`<img src="${esc(safeUrl(p.cover_image))}" alt="">`:`<b>${String(p.sort_order+1).padStart(2,'0')}</b>`}</div><div><h3>${esc(state.lang==='ar'?p.title_ar:p.title_en)}</h3><p>${esc(p.domain)}</p><div class="manage-meta"><span class="mini-pill ${p.is_active?'on':''}">${esc(p.is_active?t('live'):t('hidden'))}</span>${p.is_featured?`<span class="mini-pill on">${esc(t('featured'))}</span>`:''}<span class="mini-pill">#${p.sort_order}</span></div></div><span class="row-action">${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</span></article>`).join(''):`<div class="empty-state">${esc(t('noProjects'))}</div>`;
  $$('[data-project]',g).forEach(c=>c.addEventListener('click',()=>openProject(+c.dataset.project)));
}
export function openProject(id){
  const p=state.projects.find(x=>x.id===id);if(!p)return;
  openDrawer('PROJECT / '+p.slug,state.lang==='ar'?p.title_ar:p.title_en,projectForm(p));
  const f=$('#projectEdit');f.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',f);btn.disabled=true;try{const d=formObject(f);d.is_active=$('[name=is_active]',f).checked;d.is_featured=$('[name=is_featured]',f).checked;d.sort_order=Number(d.sort_order||0);const saved=await api('/admin/projects/'+id+'/update',{method:'POST',csrf:true,body:d});state.projects=state.projects.map(x=>x.id===id?saved:x);renderProjects();toast(t('saved'));closeDrawer()}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
}
function projectForm(p){return `<form id="projectEdit" class="edit-form">${formSection(t('basicInfo'),fields([[t('slug'),'slug',p.slug],[t('titleAr'),'title_ar',p.title_ar],[t('titleEn'),'title_en',p.title_en],[t('website'),'website_url',p.website_url],[t('domain'),'domain',p.domain],[t('status'),'status',p.status],[t('sortOrder'),'sort_order',p.sort_order,'number']]))}${formSection(t('arabicContent'),textareas([[t('shortAr'),'short_description_ar',p.short_description_ar],[t('fullAr'),'description_ar',p.description_ar],[t('challengeAr'),'challenge_ar',p.challenge_ar],[t('solutionAr'),'solution_ar',p.solution_ar]]))}${formSection(t('englishContent'),textareas([[t('shortEn'),'short_description_en',p.short_description_en],[t('fullEn'),'description_en',p.description_en],[t('challengeEn'),'challenge_en',p.challenge_en],[t('solutionEn'),'solution_en',p.solution_en]]))}${formSection(t('visibility'),switches([[t('active'),'is_active',p.is_active],[t('featured'),'is_featured',p.is_featured]]))}${formSection(t('seo'),fields([[t('seoTitleAr'),'seo_title_ar',p.seo_title_ar],[t('seoTitleEn'),'seo_title_en',p.seo_title_en]])+textareas([[t('seoDescAr'),'seo_description_ar',p.seo_description_ar],[t('seoDescEn'),'seo_description_en',p.seo_description_en]]))}<div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></form>`}
