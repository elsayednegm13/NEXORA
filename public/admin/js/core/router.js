'use strict';

import { state } from './state.js';
import { $, $$ } from './dom.js';
import { t } from './i18n.js';
import { toast } from './ui.js';

const loaders={overview:async()=>{},inquiries:async()=>{},clients:async()=>{},clientProjects:async()=>{},projects:async()=>{},services:async()=>{}};
export function configureRouter(next={}){for(const key of Object.keys(loaders)){if(typeof next[key]==='function')loaders[key]=next[key]}}

export function updateViewHeader(){
  const map={overview:['NEXORA / ADMIN',t('overview')],inquiries:['SALES / LEADS',t('inquiries')],clients:['SALES / CLIENTS',t('clients')],clientProjects:['OPERATIONS / CLIENT PROJECTS',t('clientProjects')],projects:['WEBSITE / PORTFOLIO',t('portfolioProjects')],services:['WEBSITE / SERVICES',t('services')]};
  const m=map[state.view]||map.overview;$('#viewEyebrow').textContent=m[0];$('#viewTitle').textContent=m[1];
}

export async function navigate(view,push=true){
  if(!['overview','inquiries','clients','clientProjects','projects','services'].includes(view))view='overview';state.view=view;
  $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
  $$('[data-view-section]').forEach(s=>s.classList.toggle('is-active',s.dataset.viewSection===view));
  updateViewHeader();$('#sidebar').classList.remove('is-open');if(push&&location.hash!=='#'+view)history.replaceState(null,'','#'+view);
  try{await loaders[view]()}catch(e){if(e.message!=='UNAUTHENTICATED')toast(e.message,'error')}
}
