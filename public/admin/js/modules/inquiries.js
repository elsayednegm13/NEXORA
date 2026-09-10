'use strict';

import { state } from '../core/state.js';
import { $, $$, esc, safeUrl, fmtDate, initials } from '../core/dom.js';
import { t, STATUS_KEYS, PACKAGE_LABELS, statusLabel, contactLabel, pair } from '../core/i18n.js';
import { api } from '../core/api.js';
import { toast, openDrawer, confirmDialog } from '../core/ui.js';
import { faIcon } from '../core/icons.js';

let loadOverviewHandler=async()=>{};
let renderOverviewHandler=()=>{};
let refreshClientsHandler=async()=>{};
let openClientHandler=async()=>{};
export function configureInquiries({loadOverview,renderOverview,refreshClients,openClient}={}){
  if(loadOverview)loadOverviewHandler=loadOverview;
  if(renderOverview)renderOverviewHandler=renderOverview;
  if(refreshClients)refreshClientsHandler=refreshClients;
  if(openClient)openClientHandler=openClient;
}

export async function loadInquiries(){
  const q=$('#inquirySearch').value.trim(),status=$('#inquiryStatusFilter').value;
  state.inquiries=await api('/admin/inquiries?'+new URLSearchParams({...(q?{q}:{}),...(status?{status}:{})}));
  renderInquiries();markSynced();
}
function sourceLabel(x){
  if(x.source_service_title_ar||x.source_service_title_en)return pair(x.source_service_title_ar,x.source_service_title_en,x.source_service_slug);
  if(x.source_service_slug)return x.source_service_slug;
  if(x.source_package_key)return PACKAGE_LABELS[state.lang][x.source_package_key]||x.source_package_key;
  if(x.source_project_slug)return x.source_project_slug;
  return t('sourceDirect');
}
export function renderInquiries(){
  const b=$('#inquiriesBody');if(!b)return;
  if(!state.inquiries.length){b.innerHTML=`<tr><td colspan="5"><div class="empty-state">${esc(t('noInquiries'))}</div></td></tr>`;return}
  b.innerHTML=state.inquiries.map(x=>`<tr data-id="${x.id}"><td><strong>${esc(x.name)}</strong><small>${esc(x.email)}</small></td><td><strong>${esc(sourceLabel(x))}</strong><small>${esc(x.public_id)}</small></td><td><span class="status-pill status-${esc(x.status)}">${esc(statusLabel(x.status))}</span></td><td>${esc(fmtDate(x.created_at))}</td><td class="row-action">${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</td></tr>`).join('');
  $$('tr[data-id]',b).forEach(r=>r.addEventListener('click',()=>openInquiry(+r.dataset.id)));
}

export async function openInquiry(id){
  try{const x=await api('/admin/inquiries/'+id);state.activeClient=null;state.activeInquiry=x;state.drawerMode='inquiry';mountInquiryDrawer(x)}catch(e){toast(e.message,'error')}
}
export function mountInquiryDrawer(x,draft=null,conversionDraft=null){
  state.drawerMode='inquiry';
  openDrawer('INQUIRY / '+x.public_id,x.name,inquiryDetail(x));
  const form=$('#inquiryEdit');
  if(form&&draft){for(const [name,value] of Object.entries(draft)){const el=form.elements.namedItem(name);if(el)el.value=value}}
  $$('[name="status"]',form).forEach(r=>r.addEventListener('change',()=>{const pill=$('[data-current-status-pill]');if(!pill)return;pill.className='status-pill status-'+r.value;pill.textContent=statusLabel(r.value)}));
  form?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('button[type=submit]',form);btn.disabled=true;const label=$('span',btn);if(label)label.textContent=t('saving');
    try{
      const data=Object.fromEntries(new FormData(form));
      const saved=await api('/admin/inquiries/'+x.id+'/update',{method:'POST',csrf:true,body:{status:data.status,internal_notes:data.internal_notes,status_note:data.status_note}});
      state.activeInquiry=saved;toast(t('saved'));await Promise.all([loadInquiries(),loadOverviewHandler()]);mountInquiryDrawer(saved);
    }catch(err){toast(err.message,'error')}finally{btn.disabled=false;if(label)label.textContent=t('save')}
  });
  $('#showConversionBtn')?.addEventListener('click',()=>mountConversionForm(x));
  $('[data-open-converted-client]')?.addEventListener('click',()=>openClientHandler(Number(x.conversion.client_id)));
  if(conversionDraft&&!x.conversion)void mountConversionForm(x,conversionDraft);
}

async function mountConversionForm(x,draft=null){
  const host=$('#conversionFormHost');if(!host)return;host.hidden=false;
  try{
    if(!state.clientConfig)state.clientConfig=await api('/admin/clients/config');
    const currency=x.budget_currency||state.clientConfig?.default_currency||'';
    const initialType=x.company?'company':'individual';
    host.innerHTML=`<form id="inquiryConversionForm" class="conversion-form"><div class="conversion-mode" role="radiogroup"><label><input type="radio" name="mode" value="new" checked><span>${esc(t('createNewClient'))}</span></label><label><input type="radio" name="mode" value="existing"><span>${esc(t('linkExistingClient'))}</span></label></div><div id="conversionNewFields"><div class="fields-2"><label class="field"><span>${esc(t('clientType'))}</span><select class="select-input" name="client_type"><option value="company" ${initialType==='company'?'selected':''}>${esc(t('clientTypeCompany'))}</option><option value="individual" ${initialType==='individual'?'selected':''}>${esc(t('clientTypeIndividual'))}</option></select></label><div class="field"><span>${esc(t('clientCode'))}</span><div class="readonly-control client-code-readonly is-pending" dir="ltr">${esc(t('clientCodeAutoHint'))}</div></div><label class="field"><span>${esc(t('displayName'))}</span><input name="display_name" maxlength="190" value="${esc(x.company||x.name||'')}" required></label><label class="field"><span>${esc(t('legalName'))}</span><input name="legal_name" maxlength="255" value="${esc(x.company||'')}"></label><label class="field"><span>${esc(t('defaultCurrency'))}</span><input name="default_currency" maxlength="3" value="${esc(currency)}" autocapitalize="characters" required></label><label class="field"><span>${esc(t('preferredLanguage'))}</span><select class="select-input" name="preferred_language"><option value="ar" ${(x.submission_language||state.lang)==='ar'?'selected':''}>${esc(t('arabic'))}</option><option value="en" ${(x.submission_language||state.lang)==='en'?'selected':''}>${esc(t('english'))}</option></select></label><label class="field"><span>${esc(t('billingName'))}</span><input name="billing_name" maxlength="255" value="${esc(x.company||x.name||'')}"></label><label class="field"><span>${esc(t('billingEmail'))}</span><input name="billing_email" type="email" maxlength="255" value="${esc(x.email||'')}"></label><label class="field"><span>${esc(t('billingPhone'))}</span><input name="billing_phone" maxlength="80" value="${esc(x.phone||'')}"></label><label class="field" data-conversion-tax ${initialType==='individual'?'hidden':''}><span>${esc(t('taxIdentifier'))}</span><input name="tax_identifier" maxlength="120"></label></div><label class="check-row conversion-contact-check"><input type="checkbox" name="create_primary_contact" checked><span>${esc(t('createPrimaryContact'))}</span></label></div><div id="conversionExistingFields" hidden><div class="existing-client-search"><input id="existingClientSearch" type="search" placeholder="${esc(t('searchExistingClient'))}"><button id="searchExistingClientBtn" class="ghost-btn" type="button">${esc(t('searchClientAction'))}</button></div><label class="field"><span>${esc(t('selectClient'))}</span><select id="existingClientSelect" class="select-input" name="client_id"><option value="">—</option></select></label></div><p class="conversion-note">${esc(t('conversionStatusNote'))}</p><button class="primary-btn" type="submit"><span>${esc(t('convert'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></form>`;
    const form=$('#inquiryConversionForm'),newFields=$('#conversionNewFields'),existingFields=$('#conversionExistingFields');
    async function loadExisting(selectedId=null){const q=$('#existingClientSearch')?.value.trim()||'';const payload=await api('/admin/clients?'+new URLSearchParams({status:'active',...(q?{q}:{})}));const select=$('#existingClientSelect');const items=payload?.items||[];select.innerHTML=`<option value="">—</option>`+items.map(c=>`<option value="${c.id}">${esc(c.display_name)}${c.client_code?` · ${esc(c.client_code)}`:''}</option>`).join('');if(selectedId!==null&&selectedId!==undefined&&selectedId!=='')select.value=String(selectedId)}
    if(draft?.data){for(const [name,value] of Object.entries(draft.data)){const el=form.elements.namedItem(name);if(!el)continue;if(typeof RadioNodeList!=='undefined'&&el instanceof RadioNodeList){for(const item of el)item.checked=item.value===String(value)}else if(el.type==='checkbox')el.checked=value===true||value==='on'||value==='true'||value===1||value==='1';else el.value=value??''}}
    if(draft&&typeof draft.search==='string'&&$('#existingClientSearch'))$('#existingClientSearch').value=draft.search;
    const type=form.elements.client_type,taxWrap=form.querySelector('[data-conversion-tax]'),taxInput=form.elements.tax_identifier;
    const syncTax=()=>{if(taxWrap)taxWrap.hidden=type.value==='individual'};let previousType=type.value;syncTax();
    type.addEventListener('change',async()=>{const next=type.value;if(next==='individual'&&taxInput?.value.trim()){type.value=previousType;const ok=await confirmDialog({title:t('clearTaxTitle'),message:t('clearTaxMessage'),confirmText:t('clearTaxConfirm'),cancelText:t('cancel'),danger:true});if(!ok){syncTax();return}taxInput.value='';type.value='individual';previousType='individual';syncTax();return}previousType=next;syncTax()});
    const initialMode=String(new FormData(form).get('mode')||'new'),showExisting=initialMode==='existing';newFields.hidden=showExisting;existingFields.hidden=!showExisting;if(showExisting)await loadExisting(draft?.data?.client_id);
    $$('[name="mode"]',form).forEach(r=>r.addEventListener('change',async()=>{const existing=r.value==='existing'&&r.checked;newFields.hidden=existing;existingFields.hidden=!existing;if(existing)try{await loadExisting()}catch(err){toast(err.message,'error')}}));
    $('#searchExistingClientBtn')?.addEventListener('click',async()=>{try{await loadExisting()}catch(err){toast(err.message,'error')}});
    form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),mode=String(fd.get('mode')||'new'),btn=$('button[type=submit]',form),label=$('span',btn);btn.disabled=true;if(label)label.textContent=t('converting');try{let body;if(mode==='existing'){body={mode,client_id:Number(fd.get('client_id'))}}else{body={mode,create_primary_contact:form.elements.create_primary_contact.checked,client:{client_type:fd.get('client_type'),display_name:fd.get('display_name'),legal_name:fd.get('legal_name'),default_currency:fd.get('default_currency'),preferred_language:fd.get('preferred_language'),billing_name:fd.get('billing_name'),billing_email:fd.get('billing_email'),billing_phone:fd.get('billing_phone'),tax_identifier:fd.get('client_type')==='company'?fd.get('tax_identifier'):''}}}const result=await api(`/admin/inquiries/${x.id}/convert-client`,{method:'POST',csrf:true,body});toast(result.already_converted?t('inquiryAlreadyConverted'):t('convertedClient'));await refreshClientsHandler();const updated=await api('/admin/inquiries/'+x.id);state.activeInquiry=updated;mountInquiryDrawer(updated)}catch(err){toast(err.message,'error')}finally{btn.disabled=false;if(label)label.textContent=t('convert')}});
  }catch(err){toast(err.message,'error');host.hidden=true}
}

function optionPair(x,prefix,key){return pair(x[prefix+'_label_ar'],x[prefix+'_label_en'],x[key]||'—')}
function submissionLanguageLabel(x){if(x.submission_language==='ar')return t('arabic');if(x.submission_language==='en')return t('english');return ''}
function budgetLabel(x){
  const mode=optionPair(x,'budget_mode','budget_mode_key');
  if(x.budget_amount!==null&&x.budget_amount!==undefined&&x.budget_amount!=='')return `${Number(x.budget_amount).toLocaleString(state.lang==='ar'?'ar-EG':'en-US')} ${x.budget_currency||''}`.trim()+` · ${mode}`;
  return mode;
}
function sourceDetail(x){
  if(x.source_service_title_ar||x.source_service_title_en)return pair(x.source_service_title_ar,x.source_service_title_en,x.source_service_slug);
  if(x.source_service_slug)return x.source_service_slug;
  if(x.source_package_key)return `${t('sourcePackage')}: ${PACKAGE_LABELS[state.lang][x.source_package_key]||x.source_package_key}`;
  if(x.source_project_slug)return `${t('sourceProject')}: ${x.source_project_slug}`;
  return t('sourceDirect');
}
function serviceIcon(slug){
  const paths={
    'websites':'<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.3 2.2 3.5 4.9 3.5 8S14.3 17.8 12 20c-2.3-2.2-3.5-4.9-3.5-8S9.7 6.2 12 4Z"/>',
    'web-platforms':'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M8 5v4"/>',
    'erp-crm':'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    'ui-ux-design':'<path d="m5 19 3.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 15 5 19Z"/><path d="m13.8 6.7 3.5 3.5"/>',
    'custom-systems':'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[slug]||'<path d="M12 3 4 8v8l8 5 8-5V8l-8-5Z"/><path d="m8 10 4 2 4-2M12 12v5"/>'}</svg>`;
}
function serviceCards(x){
  const services=x.services||[];
  if(!services.length)return `<div class="empty-inline">—</div>`;
  return `<div class="service-chip-grid">${services.map(s=>`<div class="service-chip"><span class="service-chip-icon">${serviceIcon(s.slug)}</span><div><strong>${esc(pair(s.title_ar,s.title_en,s.slug))}</strong><small>${esc(s.slug)}</small></div></div>`).join('')}</div>`;
}
function statusChoices(selected){return `<div class="status-choice-grid" role="radiogroup">${STATUS_KEYS.map(s=>`<label class="status-choice status-choice-${esc(s)} ${selected===s?'is-selected':''}"><input type="radio" name="status" value="${s}" ${selected===s?'checked':''}><span>${esc(statusLabel(s))}</span></label>`).join('')}</div>`}
function historyTimeline(x){
  const items=x.history||[];if(!items.length)return `<div class="empty-inline">${esc(t('noHistory'))}</div>`;
  return `<div class="timeline modern-timeline">${items.map(h=>`<div class="timeline-item status-${esc(h.to_status)}"><i></i><div class="timeline-content"><div class="timeline-change">${h.from_status?`<span>${esc(statusLabel(h.from_status))}</span><b>→</b>`:''}<strong>${esc(statusLabel(h.to_status))}</strong></div><small>${esc(h.changed_by||t('systemActor'))} · ${esc(fmtDate(h.created_at))}</small>${h.note?`<p dir="auto">${esc(h.note)}</p>`:''}</div></div>`).join('')}</div>`;
}
function conversionSection(x){
  if(x.conversion)return `<section class="detail-section conversion-card is-converted"><div class="conversion-icon">${faIcon('circle-check',{fallback:'✓'})}</div><div><span class="eyebrow">CLIENT</span><h3>${esc(t('convertedClient'))}</h3><p>${esc(x.conversion.client_display_name)} · ${esc(x.conversion.client_public_id)}</p><small>${esc(t('convertedAt'))}: ${esc(fmtDate(x.conversion.converted_at))}${x.conversion.converted_by_admin_name?` · ${esc(t('convertedBy'))}: ${esc(x.conversion.converted_by_admin_name)}`:''}</small></div><button class="ghost-btn" type="button" data-open-converted-client>${esc(t('openClient'))} ${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</button></section>`;
  return `<section class="detail-section conversion-card"><div class="conversion-icon">${faIcon('user-plus',{fallback:'◎'})}</div><div><span class="eyebrow">CLIENT</span><h3>${esc(t('conversionTitle'))}</h3><p>${esc(t('conversionText'))}</p></div><button id="showConversionBtn" class="ghost-btn" type="button">${esc(t('convertToClient'))}</button><div id="conversionFormHost" class="conversion-form-host" hidden></div></section>`;
}
function inquiryDetail(x){
  const langLabel=submissionLanguageLabel(x);
  return `<section class="inquiry-identity"><div class="inquiry-avatar">${esc(initials(x.name))}</div><div class="inquiry-identity-copy"><span class="inquiry-id">${esc(x.public_id)}</span><h3>${esc(x.name)}</h3><div class="inquiry-meta-line"><span class="status-pill status-${esc(x.status)}">${esc(statusLabel(x.status))}</span>${langLabel?`<span class="language-pill">${esc(t('submissionLanguage'))}: ${esc(langLabel)}</span>`:''}<span>${esc(fmtDate(x.created_at))}</span></div></div></section>
  <section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('clientBrief'))}</span><small>${esc(t('requestId'))}: ${esc(x.public_id)}</small></div><div class="detail-grid detail-grid-rich">${dc(t('email'),x.email,'mail')}${dc(t('phone'),x.phone||'—','phone')}${dc(t('company'),x.company||'—','company')}${dc(t('projectStage'),optionPair(x,'project_stage','project_stage_key'),'stage')}${dc(t('timeline'),optionPair(x,'timeline','timeline_key'),'timeline')}${dc(t('budget'),budgetLabel(x),'budget')}${dc(t('preferredContact'),contactLabel(x.preferred_contact),'contact')}${dc(t('source'),sourceDetail(x),'source')}</div></section>
  <section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('servicesRequested'))}</span></div>${serviceCards(x)}</section>
  <section class="detail-section brief-surface"><div class="detail-section-title"><span>${esc(t('description'))}</span></div><p class="detail-text inquiry-description" dir="auto">${esc(x.description||'—')}</p></section>
  ${x.reference_url?`<section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('reference'))}</span></div><a class="reference-card" target="_blank" rel="noopener" href="${esc(safeUrl(x.reference_url))}"><span>${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</span><b>${esc(x.reference_url)}</b></a></section>`:''}
  ${conversionSection(x)}
  <form id="inquiryEdit" class="edit-form detail-section"><section class="status-workbench"><div class="status-workbench-head"><div><span class="eyebrow">WORKFLOW</span><h3>${esc(t('changeStatus'))}</h3></div><span class="status-pill status-${esc(x.status)}" data-current-status-pill>${esc(statusLabel(x.status))}</span></div><div class="field"><span>${esc(t('currentStatus'))}</span>${statusChoices(x.status)}</div><label class="field"><span>${esc(t('statusNote'))}</span><input name="status_note" maxlength="2000" placeholder="${esc(t('statusNoteHint'))}"></label><label class="field"><span>${esc(t('internalNotes'))}</span><textarea name="internal_notes" dir="auto">${esc(x.internal_notes||'')}</textarea></label></section>
  <section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('history'))}</span></div>${historyTimeline(x)}</section>
  <div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></form>`;
}
function detailIcon(kind){const map={mail:['envelope','✉'],phone:['phone','⌕'],company:['building','◇'],stage:['route','✦'],timeline:['clock-rotate-left','◷'],budget:['coins','¤'],contact:['arrow-up-right-from-square','↗'],source:['link','⌁']};const icon=map[kind]||['circle','•'];return faIcon(icon[0],{fallback:icon[1]})}
const dc=(label,value,kind='')=>`<div class="detail-card rich-card"><span class="detail-card-icon">${detailIcon(kind)}</span><div><span>${esc(label)}</span><strong dir="auto">${esc(value||'—')}</strong></div></div>`;

export function markSynced(){state.lastSyncAt=new Date();renderSyncBadge()}
export function renderSyncBadge(){
  const el=$('#liveSyncBadge'),time=$('#lastSyncTime');if(!el||!time)return;
  el.classList.toggle('is-syncing',state.syncBusy);
  if(!state.lastSyncAt){time.textContent='—';return}
  time.textContent=t('justNow');
}
export async function liveSyncTick(){
  if(!state.user||document.hidden||state.syncBusy)return;
  state.syncBusy=true;renderSyncBadge();
  try{
    const previous=state.dashboard;
    const next=await api('/admin/dashboard');
    const prevTotal=previous?.counts?.inquiries;
    const prevTop=previous?.recent_inquiries?.[0]?.id||null;
    const nextTop=next?.recent_inquiries?.[0]?.id||null;
    state.dashboard=next;renderOverviewHandler();
    const hasNew=prevTotal!==undefined&&(next.counts.inquiries>prevTotal||(prevTop&&nextTop&&prevTop!==nextTop));
    if(hasNew){
      if(state.view==='inquiries')await loadInquiries();
      const lead=next.recent_inquiries?.[0];toast(`${t('newInquiryArrived')}${lead?.name?`: ${lead.name}`:''}`,'info');
    }
    markSynced();
  }catch(e){if(e.message!=='UNAUTHENTICATED')console.warn('Live sync failed',e)}finally{state.syncBusy=false;renderSyncBadge()}
}
export function startLiveSync(){stopLiveSync();state.syncTimer=setInterval(liveSyncTick,state.syncInterval)}
export function stopLiveSync(){if(state.syncTimer){clearInterval(state.syncTimer);state.syncTimer=null}}
