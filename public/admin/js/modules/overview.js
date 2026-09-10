'use strict';

import { state } from '../core/state.js';
import { $, $$, esc, fmtDate } from '../core/dom.js';
import { t, statusLabel } from '../core/i18n.js';
import { api } from '../core/api.js';

let openInquiryHandler=()=>{};
let markSyncedHandler=()=>{};
export function configureOverview({openInquiry,markSynced}={}){if(openInquiry)openInquiryHandler=openInquiry;if(markSynced)markSyncedHandler=markSynced}

export async function loadOverview(){state.dashboard=await api('/admin/dashboard');renderOverview();markSyncedHandler()}
export function renderOverview(){
  const d=state.dashboard;if(!d)return;const c=d.counts;
  const cards=[[t('totalProjects'),c.projects,c.active_projects+' '+t('active')],[t('activeProjects'),c.active_projects,'/'+c.projects],[t('activeServices'),c.active_services,'/'+c.services],[t('newInquiries'),c.new_inquiries,c.inquiries+' '+t('inquiries')]];
  $('#statsGrid').innerHTML=cards.map(x=>`<article class="stat-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
  $('#newLeadBadge').textContent=c.new_inquiries;$('#newLeadBadge').hidden=!c.new_inquiries;
  const r=d.recent_inquiries||[];
  $('#recentInquiries').innerHTML=r.length?r.map(x=>`<article class="recent-item" data-inquiry-id="${x.id}"><div><strong>${esc(x.name)}</strong><small>${esc(x.email)}</small></div><span class="status-pill status-${esc(x.status)}">${esc(statusLabel(x.status))}</span><small>${esc(fmtDate(x.created_at))}</small></article>`).join(''):`<div class="empty-state">${esc(t('noInquiries'))}</div>`;
  $$('[data-inquiry-id]',$('#recentInquiries')).forEach(el=>el.addEventListener('click',()=>openInquiryHandler(+el.dataset.inquiryId)));
}
