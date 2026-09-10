'use strict';

import { state } from '../core/state.js';
import { $, $$, esc, fmtDate, initials, debounce } from '../core/dom.js';
import { t, pair, CLIENT_PROJECT_FILTER_STATUS_KEYS, CLIENT_PROJECT_PRIORITY_KEYS, clientProjectStatusLabel, clientProjectPriorityLabel, milestoneStatusLabel, taskStatusLabel, taskPriorityLabel, executionProgressModeLabel } from '../core/i18n.js';
import { api } from '../core/api.js';
import { toast, openDrawer, openProjectWorkspace, confirmDialog } from '../core/ui.js';
import { faIcon, executionStateIcon } from '../core/icons.js';
import { projectWorkspaceNav, supportSection, filesSection, clientAccessSection, loadProjectSupport, loadProjectFiles, loadProjectAccess, bindWorkspaceNav, captureSupportDraft } from './client-project-support.js';

export async function loadClientProjectConfig(){
  if(state.clientProjectConfig)return state.clientProjectConfig;
  state.clientProjectConfig=await api('/admin/client-projects/config');
  return state.clientProjectConfig;
}

export function renderClientProjectFilters(){
  const status=$('#clientProjectStatusFilter'),priority=$('#clientProjectPriorityFilter');
  if(status){const current=status.value;status.innerHTML=`<option value="">${esc(t('allProjectStatuses'))}</option>`+CLIENT_PROJECT_FILTER_STATUS_KEYS.map(v=>`<option value="${esc(v)}">${esc(clientProjectStatusLabel(v))}</option>`).join('');status.value=CLIENT_PROJECT_FILTER_STATUS_KEYS.includes(current)?current:''}
  if(priority){const current=priority.value;priority.innerHTML=`<option value="">${esc(t('allProjectPriorities'))}</option>`+CLIENT_PROJECT_PRIORITY_KEYS.map(v=>`<option value="${esc(v)}">${esc(clientProjectPriorityLabel(v))}</option>`).join('');priority.value=CLIENT_PROJECT_PRIORITY_KEYS.includes(current)?current:''}
}

export async function loadClientProjects({append=false}={}){
  const q=$('#clientProjectSearch')?.value.trim()||'',status=$('#clientProjectStatusFilter')?.value||'',priority=$('#clientProjectPriorityFilter')?.value||'';
  const clientId=state.clientProjectClientScope?.id||null;const params=new URLSearchParams({...(q?{q}:{}),...(status?{status}:{}),...(priority?{priority}:{}),...(clientId?{client_id:String(clientId)}:{}),...(append&&state.clientProjectMeta?.next_cursor?{cursor:state.clientProjectMeta.next_cursor}:{})});
  const payload=await api('/admin/client-projects?'+params.toString());const items=payload?.items||[];
  state.clientProjects=append?[...state.clientProjects,...items]:items;state.clientProjectMeta=payload?.meta||{count:items.length,has_more:false,next_cursor:null};renderClientProjects();
}

function projectState(project){return project.archived_at||project.is_archived?'archived':project.status}
function progressValue(project){const n=Number(project.effective_progress_percent??project.manual_progress_percent??0);return Math.max(0,Math.min(100,Number.isFinite(n)?n:0))}

export function renderClientProjects(){
  renderClientProjectFilters();const scope=$('#clientProjectScopeBar');if(scope){const c=state.clientProjectClientScope;if(c){scope.hidden=false;scope.innerHTML=`<div><span>${esc(t('clientProjectsScope'))}</span><strong>${esc(c.display_name||c.name||'')} · ${esc(c.client_code||'')}</strong></div><button type="button" class="ghost-btn compact-btn" data-clear-client-project-scope>${esc(t('showAllProjects'))}</button>`;$('[data-clear-client-project-scope]',scope)?.addEventListener('click',async()=>{state.clientProjectClientScope=null;state.clientProjectMeta=null;await loadClientProjects()})}else{scope.hidden=true;scope.innerHTML=''}}const body=$('#clientProjectsBody');if(!body)return;
  if(!state.clientProjects.length)body.innerHTML=`<tr><td colspan="7"><div class="empty-state">${esc(t('noClientProjects'))}</div></td></tr>`;
  else body.innerHTML=state.clientProjects.map(p=>{const status=projectState(p),progress=progressValue(p);return `<tr data-client-project-id="${p.id}"><td><div class="table-client-cell"><span class="table-avatar project-avatar">${esc(initials(p.name))}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.project_code||p.public_id)}</small></div></div></td><td><strong>${esc(p.client_display_name||'—')}</strong><small>${esc(p.client_code||'')}</small></td><td><span class="project-status project-status-${esc(status)}">${esc(clientProjectStatusLabel(status))}</span><small class="project-priority">${esc(clientProjectPriorityLabel(p.priority))}</small></td><td><div class="project-progress"><span style="--progress:${progress}%"></span><b>${progress}%</b></div></td><td>${esc(p.target_date||'—')}</td><td>${esc(fmtDate(p.updated_at))}</td><td class="row-action">${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</td></tr>`}).join('');
  $$('tr[data-client-project-id]',body).forEach(row=>row.addEventListener('click',()=>openClientProject(Number(row.dataset.clientProjectId))));const more=$('#loadMoreClientProjects');if(more)more.hidden=!state.clientProjectMeta?.has_more;
}

function options(values,current,labeler=v=>v){return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(labeler(v))}</option>`).join('')}
function restoreFormValues(form,data){
  if(!form||!data)return;for(const [name,value] of Object.entries(data)){const el=form.elements.namedItem(name);if(!el)continue;if(typeof RadioNodeList!=='undefined'&&el instanceof RadioNodeList){for(const item of el)item.checked=item.value===String(value)}else if(el.type==='checkbox')el.checked=value===true||value==='on'||value==='true'||value===1||value==='1';else el.value=value??''}
}
function captureFormValues(form){
  if(!form)return null;const data=Object.fromEntries(new FormData(form));for(const el of Array.from(form.elements||[])){if(!el?.name)continue;if(el.type==='checkbox')data[el.name]=Boolean(el.checked);if(el.type==='radio'&&el.checked)data[el.name]=el.value}return data;
}
function captureExecutionDraft(){
  const milestones={};for(const form of $$('form[data-milestone-id]'))milestones[form.dataset.milestoneId]=captureFormValues(form);
  const tasks={};for(const form of $$('form[data-task-id]'))tasks[form.dataset.taskId]=captureFormValues(form);
  const milestoneOpen={};for(const form of $$('form[data-milestone-id]'))milestoneOpen[form.dataset.milestoneId]=Boolean(form.closest('details')?.open);
  const taskOpen={};for(const form of $$('form[data-task-id]'))taskOpen[form.dataset.taskId]=Boolean(form.closest('details')?.open);
  return {
    tab:lastExecutionTab,
    newMilestone:captureFormValues($('[data-new-milestone]')),
    newMilestoneOpen:Boolean($('[data-new-milestone]')?.closest('details')?.open),
    milestones,
    milestoneOpen,
    newTask:captureFormValues($('[data-new-task]')),
    newTaskOpen:Boolean($('[data-new-task]')?.closest('details')?.open),
    tasks,
    taskOpen
  };
}
function restoreExecutionDraft(root,draft){
  if(!root||!draft)return;
  restoreFormValues($('[data-new-milestone]',root),draft.newMilestone);
  restoreFormValues($('[data-new-task]',root),draft.newTask);
  const newMilestoneShell=$('[data-new-milestone]',root)?.closest('details');
  const newTaskShell=$('[data-new-task]',root)?.closest('details');
  if(newMilestoneShell)newMilestoneShell.open=Boolean(draft.newMilestoneOpen);
  if(newTaskShell)newTaskShell.open=Boolean(draft.newTaskOpen);
  for(const form of $$('form[data-milestone-id]',root)){
    restoreFormValues(form,draft.milestones?.[form.dataset.milestoneId]);
    const shell=form.closest('details');if(shell&&draft.milestoneOpen?.[form.dataset.milestoneId]!==undefined)shell.open=Boolean(draft.milestoneOpen[form.dataset.milestoneId]);
  }
  for(const form of $$('form[data-task-id]',root)){
    restoreFormValues(form,draft.tasks?.[form.dataset.taskId]);
    const shell=form.closest('details');if(shell&&draft.taskOpen?.[form.dataset.taskId]!==undefined)shell.open=Boolean(draft.taskOpen[form.dataset.taskId]);
  }
}
function currencyOptions(config,current){return `<option value="">—</option>`+(config?.currencies||[]).map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('')}
function serviceCards(config,project=null){
  const selected=new Map((project?.services||[]).map(x=>[Number(x.service_id),x]));return `<div class="project-service-grid">${(config?.services||[]).map((s,index)=>{const row=selected.get(Number(s.id)),checked=Boolean(row),title=pair(s.title_ar,s.title_en,s.slug);return `<article class="project-service-card ${checked?'is-selected':''}" data-project-service-card="${s.id}"><label class="project-service-toggle"><input type="checkbox" name="service_${s.id}" data-project-service="${s.id}" ${checked?'checked':''}><span><strong>${esc(title)}</strong><small>${esc(s.slug)}</small></span></label><label class="field project-service-note"><span>${esc(t('serviceScopeNote'))}</span><input name="service_scope_${s.id}" data-service-scope="${s.id}" maxlength="1000" value="${esc(row?.scope_note||'')}" ${checked?'':'disabled'}></label></article>`}).join('')}</div>`;
}
function memberCards(config,project=null,{creating=false}={}){
  const selected=new Map((project?.members||[]).map(x=>[Number(x.admin_user_id),x]));if(creating&&!selected.size&&state.user?.id)selected.set(Number(state.user.id),{admin_user_id:Number(state.user.id),role_key:'project_lead',is_lead:1});
  return `<div class="project-member-grid">${(config?.admins||[]).map(a=>{const row=selected.get(Number(a.id)),checked=Boolean(row);return `<article class="project-member-card ${checked?'is-selected':''}" data-project-member-card="${a.id}"><label class="project-member-main"><input type="checkbox" name="member_${a.id}" data-project-member="${a.id}" ${checked?'checked':''}><span class="table-avatar">${esc(initials(a.name))}</span><span><strong>${esc(a.name)}</strong><small>${esc(a.email)}</small></span></label><div class="project-member-meta"><label class="field"><span>${esc(t('memberRole'))}</span><input name="member_role_${a.id}" maxlength="64" value="${esc(row?.role_key||'')}" ${checked?'':'disabled'}></label><label class="check-row"><input type="radio" name="project_lead" value="${a.id}" ${Number(row?.is_lead)===1?'checked':''} ${checked?'':'disabled'}><span>${esc(t('projectLead'))}</span></label></div></article>`}).join('')}</div>`;
}
function bindAssociationCards(form){
  $$('[data-project-service]',form).forEach(input=>input.addEventListener('change',()=>{const card=input.closest('[data-project-service-card]'),note=card?.querySelector('[data-service-scope]');card?.classList.toggle('is-selected',input.checked);if(note)note.disabled=!input.checked}));
  $$('[data-project-member]',form).forEach(input=>input.addEventListener('change',()=>{const card=input.closest('[data-project-member-card]'),meta=card?.querySelector('.project-member-meta');card?.classList.toggle('is-selected',input.checked);$$('input',meta).forEach(el=>el.disabled=!input.checked);if(!input.checked){const lead=card?.querySelector('input[type=radio]');if(lead)lead.checked=false}}));
}
function collectProjectPayload(form,config,{creating=false}={}){
  const data=Object.fromEntries(new FormData(form));const services=(config?.services||[]).filter(s=>form.elements[`service_${s.id}`]?.checked).map((s,index)=>({service_id:Number(s.id),sort_order:index,scope_note:String(form.elements[`service_scope_${s.id}`]?.value||'').trim()}));
  const lead=String(form.elements.project_lead?.value||'');const members=(config?.admins||[]).filter(a=>form.elements[`member_${a.id}`]?.checked).map(a=>({admin_user_id:Number(a.id),role_key:String(form.elements[`member_role_${a.id}`]?.value||'').trim(),is_lead:lead===String(a.id)}));
  const payload={name:data.name,description:data.description||'',priority:data.priority,manual_progress_percent:data.manual_progress_percent,start_date:data.start_date||'',target_date:data.target_date||'',agreed_amount:data.agreed_amount||'',currency:data.currency||'',services,members};
  if(creating)payload.client_id=Number(data.client_id);else payload.status=data.status;return payload;
}

async function fetchClientChoices(q=''){const params=new URLSearchParams({status:'active',...(q.trim()?{q:q.trim()}:{})});const payload=await api('/admin/clients?'+params.toString());return payload?.items||[]}
function clientSelectHtml(clients,selected=''){return `<select id="projectClientSelect" class="select-input" name="client_id" required><option value="">${esc(t('selectProjectClient'))}</option>${clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(selected)?'selected':''}>${esc(c.display_name)} · ${esc(c.client_code||'')}</option>`).join('')}</select>`}

export async function openNewClientProject(draft=null){
  try{
    const config=await loadClientProjectConfig(),scope=state.clientProjectClientScope,clientSearch=draft?.clientSearch||(scope?.client_code||''),clients=await fetchClientChoices(clientSearch);state.activeInquiry=null;state.activeClient=null;state.activeClientProject=null;state.drawerMode='new-client-project';
    openDrawer('OPERATIONS / NEW',t('addClientProject'),`<form id="newClientProjectForm" class="edit-form"><section class="form-section"><div class="detail-section-title"><span>${esc(t('projectIdentity'))}</span><small>${esc(t('projectCodeAutoHint'))}</small></div><div class="project-client-picker"><div class="existing-client-search"><input id="projectClientSearchInput" type="search" value="${esc(clientSearch)}" placeholder="${esc(t('searchClientForProject'))}"><button id="projectClientSearchBtn" class="ghost-btn" type="button">${esc(t('loadProjectClientChoices'))}</button></div><div id="projectClientSelectHost">${clientSelectHtml(clients,draft?.data?.client_id||scope?.id||'')}</div></div><div class="fields-2"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="190" required></label><div class="field"><span>${esc(t('projectStatus'))}</span><div class="readonly-control"><span class="project-status project-status-planning">${esc(clientProjectStatusLabel('planning'))}</span></div></div><label class="field"><span>${esc(t('projectPriority'))}</span><select class="select-input" name="priority">${options(config.priorities,'normal',clientProjectPriorityLabel)}</select></label><label class="field"><span>${esc(t('manualProgress'))}</span><input name="manual_progress_percent" type="number" min="0" max="100" step="1" value="0"></label></div><label class="field"><span>${esc(t('projectDescription'))}</span><textarea name="description" maxlength="10000"></textarea></label></section><section class="form-section"><h3>${esc(t('projectPlanning'))}</h3><div class="fields-2"><label class="field"><span>${esc(t('startDate'))}</span><input name="start_date" type="date"></label><label class="field"><span>${esc(t('targetDate'))}</span><input name="target_date" type="date"></label></div></section><section class="form-section"><h3>${esc(t('projectCommercial'))}</h3><div class="fields-2"><label class="field"><span>${esc(t('agreedAmount'))}</span><input name="agreed_amount" inputmode="decimal" placeholder="${esc(t('projectAmountPlaceholder'))}"></label><label class="field"><span>${esc(t('defaultCurrency'))}</span><select class="select-input" name="currency">${currencyOptions(config,config.default_currency)}</select></label></div></section><section class="form-section"><h3>${esc(t('projectServices'))}</h3>${serviceCards(config,null)}</section><section class="form-section"><h3>${esc(t('projectMembers'))}</h3>${memberCards(config,null,{creating:true})}</section><div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('addClientProject'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></form>`);
    const form=$('#newClientProjectForm');if(draft?.data)restoreFormValues(form,draft.data);bindAssociationCards(form);
    const runSearch=async()=>{const q=$('#projectClientSearchInput')?.value||'';try{const items=await fetchClientChoices(q),selected=form.elements.client_id?.value||draft?.data?.client_id||'';$('#projectClientSelectHost').innerHTML=clientSelectHtml(items,selected)}catch(e){toast(e.message,'error')}};
    $('#projectClientSearchBtn')?.addEventListener('click',runSearch);$('#projectClientSearchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runSearch()}});
    form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',form);btn.disabled=true;try{const created=await api('/admin/client-projects',{method:'POST',csrf:true,body:collectProjectPayload(form,config,{creating:true})});toast(t('projectCreated'));state.activeClientProject=created;state.drawerMode=null;await loadClientProjects();mountClientProjectDrawer(created)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  }catch(e){toast(e.message,'error')}
}

function projectHeader(p){
  const status=projectState(p),progress=progressValue(p);
  return `<section class="project-command-hero"><div class="project-command-main"><span class="project-command-avatar">${esc(initials(p.name))}</span><div class="project-command-copy"><div class="project-command-meta"><span class="eyebrow">${esc(p.project_code||p.public_id)}</span><span class="project-command-status project-status-${esc(status)}">${esc(clientProjectStatusLabel(status))}</span></div><h2 title="${esc(p.name)}">${esc(p.name)}</h2></div></div><div class="project-command-metrics"><div class="project-command-metric"><div><small>${esc(t('client'))}</small><strong title="${esc(p.client_display_name||'—')}">${esc(p.client_display_name||'—')}</strong></div></div><div class="project-command-metric"><div><small>${esc(t('projectTarget'))}</small><strong>${esc(p.target_date||'—')}</strong></div></div><div class="project-command-progress" style="--project-progress:${progress}" role="progressbar" aria-label="${esc(t('projectProgress'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><div><i></i></div><b>${progress}%</b></div></div></section>`;
}
function linkedInquiries(p){const rows=p.inquiries||[];return `<section data-project-module="inquiries" class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('projectInquiries'))}</span><small>${rows.length}</small></div><div id="linkedProjectInquiries" class="client-source-list">${rows.length?rows.map(i=>`<div class="client-source-card static-card"><div><strong>${esc(i.name||i.public_id)}</strong><small>${esc(i.email||'')} · ${esc(i.client_request_id||i.public_id)}</small></div><span>${esc(clientProjectStatusLabel(i.status)||i.status)} · ${esc(fmtDate(i.linked_at))}</span></div>`).join(''):`<div class="empty-inline">${esc(t('noProjectInquiries'))}</div>`}</div>${p.archived_at?'':`<div class="project-inquiry-linker"><div class="existing-client-search"><input id="projectInquirySearch" type="search" placeholder="${esc(t('searchProjectInquiries'))}"><button id="projectInquirySearchBtn" class="ghost-btn" type="button">${esc(t('searchClientAction'))}</button></div><div id="projectInquiryOptions"></div></div>`}</section>`}
function lifecycleSection(p){return `<section data-project-module="lifecycle" class="detail-section section-surface"><div class="detail-section-title"><span>${esc(t('projectLifecycle'))}</span><small>${esc(p.project_code||'')}</small></div>${p.archived_at?`<p class="lifecycle-warning">${esc(t('projectArchivedReadOnly'))}</p><div class="lifecycle-actions"><button id="restoreClientProjectBtn" class="primary-btn" type="button">${esc(t('restoreProject'))}</button></div>`:`<div class="lifecycle-actions"><button id="archiveClientProjectBtn" class="danger-btn" type="button">${esc(t('archiveProject'))}</button></div>`}</section>`}

let lastExecutionTab='milestones';
function executionSection(p){return `<section data-project-module="execution" class="detail-section section-surface project-execution-section"><div class="detail-section-title"><span>${esc(t('projectExecution'))}</span><small>${esc(p.project_code||'')}</small></div><div id="projectExecutionRoot" class="project-execution-root"><div class="profile-completion-loading" aria-hidden="true"></div></div></section>`}
function executionToday(){return new Date().toISOString().slice(0,10)}
function taskVisualState(task){
  if(task?.archived_at)return 'archived';
  if(task?.status==='done')return 'done';
  if(task?.status==='cancelled')return 'cancelled';
  if(task?.due_date&&task.due_date<executionToday())return 'overdue';
  return task?.status||'todo';
}
function milestoneVisualState(m){
  if(m?.archived_at)return 'archived';
  if(m?.status==='completed')return 'completed';
  if(m?.status==='cancelled')return 'cancelled';
  if(m?.target_date&&m.target_date<executionToday())return 'overdue';
  return m?.status||'pending';
}
function executionVisualIcon(state,className=''){
  return executionStateIcon(state,className);
}
function executionVisualLabel(kind,state){
  if(state==='overdue')return t('overdueTasks');
  return kind==='milestone'?milestoneStatusLabel(state):taskStatusLabel(state);
}
function executionStatusPill(kind,item){
  const state=kind==='milestone'?milestoneVisualState(item):taskVisualState(item);
  return `<span class="execution-status-pill status-${esc(state)}"><span class="execution-status-icon">${executionVisualIcon(state,'execution-status-fa')}</span><span>${esc(executionVisualLabel(kind,state))}</span></span>`;
}
function milestoneSelectOptions(milestones,current){
  const active=milestones.filter(m=>!m.archived_at);
  let html=`<option value="">${esc(t('noMilestone'))}</option>`;
  if(current&&!active.some(m=>Number(m.id)===Number(current))){
    const old=milestones.find(m=>Number(m.id)===Number(current));
    if(old)html+=`<option value="${old.id}" selected>${esc(old.title)} · ${esc(milestoneStatusLabel(old.status))}</option>`;
  }
  return html+active.map(m=>`<option value="${m.id}" ${Number(m.id)===Number(current)?'selected':''}>${esc(m.title)}</option>`).join('');
}
function assigneeChecks(p,task=null){
  const selected=new Set((task?.assignees||[]).map(x=>Number(x.admin_user_id)));
  const members=(p.members||[]).filter(x=>Number(x.is_active)!==0);
  return `<div class="task-assignee-grid">${members.length?members.map(m=>{
    const checked=selected.has(Number(m.admin_user_id)),lead=Number(m.is_lead)===1,meta=m.email||m.role_key||'';
    return `<label class="task-assignee-card ${checked?'is-selected':''}" data-task-assignee-card><span class="task-assignee-person"><span class="table-avatar task-assignee-avatar">${esc(initials(m.name))}</span><span class="task-assignee-copy"><span class="task-assignee-name-row"><strong title="${esc(m.name)}">${esc(m.name)}</strong>${lead?`<span class="task-assignee-lead">${esc(t('projectLead'))}</span>`:''}</span>${meta?`<small title="${esc(meta)}">${esc(meta)}</small>`:''}</span></span><input class="task-assignee-input" type="checkbox" name="assignee_${m.admin_user_id}" value="${m.admin_user_id}" data-task-assignee ${checked?'checked':''}></label>`;
  }).join(''):`<div class="empty-inline">${esc(t('noProjectMembers'))}</div>`}</div><small class="field-help">${esc(t('taskAssigneeHint'))}</small>`;
}
function taskAssigneeMini(task){
  const assignees=task?.assignees||[];
  if(!assignees.length)return '';
  const visible=assignees.slice(0,3);
  return `<span class="task-card-assignees" title="${esc(assignees.map(x=>x.name||x.email||'').filter(Boolean).join(', '))}">${visible.map(x=>`<span class="task-card-avatar">${esc(initials(x.name||x.email||'?'))}</span>`).join('')}${assignees.length>3?`<span class="task-card-avatar task-card-avatar-more">+${assignees.length-3}</span>`:''}</span>`;
}
function clientVisibleToggle(checked=false){return `<label class="client-visible-toggle"><input type="checkbox" name="client_visible" ${checked?'checked':''}><span class="client-visible-switch">${faIcon('eye',{fallback:'•'})}</span><span class="client-visible-copy"><strong>${esc(t('clientVisible'))}</strong><small>${esc(t('clientVisibleHint'))}</small></span></label>`}
function milestoneEditor(m,config,{creating=false}={}){
  const archived=Boolean(m?.archived_at);
  if(creating){
    return `<details class="execution-editor execution-create-card milestone-create-card"><summary class="execution-create-summary"><span class="execution-create-icon">${faIcon('plus',{fallback:'+'})}</span><span class="execution-create-copy"><strong>${esc(t('addMilestone'))}</strong><small>${esc(t('addMilestoneHint'))}</small></span><span class="execution-chevron">${faIcon('chevron-down',{fallback:'⌄'})}</span></summary><form class="execution-form" data-new-milestone="1"><fieldset><div class="fields-2"><label class="field"><span>${esc(t('milestoneTitle'))}</span><input name="title" maxlength="190" required></label><div class="field"><span>${esc(t('milestoneStatus'))}</span><div class="readonly-control">${esc(milestoneStatusLabel('pending'))}</div></div><label class="field"><span>${esc(t('milestoneTarget'))}</span><input type="date" name="target_date"></label><label class="field"><span>${esc(t('milestoneSort'))}</span><input type="number" min="0" step="1" name="sort_order" value="0"></label></div><label class="field"><span>${esc(t('milestoneDescription'))}</span><textarea name="description" maxlength="10000"></textarea></label>${clientVisibleToggle(false)}<div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('addMilestone'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></fieldset></form></details>`;
  }
  const visual=milestoneVisualState(m);
  return `<details class="execution-editor milestone-editor milestone-visual-card status-${esc(visual)} ${archived?'is-archived':''}"><summary class="milestone-visual-summary"><span class="milestone-visual-main"><span class="milestone-visual-icon" aria-hidden="true">${executionVisualIcon(visual,'milestone-state-fa')}</span><span><strong>${esc(m?.title||'')}</strong><small>${m?.description?esc(m.description):esc(m?.target_date||'')}</small></span></span><span class="milestone-visual-side">${executionStatusPill('milestone',m)}${m?.target_date?`<span class="execution-date">${esc(m.target_date)}</span>`:''}<span class="execution-chevron">${faIcon('chevron-down',{fallback:'⌄'})}</span></span></summary><form class="execution-form" data-milestone-id="${m.id}"><fieldset ${archived?'disabled':''}><div class="fields-2"><label class="field"><span>${esc(t('milestoneTitle'))}</span><input name="title" maxlength="190" value="${esc(m?.title||'')}" required></label><label class="field"><span>${esc(t('milestoneStatus'))}</span><select class="select-input" name="status">${options(config.execution?.milestone_statuses||[],m.status,milestoneStatusLabel)}</select></label><label class="field"><span>${esc(t('milestoneTarget'))}</span><input type="date" name="target_date" value="${esc(m?.target_date||'')}"></label><label class="field"><span>${esc(t('milestoneSort'))}</span><input type="number" min="0" step="1" name="sort_order" value="${esc(m?.sort_order??0)}"></label></div><label class="field"><span>${esc(t('milestoneDescription'))}</span><textarea name="description" maxlength="10000">${esc(m?.description||'')}</textarea></label>${clientVisibleToggle(Number(m?.client_visible)===1)}<div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></fieldset><div class="execution-lifecycle">${archived?`<button type="button" class="ghost-btn" data-milestone-lifecycle="restore" data-id="${m.id}">${faIcon('rotate-left',{fallback:'↻'})}<span>${esc(t('restoreMilestone'))}</span></button>`:`<button type="button" class="danger-btn" data-milestone-lifecycle="archive" data-id="${m.id}">${faIcon('box-archive',{fallback:'□'})}<span>${esc(t('archiveMilestone'))}</span></button>`}</div></form></details>`;
}
function taskEditor(task,p,milestones,config,{creating=false}={}){
  const archived=Boolean(task?.archived_at);
  if(creating){
    const assignees=assigneeChecks(p,null);
    return `<details class="execution-editor execution-create-card task-create-card" data-new-task-shell><summary class="execution-create-summary"><span class="execution-create-icon">${faIcon('plus',{fallback:'+'})}</span><span class="execution-create-copy"><strong>${esc(t('addTask'))}</strong><small>${esc(t('addTaskHint'))}</small></span><span class="execution-chevron">${faIcon('chevron-down',{fallback:'⌄'})}</span></summary><form class="execution-form" data-new-task="1"><fieldset><div class="fields-2"><label class="field"><span>${esc(t('taskTitle'))}</span><input name="title" maxlength="190" required></label><div class="field"><span>${esc(t('taskStatus'))}</span><div class="readonly-control">${esc(taskStatusLabel('todo'))}</div></div><label class="field"><span>${esc(t('taskPriority'))}</span><select class="select-input" name="priority">${options(config.execution?.task_priorities||config.priorities||[],'normal',taskPriorityLabel)}</select></label><label class="field"><span>${esc(t('taskMilestone'))}</span><select class="select-input" name="milestone_id">${milestoneSelectOptions(milestones,'')}</select></label><label class="field"><span>${esc(t('taskStart'))}</span><input type="date" name="start_date"></label><label class="field"><span>${esc(t('taskDue'))}</span><input type="date" name="due_date"></label><label class="field"><span>${esc(t('taskSort'))}</span><input type="number" min="0" step="1" name="sort_order" value="0"></label></div><label class="field"><span>${esc(t('taskDescription'))}</span><textarea name="description" maxlength="10000"></textarea></label>${clientVisibleToggle(false)}<div class="field"><span>${esc(t('taskAssignees'))}</span>${assignees}</div><div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('addTask'))}</span><span class="btn-fa">${faIcon('plus',{fallback:'+'})}</span></button></div></fieldset></form></details>`;
  }
  const visual=taskVisualState(task),assignees=assigneeChecks(p,task);
  const milestoneTitle=task?.milestone_title||t('noMilestone');
  const priorityMeta=`<span class="task-meta-chip task-meta-priority">${faIcon('flag',{fallback:'!'})}<span>${esc(taskPriorityLabel(task.priority))}</span></span>`;
  const dueMeta=task?.due_date?`<span class="task-meta-chip task-meta-date"><span>${faIcon('calendar-days',{fallback:'•'})}</span><span dir="ltr">${esc(task.due_date)}</span></span>`:'';
  return `<details class="execution-editor task-editor task-visual-card status-${esc(visual)} ${archived?'is-archived':''}" data-task-visual-card="${task.id}"><summary class="task-visual-summary"><span class="task-visual-main"><span class="task-visual-icon" aria-hidden="true">${executionVisualIcon(visual,'task-state-fa')}</span><span class="task-visual-copy"><strong>${esc(task?.title||'')}</strong><small>${esc(milestoneTitle)}</small></span></span><span class="task-visual-side"><span class="task-meta-row">${priorityMeta}${dueMeta}${taskAssigneeMini(task)}</span><span class="task-card-actions">${executionStatusPill('task',task)}<span class="execution-chevron">${faIcon('chevron-down',{fallback:'⌄'})}</span></span></span></summary><form class="execution-form" data-task-id="${task.id}"><fieldset ${archived?'disabled':''}><div class="fields-2"><label class="field"><span>${esc(t('taskTitle'))}</span><input name="title" maxlength="190" value="${esc(task?.title||'')}" required></label><label class="field"><span>${esc(t('taskStatus'))}</span><select class="select-input" name="status">${options(config.execution?.task_statuses||[],task.status,taskStatusLabel)}</select></label><label class="field"><span>${esc(t('taskPriority'))}</span><select class="select-input" name="priority">${options(config.execution?.task_priorities||config.priorities||[],task?.priority||'normal',taskPriorityLabel)}</select></label><label class="field"><span>${esc(t('taskMilestone'))}</span><select class="select-input" name="milestone_id">${milestoneSelectOptions(milestones,task?.milestone_id||'')}</select></label><label class="field"><span>${esc(t('taskStart'))}</span><input type="date" name="start_date" value="${esc(task?.start_date||'')}"></label><label class="field"><span>${esc(t('taskDue'))}</span><input type="date" name="due_date" value="${esc(task?.due_date||'')}"></label><label class="field"><span>${esc(t('taskSort'))}</span><input type="number" min="0" step="1" name="sort_order" value="${esc(task?.sort_order??0)}"></label></div><label class="field"><span>${esc(t('taskDescription'))}</span><textarea name="description" maxlength="10000">${esc(task?.description||'')}</textarea></label>${clientVisibleToggle(Number(task?.client_visible)===1)}<div class="field"><span>${esc(t('taskAssignees'))}</span>${assignees}</div><div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></fieldset><div class="execution-lifecycle">${archived?`<button type="button" class="ghost-btn" data-task-lifecycle="restore" data-id="${task.id}">${faIcon('rotate-left',{fallback:'↻'})}<span>${esc(t('restoreTask'))}</span></button>`:`<button type="button" class="danger-btn" data-task-lifecycle="archive" data-id="${task.id}">${faIcon('box-archive',{fallback:'□'})}<span>${esc(t('archiveTask'))}</span></button>`}</div></form></details>`;
}
function taskStageGroups(tasks,milestones){
  const groups=[];
  const byMilestone=new Map();
  for(const task of tasks){
    const key=task.milestone_id?Number(task.milestone_id):0;
    if(!byMilestone.has(key))byMilestone.set(key,[]);
    byMilestone.get(key).push(task);
  }
  for(const milestone of milestones)groups.push({key:Number(milestone.id),milestone,tasks:byMilestone.get(Number(milestone.id))||[]});
  const ungrouped=byMilestone.get(0)||[];
  if(ungrouped.length)groups.push({key:0,milestone:null,tasks:ungrouped});
  return groups;
}
function taskStageDistribution(tasks){
  const visible=tasks.filter(task=>!task.archived_at);
  if(!visible.length)return '';
  const order=['done','in_progress','overdue','blocked','todo','cancelled'];
  const counts=new Map(order.map(x=>[x,0]));
  for(const task of visible){const state=taskVisualState(task);counts.set(state,(counts.get(state)||0)+1)}
  const total=visible.length;
  const segments=order.filter(state=>(counts.get(state)||0)>0).map(state=>{
    const count=counts.get(state)||0,share=Math.max(2,(count/total)*100),label=executionVisualLabel('task',state);
    return `<span class="task-stage-status-segment status-${esc(state)}" style="--share:${share}%" title="${esc(label)}: ${count}"></span>`;
  }).join('');
  const keys=order.filter(state=>(counts.get(state)||0)>0).map(state=>`<span class="task-stage-status-key status-${esc(state)}" title="${esc(executionVisualLabel('task',state))}">${executionVisualIcon(state,'stage-status-fa')}<b>${counts.get(state)||0}</b></span>`).join('');
  return `<div class="task-stage-status-visual"><div class="task-stage-status-map">${segments}</div><div class="task-stage-status-keys">${keys}</div></div>`;
}
function taskStageCard(group,p,milestones,config,index){
  const milestone=group.milestone;
  const visual=milestone?milestoneVisualState(milestone):'pending';
  const counted=group.tasks.filter(task=>!task.archived_at&&task.status!=='cancelled');
  const done=counted.filter(task=>task.status==='done').length;
  const progress=counted.length?Math.round((done/counted.length)*100):0;
  const title=milestone?.title||t('noMilestone');
  const description=milestone?.description||t('ungroupedTasksHint');
  return `<section class="task-stage-group status-${esc(visual)}" data-task-stage="${milestone?.id||'none'}"><header class="task-stage-head"><div class="task-stage-heading"><span class="task-stage-icon" aria-hidden="true">${faIcon('layer-group',{fallback:'•',className:'stage-layer-fa'})}</span><div><div class="task-stage-title-row"><strong>${esc(title)}</strong><b>${group.tasks.length}</b></div><small>${esc(description)}</small></div></div><div class="task-stage-progress"><div><span>${esc(pair(`${done} من ${counted.length} مكتملة`,`${done} of ${counted.length} completed`))}</span><strong>${progress}%</strong></div><div class="task-stage-progress-bar"><span style="--progress:${progress}%"></span></div>${taskStageDistribution(group.tasks)}</div>${milestone?executionStatusPill('milestone',milestone):''}</header><div class="task-stage-cards">${group.tasks.length?group.tasks.map(task=>taskEditor(task,p,milestones,config)).join(''):`<div class="task-stage-empty">${esc(t('noTasksInStage'))}</div>`}</div></section>`;
}
function summaryCards(summary){
  const items=[
    {key:'total',label:t('totalTasks'),value:summary.task_count,icon:'list-check',fallback:'≡'},
    {key:'done',label:t('completedTasks'),value:summary.task_done_count,icon:'circle-check',fallback:'✓'},
    {key:'in-progress',label:t('inProgressTasks'),value:summary.task_in_progress_count,icon:'arrows-rotate',fallback:'↻'},
    {key:'blocked',label:t('blockedTasks'),value:summary.task_blocked_count,icon:'circle-pause',fallback:'!'},
    {key:'overdue',label:t('overdueTasks'),value:summary.task_overdue_count,icon:'triangle-exclamation',fallback:'!'}
  ];
  return `<div class="execution-summary"><div class="execution-progress-card"><div><span>${esc(t('projectProgress'))}</span><strong>${Number(summary.effective_progress_percent||0)}%</strong></div><div class="project-progress execution-progress"><span style="--progress:${Number(summary.effective_progress_percent||0)}%"></span></div><small>${faIcon('chart-line',{fallback:'•'})}<span>${esc(executionProgressModeLabel(summary.progress_mode))}</span></small></div>${items.map(item=>`<div class="execution-stat execution-stat-${item.key}"><span class="execution-stat-icon" aria-hidden="true">${faIcon(item.icon,{fallback:item.fallback,className:'execution-stat-fa'})}</span><strong>${Number(item.value||0)}</strong><span>${esc(item.label)}</span></div>`).join('')}</div>`;
}
function collectMilestone(form,{creating=false}={}){
  const d=Object.fromEntries(new FormData(form));
  const out={title:d.title,description:d.description||'',target_date:d.target_date||'',sort_order:Number(d.sort_order||0),client_visible:Boolean(form.elements.client_visible?.checked)};
  if(!creating)out.status=d.status;
  return out;
}
function collectTask(form,p,{creating=false}={}){
  const d=Object.fromEntries(new FormData(form));
  const assignees=(p.members||[]).filter(m=>form.elements[`assignee_${m.admin_user_id}`]?.checked).map(m=>({admin_user_id:Number(m.admin_user_id)}));
  const out={title:d.title,description:d.description||'',priority:d.priority,milestone_id:d.milestone_id?Number(d.milestone_id):null,start_date:d.start_date||'',due_date:d.due_date||'',sort_order:Number(d.sort_order||0),client_visible:Boolean(form.elements.client_visible?.checked),assignees};
  if(!creating)out.status=d.status;
  return out;
}
async function refreshProjectAfterExecution(p,{focusExecution=false}={}){
  const fresh=await api(`/admin/client-projects/${p.id}`);
  state.activeClientProject=fresh;
  await loadClientProjects();
  mountClientProjectDrawer(fresh,{execution:{tab:lastExecutionTab,newTaskOpen:false,newMilestoneOpen:false}});
  if(focusExecution)requestAnimationFrame(()=>$('#projectExecutionRoot')?.closest('.project-execution-section')?.scrollIntoView({block:'start'}));
}
function bindExecution(p,summary,milestones,tasks,config){
  $$('[data-task-assignee]').forEach(input=>{
    const sync=()=>input.closest('[data-task-assignee-card]')?.classList.toggle('is-selected',input.checked);
    sync();input.addEventListener('change',sync);
  });
  $$('[data-execution-tab]').forEach(b=>b.addEventListener('click',()=>{
    lastExecutionTab=b.dataset.executionTab;
    $$('[data-execution-tab]').forEach(x=>x.classList.toggle('is-active',x===b));
    $$('[data-execution-panel]').forEach(x=>x.hidden=x.dataset.executionPanel!==lastExecutionTab);
  }));
  $('#executionProgressMode')?.addEventListener('change',async e=>{
    const select=e.currentTarget;select.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/execution/progress-mode`,{method:'POST',csrf:true,body:{progress_mode:select.value}});
      toast(t('progressModeSaved'));await refreshProjectAfterExecution(p);
    }catch(err){toast(err.message,'error');select.value=summary.progress_mode}
    finally{select.disabled=false}
  });
  $('[data-new-milestone]')?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/milestones`,{method:'POST',csrf:true,body:collectMilestone(e.currentTarget,{creating:true})});
      toast(t('milestoneCreated'));lastExecutionTab='milestones';await refreshProjectAfterExecution(p,{focusExecution:true});
    }catch(err){toast(err.message,'error')}
    finally{btn.disabled=false}
  });
  $$('form[data-milestone-id]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();const id=Number(form.dataset.milestoneId),btn=$('button[type=submit]',form);btn.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/milestones/${id}/update`,{method:'POST',csrf:true,body:collectMilestone(form)});
      toast(t('milestoneSaved'));lastExecutionTab='milestones';await refreshProjectAfterExecution(p,{focusExecution:true});
    }catch(err){toast(err.message,'error')}
    finally{btn.disabled=false}
  }));
  $$('[data-milestone-lifecycle]').forEach(btn=>btn.addEventListener('click',async()=>{
    const action=btn.dataset.milestoneLifecycle;
    if(action==='archive'){
      const ok=await confirmDialog({title:t('archiveMilestone'),message:t('archiveMilestone'),confirmText:t('archiveMilestone'),cancelText:t('cancel'),danger:true});
      if(!ok)return;
    }
    btn.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/milestones/${Number(btn.dataset.id)}/lifecycle`,{method:'POST',csrf:true,body:{action}});
      toast(t(action==='archive'?'milestoneArchived':'milestoneRestored'));lastExecutionTab='milestones';await refreshProjectAfterExecution(p,{focusExecution:true});
    }catch(err){toast(err.message,'error')}
    finally{btn.disabled=false}
  }));
  $('[data-new-task]')?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/tasks`,{method:'POST',csrf:true,body:collectTask(e.currentTarget,p,{creating:true})});
      toast(t('taskCreated'));lastExecutionTab='tasks';await refreshProjectAfterExecution(p,{focusExecution:true});
    }catch(err){toast(err.message,'error')}
    finally{btn.disabled=false}
  });
  $$('form[data-task-id]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();const id=Number(form.dataset.taskId),btn=$('button[type=submit]',form);btn.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/tasks/${id}/update`,{method:'POST',csrf:true,body:collectTask(form,p)});
      toast(t('taskSaved'));lastExecutionTab='tasks';await refreshProjectAfterExecution(p,{focusExecution:true});
    }catch(err){toast(err.message,'error')}
    finally{btn.disabled=false}
  }));
  $$('[data-task-lifecycle]').forEach(btn=>btn.addEventListener('click',async()=>{
    const action=btn.dataset.taskLifecycle;
    if(action==='archive'){
      const ok=await confirmDialog({title:t('archiveTask'),message:t('archiveTask'),confirmText:t('archiveTask'),cancelText:t('cancel'),danger:true});
      if(!ok)return;
    }
    btn.disabled=true;
    try{
      await api(`/admin/client-projects/${p.id}/tasks/${Number(btn.dataset.id)}/lifecycle`,{method:'POST',csrf:true,body:{action}});
      toast(t(action==='archive'?'taskArchived':'taskRestored'));lastExecutionTab='tasks';await refreshProjectAfterExecution(p,{focusExecution:true});
    }catch(err){toast(err.message,'error')}
    finally{btn.disabled=false}
  }));
}
async function loadProjectExecution(p,draft=null){
  const root=$('#projectExecutionRoot');if(!root)return;
  try{
    const [summary,milestones,tasks]=await Promise.all([
      api(`/admin/client-projects/${p.id}/execution/summary`),
      api(`/admin/client-projects/${p.id}/milestones`),
      api(`/admin/client-projects/${p.id}/tasks`)
    ]);
    const config=state.clientProjectConfig||{};
    lastExecutionTab=draft?.tab||lastExecutionTab||'milestones';
    const groups=taskStageGroups(tasks,milestones);
    root.innerHTML=`${summaryCards(summary)}<div class="execution-toolbar"><label class="field compact-field"><span>${esc(t('progressMode'))}</span><select id="executionProgressMode" class="select-input">${(config.execution?.progress_modes||['manual','calculated']).map(v=>`<option value="${esc(v)}" ${v===summary.progress_mode?'selected':''}>${esc(executionProgressModeLabel(v))}</option>`).join('')}</select></label>${summary.next_milestone_date?`<div class="next-milestone"><span>${esc(t('nextMilestone'))}</span><strong>${esc(summary.next_milestone_date)}</strong></div>`:''}</div><div class="execution-tabs"><button type="button" data-execution-tab="milestones" class="${lastExecutionTab==='milestones'?'is-active':''}">${faIcon('layer-group',{fallback:'◇',className:'execution-tab-fa'})}<span>${esc(t('milestones'))}</span><b>${milestones.filter(x=>!x.archived_at).length}</b></button><button type="button" data-execution-tab="tasks" class="${lastExecutionTab==='tasks'?'is-active':''}">${faIcon('list-check',{fallback:'≡',className:'execution-tab-fa'})}<span>${esc(t('tasks'))}</span><b>${summary.task_count}</b></button></div><div data-execution-panel="milestones" ${lastExecutionTab==='milestones'?'':'hidden'}><div class="execution-list execution-milestone-list">${milestoneEditor(null,config,{creating:true})}${milestones.length?milestones.map(m=>milestoneEditor(m,config)).join(''):`<div class="empty-inline">${esc(t('noMilestones'))}</div>`}</div></div><div data-execution-panel="tasks" ${lastExecutionTab==='tasks'?'':'hidden'}><div class="execution-list task-board">${taskEditor(null,p,milestones,config,{creating:true})}${groups.length?groups.map((group,index)=>taskStageCard(group,p,milestones,config,index)).join(''):`<div class="empty-inline">${esc(t('noTasks'))}</div>`}</div></div>`;
    restoreExecutionDraft(root,draft);
    bindExecution(p,summary,milestones,tasks,config);
  }catch(err){
    root.innerHTML=`<div class="lifecycle-warning">${esc(err.message||t('requestFailed'))}</div>`;
  }
}

export function mountClientProjectDrawer(p,draft=null){
  state.activeInquiry=null;state.activeClient=null;state.activeClientProject=p;state.drawerMode=null;state.projectWorkspaceOpen=true;const config=state.clientProjectConfig||{statuses:[],priorities:[],services:[],admins:[],currencies:[]},archived=Boolean(p.archived_at),statusValues=p.allowed_statuses||[p.status];
  openProjectWorkspace(t('clientProjects'),p.name,`<div class="project-workspace-shell"><div class="project-context-row">${projectHeader(p)}${projectWorkspaceNav()}</div><main class="project-workspace-content"><section data-project-module="overview" class="project-module-section"><form id="clientProjectEdit" class="edit-form project-edit-form"><fieldset class="project-edit-fieldset" ${archived?'disabled':''}><section class="form-section"><div class="detail-section-title"><span>${esc(t('projectIdentity'))}</span><small>${esc(p.public_id)}</small></div><div class="fields-2"><div class="field"><span>${esc(t('projectCode'))}</span><div class="readonly-control client-code-readonly" dir="ltr">${esc(p.project_code||'—')}</div></div><div class="field"><span>${esc(t('projectClientImmutable'))}</span><div class="readonly-control">${esc(p.client_display_name)} · ${esc(p.client_code||'')}</div></div><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="190" value="${esc(p.name||'')}" required></label><label class="field"><span>${esc(t('projectStatus'))}</span><select class="select-input" name="status">${options(statusValues,p.status,clientProjectStatusLabel)}</select></label><label class="field"><span>${esc(t('projectPriority'))}</span><select class="select-input" name="priority">${options(config.priorities,p.priority,clientProjectPriorityLabel)}</select></label><label class="field"><span>${esc(t('manualProgress'))}</span><input name="manual_progress_percent" type="number" min="0" max="100" step="1" value="${esc(p.manual_progress_percent??0)}"></label></div><label class="field"><span>${esc(t('projectDescription'))}</span><textarea name="description" maxlength="10000">${esc(p.description||'')}</textarea></label></section><section class="form-section"><h3>${esc(t('projectPlanning'))}</h3><div class="fields-2"><label class="field"><span>${esc(t('startDate'))}</span><input name="start_date" type="date" value="${esc(p.start_date||'')}"></label><label class="field"><span>${esc(t('targetDate'))}</span><input name="target_date" type="date" value="${esc(p.target_date||'')}"></label></div></section><section class="form-section"><h3>${esc(t('projectCommercial'))}</h3><div class="fields-2"><label class="field"><span>${esc(t('agreedAmount'))}</span><input name="agreed_amount" inputmode="decimal" value="${esc(p.agreed_amount||'')}" placeholder="${esc(t('projectAmountPlaceholder'))}"></label><label class="field"><span>${esc(t('defaultCurrency'))}</span><select class="select-input" name="currency">${currencyOptions(config,p.currency||'')}</select></label></div></section><section class="form-section"><h3>${esc(t('projectServices'))}</h3>${serviceCards(config,p)}</section><section class="form-section"><h3>${esc(t('projectMembers'))}</h3>${memberCards(config,p)}</section><div class="form-actions"><button class="primary-btn" type="submit"><span>${esc(t('save'))}</span><span class="btn-fa">${faIcon('floppy-disk',{fallback:'↗'})}</span></button></div></fieldset></form></section>${executionSection(p)}${supportSection(p)}${filesSection(p)}${clientAccessSection(p)}${linkedInquiries(p)}${lifecycleSection(p)}</main></div>`);
  const form=$('#clientProjectEdit');if(draft?.data)restoreFormValues(form,draft.data);bindAssociationCards(form);
  form?.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type=submit]',form);btn.disabled=true;try{const updated=await api(`/admin/client-projects/${p.id}/update`,{method:'POST',csrf:true,body:collectProjectPayload(form,config)});toast(t('projectSaved'));state.activeClientProject=updated;await loadClientProjects();mountClientProjectDrawer(updated)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  bindInquiryLinker(p);bindLifecycle(p);bindWorkspaceNav();void loadProjectExecution(p,draft?.execution);void loadProjectSupport(p,draft?.support);void loadProjectFiles(p);void loadProjectAccess(p,draft?.support?.access);
}

async function bindInquiryLinker(p){
  const btn=$('#projectInquirySearchBtn'),input=$('#projectInquirySearch'),host=$('#projectInquiryOptions');if(!btn||!input||!host)return;
  const search=async()=>{host.innerHTML='';try{const q=input.value.trim(),items=await api(`/admin/client-projects/${p.id}/inquiry-options?`+new URLSearchParams(q?{q}:{}).toString());host.innerHTML=items.length?`<div class="client-source-list">${items.map(i=>`<button class="client-source-card" type="button" data-link-project-inquiry="${i.id}"><div><strong>${esc(i.name)}</strong><small>${esc(i.email||'')} · ${esc(i.client_request_id||i.public_id)}</small></div><span>${esc(t('link'))} ${faIcon('link',{fallback:'↗'})}</span></button>`).join('')}</div>`:`<div class="empty-inline">${esc(t('noAvailableProjectInquiries'))}</div>`;$$('[data-link-project-inquiry]',host).forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{const result=await api(`/admin/client-projects/${p.id}/inquiries/link`,{method:'POST',csrf:true,body:{project_inquiry_id:Number(b.dataset.linkProjectInquiry)}});toast(t('inquiryLinked'));state.activeClientProject=result.project;await loadClientProjects();mountClientProjectDrawer(result.project)}catch(e){toast(e.message,'error')}finally{b.disabled=false}}))}catch(e){toast(e.message,'error')}};
  btn.addEventListener('click',search);input.addEventListener('input',debounce(search,450));
}
function bindLifecycle(p){
  $('#archiveClientProjectBtn')?.addEventListener('click',async()=>{const ok=await confirmDialog({title:t('archiveProject'),message:t('archiveProjectConfirm'),confirmText:t('archiveProject'),cancelText:t('cancel'),danger:true});if(!ok)return;try{const updated=await api(`/admin/client-projects/${p.id}/lifecycle`,{method:'POST',csrf:true,body:{action:'archive'}});toast(t('projectArchived'));state.activeClientProject=updated;await loadClientProjects();mountClientProjectDrawer(updated)}catch(e){toast(e.message,'error')}});
  $('#restoreClientProjectBtn')?.addEventListener('click',async()=>{const ok=await confirmDialog({title:t('restoreProject'),message:t('restoreProjectConfirm'),confirmText:t('restoreProject'),cancelText:t('cancel')});if(!ok)return;try{const updated=await api(`/admin/client-projects/${p.id}/lifecycle`,{method:'POST',csrf:true,body:{action:'restore'}});toast(t('projectRestored'));state.activeClientProject=updated;await loadClientProjects();mountClientProjectDrawer(updated)}catch(e){toast(e.message,'error')}});
}

export async function openClientProject(id){try{await loadClientProjectConfig();const project=await api('/admin/client-projects/'+id);mountClientProjectDrawer(project)}catch(e){toast(e.message,'error')}}

export function captureClientProjectDraft(){
  const form=state.projectWorkspaceOpen?$('#clientProjectEdit'):state.drawerMode==='new-client-project'?$('#newClientProjectForm'):null;if(!form)return null;const data=Object.fromEntries(new FormData(form));for(const el of Array.from(form.elements||[])){if(!el?.name)continue;if(el.type==='checkbox')data[el.name]=Boolean(el.checked);if(el.type==='radio'&&el.checked)data[el.name]=el.value}return {data,clientSearch:$('#projectClientSearchInput')?.value||'',execution:captureExecutionDraft(),support:captureSupportDraft()};
}
