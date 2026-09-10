'use strict';

import { state } from '../core/state.js';
import { $, $$, esc, fmtDate, initials } from '../core/dom.js';
import { t, CLIENT_STATUS_KEYS, clientStatusLabel, clientTypeLabel, contactStatusLabel, clientProjectStatusLabel, clientProjectPriorityLabel } from '../core/i18n.js';
import { api } from '../core/api.js';
import { toast, openDrawer, closeDrawer, confirmDialog } from '../core/ui.js';
import { faIcon } from '../core/icons.js';

let openInquiryHandler=async()=>{},openClientProjectHandler=async()=>{},openClientProjectsForClientHandler=async()=>{};
const profileLinks=new Map();
export function configureClients({openInquiry,openClientProject,openClientProjectsForClient}={}){if(openInquiry)openInquiryHandler=openInquiry;if(openClientProject)openClientProjectHandler=openClientProject;if(openClientProjectsForClient)openClientProjectsForClientHandler=openClientProjectsForClient}

export async function loadClientConfig(){
  if(state.clientConfig)return state.clientConfig;
  state.clientConfig=await api('/admin/clients/config');
  return state.clientConfig;
}

export function renderClientStatusFilter(){
  const el=$('#clientStatusFilter');if(!el)return;const current=el.value;
  el.innerHTML=`<option value="">${esc(t('allClientStatuses'))}</option>`+CLIENT_STATUS_KEYS.map(s=>`<option value="${esc(s)}">${esc(clientStatusLabel(s))}</option>`).join('');
  el.value=CLIENT_STATUS_KEYS.includes(current)?current:'';
}

export async function loadClients({append=false}={}){
  const q=$('#clientSearch')?.value.trim()||'',status=$('#clientStatusFilter')?.value||'';
  const params=new URLSearchParams({...(q?{q}:{}),...(status?{status}:{}),...(append&&state.clientMeta?.next_cursor?{cursor:state.clientMeta.next_cursor}:{})});
  const payload=await api('/admin/clients?'+params.toString());
  const items=payload?.items||[];
  state.clients=append?[...state.clients,...items]:items;
  state.clientMeta=payload?.meta||{count:items.length,has_more:false,next_cursor:null};
  renderClients();
}

export function renderClients(){
  renderClientStatusFilter();const body=$('#clientsBody');if(!body)return;
  if(!state.clients.length){body.innerHTML=`<tr><td colspan="6"><div class="empty-state">${esc(t('noClients'))}</div></td></tr>`}
  else body.innerHTML=state.clients.map(c=>`<tr data-client-id="${c.id}"><td><div class="table-client-cell"><span class="table-avatar">${esc(initials(c.display_name))}</span><div><strong>${esc(c.display_name)}</strong><small>${esc(c.client_code||c.public_id)}</small></div></div></td><td><strong>${esc(c.primary_contact_name||'—')}</strong><small>${esc(c.primary_contact_email||c.primary_contact_phone||'—')}</small></td><td><span class="client-status client-status-${esc(c.status)}">${esc(clientStatusLabel(c.status))}</span></td><td><strong>${Number(c.conversion_count||0)}</strong><small>${esc(c.contact_count?`${c.contact_count} ${t('clientContacts')}`:'')}</small></td><td>${esc(fmtDate(c.updated_at))}</td><td class="row-action">${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</td></tr>`).join('');
  $$('tr[data-client-id]',body).forEach(r=>r.addEventListener('click',()=>openClient(Number(r.dataset.clientId))));
  const more=$('#loadMoreClients');if(more)more.hidden=!state.clientMeta?.has_more;
}

export async function openClient(id){
  try{const c=await api('/admin/clients/'+id);state.activeInquiry=null;state.activeClient=c;state.drawerMode='client';mountClientDrawer(c)}catch(e){toast(e.message,'error')}
}

function options(values,current,labeler=v=>v){return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(labeler(v))}</option>`).join('')}
function languageOptions(current){return `<option value="ar" ${current==='ar'?'selected':''}>${esc(t('arabic'))}</option><option value="en" ${current==='en'?'selected':''}>${esc(t('english'))}</option>`}
function currencyField(config,current){const currencies=config?.currencies||[];if(currencies.length)return `<select class="select-input" name="default_currency" required>${currencies.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('')}</select>`;return `<input name="default_currency" maxlength="3" value="${esc(current||'')}" required>`}
function checked(v){return Number(v)===1||v===true?'checked':''}

function clientFields(c,config,{creating=false}={}){
  const type=c?.client_type||'company',code=c?.client_code||'';
  const codeValue=creating?t('clientCodeAutoHint'):code;
  return `<section class="form-section"><div class="detail-section-title"><span>${esc(t('clientIdentity'))}</span>${c?.public_id?`<small>${esc(c.public_id)}</small>`:''}</div>
    <div class="fields-2">
      <label class="field"><span>${esc(t('clientType'))}</span><select class="select-input" name="client_type">${options(['individual','company'],type,clientTypeLabel)}</select></label>
      ${c?`<div class="field"><span>${esc(t('clientStatus'))}</span><div class="readonly-control"><span class="client-status client-status-${esc(c.status)}">${esc(clientStatusLabel(c.status))}</span></div></div>`:''}
      <label class="field"><span>${esc(t('displayName'))}</span><input name="display_name" maxlength="190" value="${esc(c?.display_name||'')}" required></label>
      <label class="field"><span>${esc(t('legalName'))}</span><input name="legal_name" maxlength="255" value="${esc(c?.legal_name||'')}"></label>
      <div class="field"><span>${esc(t('clientCode'))}</span><div class="readonly-control client-code-readonly ${creating?'is-pending':''}" dir="ltr">${esc(codeValue)}</div></div>
      <label class="field"><span>${esc(t('preferredLanguage'))}</span><select class="select-input" name="preferred_language">${languageOptions(c?.preferred_language||state.lang)}</select></label>
      <label class="field"><span>${esc(t('defaultCurrency'))}</span>${currencyField(config,c?.default_currency||config?.default_currency||'')}</label>
    </div></section>
    <section class="form-section"><h3>${esc(t('billingDetails'))}</h3><div class="fields-2">
      <label class="field"><span>${esc(t('billingName'))}</span><input name="billing_name" maxlength="255" value="${esc(c?.billing_name||'')}"></label>
      <label class="field"><span>${esc(t('billingEmail'))}</span><input name="billing_email" type="email" maxlength="255" value="${esc(c?.billing_email||'')}"></label>
      <label class="field"><span>${esc(t('billingPhone'))}</span><input name="billing_phone" maxlength="80" value="${esc(c?.billing_phone||'')}"></label>
      <label class="field" data-tax-field ${type==='individual'?'hidden':''}><span>${esc(t('taxIdentifier'))}</span><input name="tax_identifier" maxlength="120" value="${esc(c?.tax_identifier||'')}"></label>
      <label class="field"><span>${esc(t('addressLine1'))}</span><input name="billing_address_line1" maxlength="255" value="${esc(c?.billing_address_line1||'')}"></label>
      <label class="field"><span>${esc(t('addressLine2'))}</span><input name="billing_address_line2" maxlength="255" value="${esc(c?.billing_address_line2||'')}"></label>
      <label class="field"><span>${esc(t('city'))}</span><input name="billing_city" maxlength="120" value="${esc(c?.billing_city||'')}"></label>
      <label class="field"><span>${esc(t('region'))}</span><input name="billing_region" maxlength="120" value="${esc(c?.billing_region||'')}"></label>
      <label class="field"><span>${esc(t('postalCode'))}</span><input name="billing_postal_code" maxlength="40" value="${esc(c?.billing_postal_code||'')}"></label>
      <label class="field"><span>${esc(t('countryCode'))}</span><input name="billing_country_code" maxlength="2" value="${esc(c?.billing_country_code||'')}" autocapitalize="characters"></label>
    </div></section>`;
}
function clientPayload(form){
  const d=Object.fromEntries(new FormData(form));delete d.client_code;delete d.status;
  if(d.client_type==='individual')d.tax_identifier='';
  return d;
}
function contactPayload(form){const d=Object.fromEntries(new FormData(form));return {...d,is_primary:form.elements.is_primary?.checked===true}}

function syncTaxField(form){
  const type=form?.elements?.client_type,taxWrap=form?.querySelector('[data-tax-field]');if(!type||!taxWrap)return;
  taxWrap.hidden=type.value==='individual';
}
function bindClientTypeRules(form){
  const type=form?.elements?.client_type,taxWrap=form?.querySelector('[data-tax-field]'),taxInput=form?.elements?.tax_identifier;if(!type||!taxWrap)return;
  let previous=type.value;syncTaxField(form);
  type.addEventListener('change',async()=>{
    const next=type.value;
    if(next==='individual'&&taxInput?.value.trim()){
      type.value=previous;
      const ok=await confirmDialog({title:t('clearTaxTitle'),message:t('clearTaxMessage'),confirmText:t('clearTaxConfirm'),cancelText:t('cancel'),danger:true});
      if(!ok){type.value=previous;syncTaxField(form);return}
      taxInput.value='';type.value='individual';previous='individual';syncTaxField(form);return;
    }
    previous=next;syncTaxField(form);
  });
}

export async function openNewClient(draft=null){
  try{
    const config=await loadClientConfig();state.activeInquiry=null;state.activeClient=null;state.drawerMode='new-client';
    openDrawer('CLIENTS / NEW',t('addClient'),`<form id="newClientForm" class="edit-form">${clientFields(null,config,{creating:true})}<section class="form-section"><div class="switch-row"><span>${esc(t('createPrimaryContact'))}</span><label class="switch"><input id="manualPrimaryToggle" type="checkbox" checked><i></i></label></div><div id="manualPrimaryFields" class="fields-2"><label class="field"><span>${esc(t('name'))}</span><input name="contact_name" maxlength="190"></label><label class="field"><span>${esc(t('email'))}</span><input name="contact_email" type="email" maxlength="255"></label><label class="field"><span>${esc(t('phone'))}</span><input name="contact_phone" maxlength="80"></label><label class="field"><span>${esc(t('roleTitle'))}</span><input name="contact_role" maxlength="120"></label></div></section><div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('addClient'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></form>`);
    const form=$('#newClientForm'),toggle=$('#manualPrimaryToggle'),fields=$('#manualPrimaryFields');
    if(draft?.data)restoreFormValues(form,draft.data);if(toggle&&draft&&typeof draft.toggle==='boolean')toggle.checked=draft.toggle;if(fields&&toggle)fields.hidden=!toggle.checked;
    syncTaxField(form);bindClientTypeRules(form);
    toggle?.addEventListener('change',()=>fields.hidden=!toggle.checked);
    form?.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',form);btn.disabled=true;try{const body=clientPayload(form);delete body.contact_name;delete body.contact_email;delete body.contact_phone;delete body.contact_role;if(toggle?.checked){const raw=new FormData(form);body.primary_contact={name:String(raw.get('contact_name')||'').trim()||body.display_name,email:String(raw.get('contact_email')||'').trim()||body.billing_email||'',phone:String(raw.get('contact_phone')||'').trim()||body.billing_phone||'',role_title:String(raw.get('contact_role')||'').trim(),preferred_language:body.preferred_language,is_primary:true,status:'active'}}const saved=await api('/admin/clients',{method:'POST',csrf:true,body});toast(t('clientCreatedSuccess'));await loadClients();state.activeClient=saved;state.drawerMode='client';await mountClientDrawer(saved)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  }catch(e){toast(e.message,'error')}
}

function restoreFormValues(form,data){
  if(!form||!data)return;
  for(const [name,value] of Object.entries(data)){
    const el=form.elements.namedItem(name);if(!el)continue;
    if(typeof RadioNodeList!=='undefined'&&el instanceof RadioNodeList){for(const item of el)item.checked=item.value===String(value)}
    else if(el.type==='checkbox')el.checked=value===true||value==='on'||value==='true'||value===1||value==='1';
    else el.value=value??'';
  }
}

function contactForm(contact,{newContact=false}={}){
  const c=contact||{};return `<form class="contact-form ${newContact?'contact-new-form':''}" ${newContact?'data-contact-new="1"':`data-contact-id="${c.id}"`}><div class="fields-2"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="190" value="${esc(c.name||'')}" required></label><label class="field"><span>${esc(t('roleTitle'))}</span><input name="role_title" maxlength="120" value="${esc(c.role_title||'')}"></label><label class="field"><span>${esc(t('email'))}</span><input name="email" type="email" maxlength="255" value="${esc(c.email||'')}"></label><label class="field"><span>${esc(t('phone'))}</span><input name="phone" maxlength="80" value="${esc(c.phone||'')}"></label><label class="field"><span>${esc(t('preferredLanguage'))}</span><select class="select-input" name="preferred_language">${languageOptions(c.preferred_language||state.lang)}</select></label><label class="field"><span>${esc(t('contactStatus'))}</span><select class="select-input" name="status"><option value="active" ${c.status!=='inactive'?'selected':''}>${esc(t('contactActive'))}</option><option value="inactive" ${c.status==='inactive'?'selected':''}>${esc(t('contactInactive'))}</option></select></label></div><div class="contact-form-actions"><label class="check-row"><input type="checkbox" name="is_primary" ${checked(c.is_primary)}><span>${esc(t('primary'))}</span></label><button class="ghost-btn" type="submit">${esc(newContact?t('addContact'):t('saveContact'))}</button></div></form>`}
function contactsSection(c){
  const list=c.contacts||[];return `<section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('clientContacts'))}</span><small>${list.length}</small></div><div class="contact-list">${list.length?list.map(x=>`<details class="contact-card" ${x.is_primary?'open':''}><summary><div><strong>${esc(x.name)}</strong><small>${esc(x.email||x.phone||'—')}</small></div><span class="client-status client-status-${x.status==='active'?'active':'archived'}">${esc(contactStatusLabel(x.status))}${x.is_primary?` · ${esc(t('primary'))}`:''}</span></summary>${contactForm(x)}</details>`).join(''):`<div class="empty-inline">${esc(t('noContacts'))}</div>`}</div><details class="contact-card add-contact-card"><summary><strong>＋ ${esc(t('newContact'))}</strong></summary>${contactForm(null,{newContact:true})}</details></section>`;
}
function conversionSection(c){
  const list=c.inquiry_conversions||[];return `<section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('clientSourceHistory'))}</span><small>${list.length}</small></div>${list.length?`<div class="client-source-list">${list.map(x=>`<button type="button" class="client-source-card" data-open-inquiry="${x.project_inquiry_id}"><div><strong>${esc(x.inquiry_name||x.inquiry_public_id)}</strong><small>${esc(x.inquiry_email||'')} · ${esc(x.inquiry_public_id)}</small></div><span>${esc(fmtDate(x.converted_at))} ${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</span></button>`).join('')}</div>`:`<div class="empty-inline">${esc(t('noSourceInquiries'))}</div>`}</section>`;
}
function clientProjectsSection(c){
  const list=c.client_projects||[];
  return `<section class="detail-section section-surface client-projects-in-client"><div class="detail-section-title"><span>${esc(t('clientProjects'))}</span><div class="section-title-actions"><small>${list.length}</small>${list.length?`<button type="button" class="ghost-btn compact-btn" data-open-client-projects>${esc(t('viewAllClientProjects'))}</button>`:''}</div></div>${list.length?`<div class="client-project-mini-list">${list.map(p=>{const status=p.archived_at?'archived':p.status,progress=Number(p.effective_progress_percent??p.manual_progress_percent??0);return `<button type="button" class="client-project-mini-card" data-open-client-project="${p.id}"><div class="client-project-mini-main"><span class="table-avatar project-avatar">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.project_code||p.public_id)} · ${esc(clientProjectPriorityLabel(p.priority))}</small></span></div><div class="client-project-mini-side"><span class="project-status project-status-${esc(status)}">${esc(clientProjectStatusLabel(status))}</span><b>${Math.max(0,Math.min(100,progress))}%</b><small>${esc(p.target_date||'—')} ${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</small></div></button>`}).join('')}</div>`:`<div class="empty-inline">${esc(t('noClientProjectsForClient'))}</div>`}</section>`;
}
function profileStateLabel(key){return t({none:'profileLinkNone',active:'profileLinkActive',completed:'profileLinkCompleted',expired:'profileLinkExpired',revoked:'profileLinkRevoked',unavailable:'profileLinkUnavailable'}[key]||'profileLinkNone')}
function profileCompletionSection(c){
  return `<section class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('profileCompletion'))}</span><small>${esc(c.client_code||'')}</small></div><div id="profileCompletionBody" class="profile-completion-card"><div class="profile-completion-loading" aria-hidden="true"></div></div></section>`;
}
function renderProfileCompletion(data){
  const root=$('#profileCompletionBody');if(!root||!data)return;
  const link=data.link||null,stateKey=data.client_status!=='active'?'unavailable':(link?.state||'none'),cached=profileLinks.get(Number(data.client_id))||'';
  const meta=[];
  if(link?.state==='active'&&link.expires_at)meta.push(`${t('profileLinkExpires')}: ${fmtDate(link.expires_at)}`);
  if(link?.state==='completed'&&link.completed_at)meta.push(`${t('profileLinkCompletedAt')}: ${fmtDate(link.completed_at)}`);
  const canGenerate=data.client_status==='active';
  const generateLabel=link?t('generateNewProfileLink'):t('generateProfileLink');
  root.innerHTML=`<div class="profile-completion-head"><span class="profile-completion-status is-${esc(stateKey)}"><i></i>${esc(profileStateLabel(stateKey))}</span>${meta.length?`<div class="profile-completion-meta">${meta.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</div>${cached?`<div class="profile-link-once"><input type="text" value="${esc(cached)}" readonly data-profile-link dir="ltr" aria-label="${esc(t('profileLink'))}"><button type="button" class="ghost-btn" data-profile-copy>${esc(t('copyProfileLink'))}</button></div>`:''}<div class="profile-completion-actions">${canGenerate?`<button type="button" class="primary-btn" data-profile-generate>${esc(generateLabel)}</button>`:''}${link?.state==='active'?`<button type="button" class="ghost-btn" data-profile-revoke>${esc(t('revokeProfileLink'))}</button>`:''}</div>`;
  $('[data-profile-generate]',root)?.addEventListener('click',()=>generateProfileLink(Number(data.client_id)));
  $('[data-profile-revoke]',root)?.addEventListener('click',()=>revokeProfileLink(Number(data.client_id)));
  $('[data-profile-copy]',root)?.addEventListener('click',()=>copyProfileLink(Number(data.client_id)));
}
async function loadProfileCompletion(clientId){
  try{renderProfileCompletion(await api(`/admin/clients/${clientId}/profile-completion`))}catch(err){const root=$('#profileCompletionBody');if(root)root.innerHTML=`<div class="lifecycle-warning">${esc(t('profileLinkLoadFailed'))}</div>`}
}
async function generateProfileLink(clientId){
  const btn=$('[data-profile-generate]');if(btn)btn.disabled=true;
  try{const data=await api(`/admin/clients/${clientId}/profile-completion/generate`,{method:'POST',csrf:true,body:{}});if(data.completion_url)profileLinks.set(clientId,data.completion_url);renderProfileCompletion(data);toast(t('profileLinkGenerated'))}catch(err){toast(err.message,'error')}finally{if(btn)btn.disabled=false}
}
async function revokeProfileLink(clientId){
  const ok=await confirmDialog({title:t('profileLinkRevokeTitle'),message:t('profileLinkRevokeConfirm'),confirmText:t('revokeProfileLink'),cancelText:t('cancel'),danger:true});if(!ok)return;
  try{const data=await api(`/admin/clients/${clientId}/profile-completion/revoke`,{method:'POST',csrf:true,body:{}});profileLinks.delete(clientId);renderProfileCompletion(data);toast(t('profileLinkRevokedToast'))}catch(err){toast(err.message,'error')}
}
async function copyProfileLink(clientId){
  const value=profileLinks.get(clientId);if(!value)return;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const input=$('[data-profile-link]');input?.select();document.execCommand('copy')}toast(t('profileLinkCopied'))}catch{toast(t('requestFailed'),'error')}
}
function lifecycleSection(c){
  const actions=[];
  if(c.status==='active'){actions.push(['deactivate',t('deactivateClient'),'ghost-btn']);actions.push(['archive',t('archiveClient'),'ghost-btn'])}
  else if(c.status==='on_hold'){actions.push(['activate',t('activateClient'),'ghost-btn']);actions.push(['archive',t('archiveClient'),'ghost-btn'])}
  else if(c.status==='archived'){actions.push(['restore',t('restoreClient'),'ghost-btn'])}
  const knownBlocked=c.delete_eligibility?.can_delete===false;
  return `<section class="detail-section client-lifecycle section-surface"><div class="detail-section-title"><span>${esc(t('clientLifecycle'))}</span><small>${esc(c.client_code||'')}</small></div><div class="lifecycle-actions">${actions.map(([action,label,cls])=>`<button type="button" class="${cls}" data-client-lifecycle="${action}">${esc(label)}</button>`).join('')}<button type="button" class="danger-btn" data-client-delete ${knownBlocked?'disabled':''}>${esc(t('deleteClient'))}</button></div>${knownBlocked?`<div class="lifecycle-warning">${esc(t('deleteBlockedRelations'))}</div>`:''}</section>`;
}

async function runLifecycle(c,action){
  const destructive=action==='archive'||action==='deactivate';
  if(destructive){
    const ok=await confirmDialog({title:t(action==='archive'?'archiveClient':'deactivateClient'),message:t(action==='archive'?'archiveClientConfirm':'deactivateClientConfirm'),confirmText:t('confirmAction'),cancelText:t('cancel'),danger:action==='archive'});if(!ok)return;
  }
  try{const saved=await api(`/admin/clients/${c.id}/lifecycle`,{method:'POST',csrf:true,body:{action}});state.activeClient=saved;toast(t('clientLifecycleSaved'));await loadClients();await mountClientDrawer(saved)}catch(err){toast(err.message,'error')}
}
async function runDelete(c){
  if(c.delete_eligibility?.can_delete===false){toast(t('deleteBlockedRelations'),'error');return}
  const ok=await confirmDialog({title:t('deleteClient'),message:`${t('deleteClientConfirm')} ${c.client_code}`,confirmText:t('deletePermanently'),cancelText:t('cancel'),danger:true,inputLabel:t('typeClientCode'),inputExpected:c.client_code});if(!ok)return;
  try{await api(`/admin/clients/${c.id}/delete`,{method:'POST',csrf:true,body:{confirm_code:c.client_code}});toast(t('clientDeleted'));closeDrawer();await loadClients()}catch(err){toast(err.message,'error')}
}

export async function mountClientDrawer(c,draft=null,contactDrafts=null){
  const config=await loadClientConfig();openDrawer('CLIENT / '+c.public_id,c.display_name,`<section class="client-identity"><div class="inquiry-avatar">${esc(initials(c.display_name))}</div><div><span class="inquiry-id">${esc(c.client_code||c.public_id)}</span><h3>${esc(c.display_name)}</h3><div class="inquiry-meta-line"><span class="client-status client-status-${esc(c.status)}">${esc(clientStatusLabel(c.status))}</span><span>${esc(clientTypeLabel(c.client_type))}</span><span>${esc(c.default_currency)}</span><span>${esc(fmtDate(c.created_at))}</span></div></div></section><form id="clientEdit" class="edit-form detail-section">${clientFields(c,config)}<div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></form>${clientProjectsSection(c)}${profileCompletionSection(c)}${lifecycleSection(c)}${contactsSection(c)}${conversionSection(c)}`);
  state.drawerMode='client';const form=$('#clientEdit');if(form&&draft)restoreFormValues(form,draft);syncTaxField(form);bindClientTypeRules(form);void loadProfileCompletion(c.id);
  if(Array.isArray(contactDrafts)){for(const item of contactDrafts){const cf=item.key==='new'?$('.contact-new-form'):$(`.contact-form[data-contact-id="${item.key}"]`);if(cf)restoreFormValues(cf,item.data)}}
  form?.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',form);btn.disabled=true;try{const saved=await api('/admin/clients/'+c.id+'/update',{method:'POST',csrf:true,body:clientPayload(form)});state.activeClient=saved;toast(t('saved'));await loadClients();await mountClientDrawer(saved)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  $$('.contact-form').forEach(cf=>cf.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',cf);btn.disabled=true;try{const isNew=cf.dataset.contactNew==='1',path=isNew?`/admin/clients/${c.id}/contacts`:`/admin/clients/${c.id}/contacts/${cf.dataset.contactId}/update`;const saved=await api(path,{method:'POST',csrf:true,body:contactPayload(cf)});state.activeClient=saved;toast(t('contactSaved'));await loadClients();await mountClientDrawer(saved)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}}));
  $$('[data-open-inquiry]').forEach(b=>b.addEventListener('click',()=>openInquiryHandler(Number(b.dataset.openInquiry))));
  $$('[data-open-client-project]').forEach(b=>b.addEventListener('click',()=>openClientProjectHandler(Number(b.dataset.openClientProject))));
  $('[data-open-client-projects]')?.addEventListener('click',()=>openClientProjectsForClientHandler(c));
  $$('[data-client-lifecycle]').forEach(b=>b.addEventListener('click',()=>runLifecycle(c,b.dataset.clientLifecycle)));
  $('[data-client-delete]')?.addEventListener('click',()=>runDelete(c));
}
