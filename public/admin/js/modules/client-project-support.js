'use strict';

import { state } from '../core/state.js';
import { $, $$, esc } from '../core/dom.js';
import { api } from '../core/api.js';
import { t, ticketTypeLabel, ticketStatusLabel, ticketPriorityLabel } from '../core/i18n.js';
import { toast, confirmDialog } from '../core/ui.js';
import { faIcon } from '../core/icons.js';
import { PROJECT_WORKSPACE_MODULES, TICKET_STATUS_VISUAL, TICKET_PRIORITY_VISUAL } from '../core/design-system.js';

const option=(v,l,c)=>`<option value="${esc(v)}" ${String(v)===String(c)?'selected':''}>${esc(l)}</option>`;
const req=()=>`req_${crypto.randomUUID().replace(/-/g,'')}`;
const statusTone=s=>TICKET_STATUS_VISUAL[s]||TICKET_STATUS_VISUAL.new;
const priorityTone=s=>TICKET_PRIORITY_VISUAL[s]||TICKET_PRIORITY_VISUAL.normal;
const PRIMARY_MODULES=['overview','execution','tickets','files','clientAccess'];
const SECONDARY_MODULES=['inquiries','lifecycle'];

let active='overview';
let projectId=null;
let config=null;
let tickets=[];
let selected=null;
let ws=null;
let wsTimer=null;
let realtimeBackoff=1800;
let supportUi={
  search:'',status:'',newTicketOpen:false,newTicket:null,
  replyBody:'',replyVisibility:'client',pendingFiles:[],
  threadNearBottom:true,threadScrollTop:0,newMessages:false
};
let files={folders:[],files:[],selected:null,folder:null,showArchived:false,newFolderOpen:false};

function captureForm(form){
  if(!form)return null;
  const d=Object.fromEntries(new FormData(form));
  for(const e of form.elements||[])if(e?.name&&e.type==='checkbox')d[e.name]=e.checked;
  return d;
}
function restoreForm(form,d){
  if(!form||!d)return;
  for(const[k,v]of Object.entries(d)){
    const e=form.elements.namedItem(k);if(!e)continue;
    e.type==='checkbox'?e.checked=Boolean(v):e.value=v??'';
  }
}
function moduleById(id){return PROJECT_WORKSPACE_MODULES.find(m=>m.id===id)}
function moduleButton(m){return `<button type="button" data-project-module-jump="${m.id}" class="${m.id===active?'is-active':''}">${faIcon(m.icon,{fallback:'•'})}<span>${esc(t(m.labelKey))}</span>${m.id==='tickets'?'<b id="adminTicketNavCount">0</b>':''}</button>`}

export function projectWorkspaceNav(){
  const primary=PRIMARY_MODULES.map(moduleById).filter(Boolean);
  const secondary=SECONDARY_MODULES.map(moduleById).filter(Boolean);
  return `<nav class="project-workspace-nav" aria-label="${esc(t('workspaceModules'))}"><div class="project-workspace-primary">${primary.map(moduleButton).join('')}</div><details class="project-workspace-more"><summary>${faIcon('ellipsis',{fallback:'•••'})}<span>${esc(t('more'))}</span></summary><div>${secondary.map(moduleButton).join('')}</div></details></nav>`;
}
export function supportSection(){return `<section id="projectModuleTickets" data-project-module="tickets" class="detail-section section-surface project-support-section"><div id="projectSupportRoot"><div class="profile-completion-loading"></div></div></section>`}
export function filesSection(){return `<section id="projectModuleFiles" data-project-module="files" class="detail-section section-surface project-files-section"><div id="projectFilesRoot"><div class="profile-completion-loading"></div></div></section>`}
export function clientAccessSection(){return `<section id="projectModuleClientAccess" data-project-module="clientAccess" class="detail-section section-surface project-access-section"><div id="projectAccessRoot"><div class="profile-completion-loading"></div></div></section>`}

const statusPill=s=>{const v=statusTone(s);return `<span class="nx-status-pill nx-tone-${v.tone}">${faIcon(v.icon,{fallback:'•'})}<span>${esc(ticketStatusLabel(s))}</span></span>`};
const priorityPill=s=>{const v=priorityTone(s);return `<span class="nx-status-pill nx-tone-${v.tone} is-soft">${faIcon(v.icon,{fallback:'•'})}<span>${esc(ticketPriorityLabel(s))}</span></span>`};

function filteredTickets(){
  const q=supportUi.search.trim().toLocaleLowerCase();
  return tickets.filter(x=>(!supportUi.status||x.status===supportUi.status)&&(!q||`${x.ticket_code||''} ${x.title||''} ${ticketTypeLabel(x.type)}`.toLocaleLowerCase().includes(q)));
}
function ticketList(){
  const list=filteredTickets();
  return list.map(x=>`<button class="admin-ticket-row ${selected?.id===x.id?'is-active':''}" data-open-ticket="${x.id}"><div class="admin-ticket-row-main"><small>${esc(x.ticket_code||x.public_id)}</small><strong>${esc(x.title)}</strong><span>${esc(ticketTypeLabel(x.type))}${x.updated_at?` · ${esc(x.updated_at)}`:''}</span></div><aside class="admin-ticket-row-state">${priorityPill(x.priority)}${statusPill(x.status)}</aside></button>`).join('')||`<div class="empty-inline">${esc(t('noTickets'))}</div>`;
}
function attachment(f){
  const kind=f.file_kind==='pdf'?'file-pdf':f.file_kind==='image'?'file-image':f.file_kind==='audio'?'file-audio':'file-lines';
  return `<div class="admin-attachment"><span>${faIcon(kind,{fallback:'•'})}</span><div><strong>${esc(f.display_name)}</strong><small>${Math.ceil(Number(f.version?.size_bytes||0)/1024)} KB</small></div><div><a class="icon-btn" target="_blank" rel="noopener" href="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content">${faIcon('eye',{fallback:'•'})}</a><a class="icon-btn" href="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content?download=1">${faIcon('download',{fallback:'•'})}</a></div></div>`;
}
function thread(tk){
  return `<div class="admin-ticket-thread" data-ticket-thread>${tk.attachments?.length?`<div class="admin-ticket-root-files"><small>${esc(t('ticketFiles'))}</small><div class="admin-attachment-grid">${tk.attachments.map(attachment).join('')}</div></div>`:''}${(tk.messages||[]).map(m=>`<article class="admin-message ${m.author_type==='admin'?'is-admin':'is-client'} ${m.visibility==='internal'?'is-internal':''}"><div class="admin-message-avatar">${m.author_type==='admin'?'N':faIcon('user',{fallback:'•'})}</div><div class="admin-message-content"><header><strong>${esc(m.admin_name||m.contact_name||'NEXORA')}</strong>${m.visibility==='internal'?`<span>${esc(t('ticketVisibilityInternal'))}</span>`:''}<time>${esc(m.created_at||'')}</time></header>${m.body?`<p class="admin-message-bubble">${esc(m.body)}</p>`:''}${m.attachments?.length?`<div class="admin-attachment-grid">${m.attachments.map(attachment).join('')}</div>`:''}</div></article>`).join('')||`<div class="empty-inline">${esc(t('noHistory'))}</div>`}</div>`;
}
function pendingAttachments(){
  if(!supportUi.pendingFiles.length)return '';
  return `<div class="admin-pending-attachments">${supportUi.pendingFiles.map((f,i)=>`<span class="admin-pending-file">${faIcon('paperclip',{fallback:'•'})}<b>${esc(f.name)}</b><button type="button" data-remove-pending="${i}" aria-label="Remove">${faIcon('xmark',{fallback:'×'})}</button></span>`).join('')}</div>`;
}
function detail(){
  if(!selected)return `<div class="admin-ticket-empty">${faIcon('comments',{fallback:'•'})}<strong>${esc(t('selectTicket'))}</strong><p>${esc(t('selectTicketHint'))}</p></div>`;
  const closed=selected.status==='closed';
  return `<div class="admin-ticket-detail-shell"><header class="admin-ticket-detail-head"><div class="admin-ticket-title-wrap"><button type="button" class="admin-ticket-mobile-back" data-ticket-mobile-back>${faIcon('arrow-right',{fallback:'←'})}<span>${esc(t('backToTickets'))}</span></button><div><small>${esc(selected.ticket_code||selected.public_id)}</small><h3>${esc(selected.title)}</h3><p>${esc(ticketTypeLabel(selected.type))}</p></div></div><div class="admin-ticket-head-actions">${priorityPill(selected.priority)}${statusPill(selected.status)}<span class="admin-live-chip" data-realtime-chip>${faIcon('circle',{fallback:'•'})}<span data-realtime-label>${esc(t('realtimeConnecting'))}</span></span></div></header><div class="admin-ticket-controls"><label><span>${esc(t('ticketStatus'))}</span><select data-status class="select-input">${(selected.allowed_statuses||[selected.status]).map(x=>option(x,ticketStatusLabel(x),selected.status)).join('')}</select></label><label><span>${esc(t('ticketPriority'))}</span><select data-priority class="select-input">${(config?.ticket_priorities||[]).map(x=>option(x,ticketPriorityLabel(x),selected.priority)).join('')}</select></label><label><span>${esc(t('ticketAssignee'))}</span><select data-assignee class="select-input"><option value="">—</option>${(config?.members||[]).filter(x=>Number(x.is_active)!==0).map(m=>option(m.admin_user_id,m.name,selected.assigned_admin_id||'')).join('')}</select></label><button data-save-ticket class="ghost-btn compact-btn">${faIcon('floppy-disk',{fallback:'•'})}${esc(t('save'))}</button></div>${thread(selected)}${supportUi.newMessages?`<button type="button" class="admin-new-messages" data-new-messages>${faIcon('arrow-down',{fallback:'↓'})}<span>${esc(t('newMessages'))}</span></button>`:''}${closed?`<div class="admin-ticket-closed-note">${faIcon('lock',{fallback:'•'})}<div><strong>${esc(t('ticketClosed'))}</strong><small>${esc(t('ticketClosedAdminHint'))}</small></div></div>`:`<form data-message-form class="admin-ticket-composer">${pendingAttachments()}<div class="admin-composer-row"><input data-msg-files type="file" multiple hidden><button data-attach type="button" class="icon-btn">${faIcon('paperclip',{fallback:'•'})}</button><textarea name="body" maxlength="10000" placeholder="${esc(t('writeReply'))}">${esc(supportUi.replyBody)}</textarea><select name="visibility" class="select-input"><option value="client" ${supportUi.replyVisibility==='client'?'selected':''}>${esc(t('ticketVisibilityClient'))}</option><option value="internal" ${supportUi.replyVisibility==='internal'?'selected':''}>${esc(t('ticketVisibilityInternal'))}</option></select><button class="primary-btn compact-btn" type="submit">${faIcon('paper-plane',{fallback:'•'})}${esc(t('sendMessage'))}</button></div></form>`}</div>`;
}
function newTicketDrawer(){
  if(!supportUi.newTicketOpen)return '';
  const d=supportUi.newTicket||{title:'',type:'issue',priority:'normal',description:''};
  return `<div class="admin-ticket-create-scrim" data-close-ticket-create></div><aside class="admin-ticket-create-drawer" aria-label="${esc(t('addTicket'))}"><header><div><small>${esc(t('projectTickets'))}</small><h3>${esc(t('addTicket'))}</h3></div><button type="button" class="icon-btn" data-close-ticket-create>${faIcon('xmark',{fallback:'×'})}</button></header><form data-new-ticket-form><label class="field"><span>${esc(t('ticketTitle'))}</span><input name="title" maxlength="190" required value="${esc(d.title||'')}"></label><div class="fields-2"><label class="field"><span>${esc(t('ticketType'))}</span><select name="type" class="select-input">${(config?.ticket_types||['issue']).map(x=>option(x,ticketTypeLabel(x),d.type||'issue')).join('')}</select></label><label class="field"><span>${esc(t('ticketPriority'))}</span><select name="priority" class="select-input">${(config?.ticket_priorities||['normal']).map(x=>option(x,ticketPriorityLabel(x),d.priority||'normal')).join('')}</select></label></div><label class="field"><span>${esc(t('ticketDescription'))}</span><textarea name="description" maxlength="10000">${esc(d.description||'')}</textarea></label><div class="admin-create-actions"><button type="button" class="ghost-btn" data-close-ticket-create>${esc(t('cancel'))}</button><button type="submit" class="primary-btn">${faIcon('plus',{fallback:'+'})}<span>${esc(t('addTicket'))}</span></button></div></form></aside>`;
}
function captureSupportDom(){
  const thread=$('[data-ticket-thread]');
  if(thread){supportUi.threadNearBottom=(thread.scrollHeight-thread.scrollTop-thread.clientHeight)<88;supportUi.threadScrollTop=thread.scrollTop}
  const form=$('[data-message-form]');if(form){supportUi.replyBody=form.elements.body?.value||'';supportUi.replyVisibility=form.elements.visibility?.value||'client'}
  const nf=$('[data-new-ticket-form]');if(nf)supportUi.newTicket=Object.fromEntries(new FormData(nf));
}
function restoreThreadPosition(){
  const thread=$('[data-ticket-thread]');if(!thread)return;
  requestAnimationFrame(()=>{if(supportUi.threadNearBottom){thread.scrollTop=thread.scrollHeight;supportUi.newMessages=false}else thread.scrollTop=supportUi.threadScrollTop});
}
function updateRealtimeBadges(){
  const live=ws?.readyState===1;
  $$('[data-realtime-chip]').forEach(el=>el.classList.toggle('is-live',live));
  $$('[data-realtime-label]').forEach(el=>el.textContent=t(live?'liveUpdates':'realtimeConnecting'));
}
function renderSupport(){
  const r=$('#projectSupportRoot');if(!r)return;
  r.innerHTML=`<div class="admin-support-workspace"><aside class="admin-ticket-sidebar"><header class="admin-ticket-head"><div><span class="admin-workspace-icon">${faIcon('ticket',{fallback:'•'})}</span><div><strong>${esc(t('projectTickets'))}</strong><small>${tickets.length}</small></div></div><button data-new-ticket class="primary-btn compact-btn">${faIcon('plus',{fallback:'+'})}${esc(t('addTicket'))}</button></header><div class="admin-ticket-tools"><label class="admin-ticket-search">${faIcon('magnifying-glass',{fallback:'⌕'})}<input data-ticket-search value="${esc(supportUi.search)}" placeholder="${esc(t('searchTickets'))}"></label><select data-ticket-status-filter class="select-input"><option value="">${esc(t('allStatuses'))}</option>${(config?.ticket_statuses||[]).map(x=>option(x,ticketStatusLabel(x),supportUi.status)).join('')}</select></div><div class="admin-ticket-list">${ticketList()}</div><footer class="admin-ticket-foot"><span class="admin-live-chip" data-realtime-chip>${faIcon('circle',{fallback:'•'})}<span data-realtime-label>${esc(t('realtimeConnecting'))}</span></span><b>${filteredTickets().length}</b></footer></aside><section class="admin-ticket-detail">${detail()}</section></div>${newTicketDrawer()}`;
  const count=$('#adminTicketNavCount');if(count)count.textContent=tickets.length;
  bindSupport();updateRealtimeBadges();restoreThreadPosition();
}
async function refreshSupport({remote=false}={}){
  captureSupportDom();
  const previousCount=selected?.messages?.length||0;
  tickets=await api(`/admin/client-projects/${projectId}/tickets`);
  if(selected&&tickets.some(x=>x.id===selected.id))selected=await api(`/admin/client-projects/${projectId}/tickets/${selected.id}`);
  if(remote&&!supportUi.threadNearBottom&&selected&&(selected.messages?.length||0)>previousCount)supportUi.newMessages=true;
  renderSupport();
}
async function openTicket(id){
  captureSupportDom();selected=await api(`/admin/client-projects/${projectId}/tickets/${id}`);
  supportUi.replyBody='';supportUi.pendingFiles=[];supportUi.threadNearBottom=true;supportUi.newMessages=false;renderSupport();
}
async function uploadFile(ticket,file){
  const h={Accept:'application/json','Content-Type':file.type||'application/octet-stream','X-CSRF-Token':state.csrf,'X-Nexora-File-Name':encodeURIComponent(file.name),'X-Nexora-Client-Request-Id':req()};
  const r=await fetch(`../api/v1/admin/client-projects/${projectId}/files/upload?ticket_id=${ticket||''}&visibility=client`,{method:'POST',headers:h,credentials:'same-origin',body:file});
  const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||t('requestFailed'));return j.data;
}
function bindSupport(){
  const r=$('#projectSupportRoot');if(!r)return;
  $$('[data-open-ticket]',r).forEach(b=>b.onclick=()=>openTicket(Number(b.dataset.openTicket)));
  $('[data-ticket-mobile-back]',r)?.addEventListener('click',()=>{captureSupportDom();selected=null;supportUi.newMessages=false;renderSupport()});
  $('[data-ticket-search]',r)?.addEventListener('input',e=>{supportUi.search=e.currentTarget.value;renderSupport()});
  $('[data-ticket-status-filter]',r)?.addEventListener('change',e=>{supportUi.status=e.currentTarget.value;renderSupport()});
  $('[data-new-ticket]',r)?.addEventListener('click',()=>{captureSupportDom();supportUi.newTicketOpen=true;supportUi.newTicket={title:'',type:'issue',priority:'normal',description:''};renderSupport()});
  $$('[data-close-ticket-create]',r).forEach(b=>b.addEventListener('click',()=>{captureSupportDom();supportUi.newTicketOpen=false;renderSupport()}));
  $('[data-new-ticket-form]',r)?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type=submit]');btn.disabled=true;try{const d=Object.fromEntries(new FormData(form));selected=await api(`/admin/client-projects/${projectId}/tickets`,{method:'POST',csrf:true,body:{title:d.title,type:d.type,priority:d.priority,description:d.description||'',assigned_admin_id:null,client_request_id:req()}});supportUi.newTicketOpen=false;supportUi.newTicket=null;supportUi.threadNearBottom=true;await refreshSupport();toast(t('ticketCreated'))}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  $('[data-save-ticket]',r)?.addEventListener('click',async()=>{try{selected=await api(`/admin/client-projects/${projectId}/tickets/${selected.id}/update`,{method:'POST',csrf:true,body:{title:selected.title,description:selected.description||'',type:selected.type,status:$('[data-status]',r).value,priority:$('[data-priority]',r).value,assigned_admin_id:$('[data-assignee]',r).value?Number($('[data-assignee]',r).value):null}});await refreshSupport();toast(t('ticketSaved'))}catch(e){toast(e.message,'error')}});
  $('[data-new-messages]',r)?.addEventListener('click',()=>{supportUi.threadNearBottom=true;supportUi.newMessages=false;restoreThreadPosition();$('[data-new-messages]',r)?.remove()});
  const form=$('[data-message-form]',r);
  if(form){
    form.elements.body?.addEventListener('input',e=>supportUi.replyBody=e.currentTarget.value);
    form.elements.visibility?.addEventListener('change',e=>supportUi.replyVisibility=e.currentTarget.value);
    $('[data-attach]',form).onclick=()=>$('[data-msg-files]',form).click();
    $('[data-msg-files]',form).onchange=e=>{supportUi.pendingFiles=[...supportUi.pendingFiles,...e.target.files];renderSupport()};
    $$('[data-remove-pending]',form).forEach(b=>b.onclick=()=>{supportUi.pendingFiles.splice(Number(b.dataset.removePending),1);renderSupport()});
    form.onsubmit=async e=>{e.preventDefault();captureSupportDom();const b=form.querySelector('button[type=submit]');b.disabled=true;try{const ids=[];for(const file of supportUi.pendingFiles)ids.push((await uploadFile(selected.id,file)).public_id);selected=await api(`/admin/client-projects/${projectId}/tickets/${selected.id}/messages`,{method:'POST',csrf:true,body:{body:supportUi.replyBody,visibility:supportUi.replyVisibility,attachment_public_ids:ids,client_request_id:req()}});supportUi.replyBody='';supportUi.pendingFiles=[];supportUi.threadNearBottom=true;await refreshSupport();toast(t('ticketMessageSent'))}catch(err){toast(err.message,'error')}finally{b.disabled=false}};
  }
}
export async function loadProjectSupport(p,draft=null){
  const changed=projectId!==p.id;projectId=p.id;
  if(changed){selected=null;supportUi={search:'',status:'',newTicketOpen:false,newTicket:null,replyBody:'',replyVisibility:'client',pendingFiles:[],threadNearBottom:true,threadScrollTop:0,newMessages:false}}
  if(draft?.selectedTicketId)selected={id:Number(draft.selectedTicketId)};
  try{
    [config,tickets]=await Promise.all([api(`/admin/client-projects/${p.id}/support/config`),api(`/admin/client-projects/${p.id}/tickets`)]);
    if(selected?.id&&tickets.some(x=>x.id===selected.id))selected=await api(`/admin/client-projects/${p.id}/tickets/${selected.id}`);else if(selected?.id)selected=null;
    renderSupport();connectRealtime();
  }catch(e){const root=$('#projectSupportRoot');if(root)root.innerHTML=`<div class="lifecycle-warning">${esc(e.message)}</div>`}
}
function connectRealtime(){
  if(ws){try{ws.close()}catch{}}
  clearTimeout(wsTimer);
  if(document.hidden){wsTimer=setTimeout(connectRealtime,5000);return}
  const proto=location.protocol==='https:'?'wss:':'ws:';
  try{ws=new WebSocket(`${proto}//${location.host}/api/v1/admin/client-projects/${projectId}/realtime`)}catch{return}
  ws.onopen=()=>{realtimeBackoff=1800;updateRealtimeBadges();void refreshSupport()};
  ws.onmessage=e=>{if(e.data!=='pong')setTimeout(()=>refreshSupport({remote:true}),120)};
  ws.onclose=()=>{updateRealtimeBadges();const wait=Math.min(12000,realtimeBackoff)+Math.floor(Math.random()*650);realtimeBackoff=Math.min(12000,realtimeBackoff*1.7);wsTimer=setTimeout(connectRealtime,wait)};
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&projectId)connectRealtime()});

function fileIcon(f){return f.file_kind==='pdf'?'file-pdf':f.file_kind==='image'?'file-image':f.file_kind==='audio'?'file-audio':'file-lines'}
function visibleFiles(){return files.files.filter(f=>(files.folder===null||Number(f.folder_id)===Number(files.folder)))}
function fileRow(f){return `<button class="admin-file-row ${files.selected===f.id?'is-active':''} ${f.is_archived?'is-archived':''}" data-file="${f.id}"><span>${faIcon(fileIcon(f),{fallback:'•'})}</span><div><strong>${esc(f.display_name)}</strong><small>${esc(f.folder_name||f.source_ticket_code||t('projectFiles'))} · ${Math.ceil(Number(f.version?.size_bytes||0)/1024)} KB</small></div><span class="nx-status-pill nx-tone-${f.visibility==='client'?'success':'muted'}">${faIcon(f.visibility==='client'?'eye':'lock',{fallback:'•'})}<span>${esc(t(f.visibility==='client'?'ticketVisibilityClient':'ticketVisibilityInternal'))}</span></span></button>`}
function fileDetail(f){
  if(!f)return `<div class="admin-ticket-empty">${faIcon('folder-open',{fallback:'•'})}<strong>${esc(t('selectFile'))}</strong></div>`;
  const preview=f.file_kind==='image'?`<img src="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content" alt="${esc(f.display_name)}">`:f.file_kind==='pdf'?`<iframe title="${esc(f.display_name)}" src="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content#toolbar=1"></iframe>`:f.file_kind==='audio'?`<audio controls preload="metadata" src="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content"></audio>`:`<div class="admin-file-generic">${faIcon(fileIcon(f),{fallback:'•'})}<strong>${esc(f.display_name)}</strong><small>${esc(f.version?.content_type||'')}</small></div>`;
  return `<div class="admin-file-detail-shell"><header><div><small>${esc(f.public_id)}</small><h3>${esc(f.display_name)}</h3></div><div><a class="ghost-btn compact-btn" target="_blank" rel="noopener" href="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content">${faIcon('arrow-up-right-from-square',{fallback:'↗'})}</a><a class="ghost-btn compact-btn" href="../api/v1/admin/client-projects/${projectId}/files/${f.id}/content?download=1">${faIcon('download',{fallback:'•'})}${esc(t('download'))}</a></div></header><div class="admin-file-preview">${preview}</div><form data-file-meta class="admin-file-meta-form"><label><span>${esc(t('name'))}</span><input name="display_name" value="${esc(f.display_name)}" ${f.is_archived?'disabled':''}></label><label><span>${esc(t('projectFiles'))}</span><select name="folder_id" class="select-input" ${f.is_archived?'disabled':''}><option value="">${esc(t('noFolder'))}</option>${files.folders.filter(x=>!x.is_archived).map(x=>option(x.id,x.name,f.folder_id||'')).join('')}</select></label><label><span>${esc(t('visibility'))}</span><select name="visibility" class="select-input" ${f.is_archived?'disabled':''}><option value="client" ${f.visibility==='client'?'selected':''}>${esc(t('ticketVisibilityClient'))}</option><option value="internal" ${f.visibility==='internal'?'selected':''}>${esc(t('ticketVisibilityInternal'))}</option></select></label><div class="form-actions">${f.is_archived?`<button type="button" class="primary-btn compact-btn" data-file-lifecycle="restore">${faIcon('rotate-left',{fallback:'↶'})}${esc(t('restoreFile'))}</button>`:`<button type="submit" class="primary-btn compact-btn">${faIcon('floppy-disk',{fallback:'•'})}${esc(t('save'))}</button><button type="button" class="danger-btn compact-btn" data-file-lifecycle="archive">${faIcon('box-archive',{fallback:'•'})}${esc(t('archiveFile'))}</button>`}</div></form></div>`;
}
function renderFiles(){
  const r=$('#projectFilesRoot');if(!r)return;
  const f=files.files.find(x=>x.id===files.selected)||null;
  const list=visibleFiles();
  const activeFolders=files.folders.filter(x=>!x.is_archived);
  r.innerHTML=`<div class="admin-files-workspace"><aside class="admin-folder-rail"><header class="admin-files-head"><div><span class="admin-workspace-icon">${faIcon('folder-tree',{fallback:'•'})}</span><div><strong>${esc(t('projectFiles'))}</strong><small>${files.files.length}</small></div></div></header><div class="admin-folder-list"><button data-folder="" class="${files.folder===null?'is-active':''}">${faIcon('folder-open',{fallback:'•'})}<span>${esc(t('allProjectFiles'))}</span><b>${files.files.length}</b></button>${activeFolders.map(x=>`<button data-folder="${x.id}" class="${Number(files.folder)===Number(x.id)?'is-active':''}">${faIcon('folder',{fallback:'•'})}<span>${esc(x.name)}</span><b>${files.files.filter(f=>Number(f.folder_id)===Number(x.id)).length}</b></button>`).join('')}<button data-new-folder class="admin-new-folder">${faIcon('folder-plus',{fallback:'+'})}<span>${esc(t('newFolder'))}</span></button></div>${files.newFolderOpen?`<form data-folder-form class="admin-folder-create"><input name="name" maxlength="120" required placeholder="${esc(t('folderName'))}"><div><button type="button" class="ghost-btn compact-btn" data-cancel-folder>${esc(t('cancel'))}</button><button class="primary-btn compact-btn" type="submit">${esc(t('save'))}</button></div></form>`:''}<label class="admin-archive-toggle"><input data-show-archived type="checkbox" ${files.showArchived?'checked':''}><span>${esc(t('showArchived'))}</span></label></aside><section class="admin-files-list-pane"><header><div><strong>${esc(files.folder===null?t('allProjectFiles'):(activeFolders.find(x=>Number(x.id)===Number(files.folder))?.name||t('projectFiles')))}</strong><small>${list.length}</small></div><label class="primary-btn compact-btn admin-upload-btn">${faIcon('cloud-arrow-up',{fallback:'•'})}${esc(t('uploadFile'))}<input data-file-upload type="file" multiple hidden></label></header><div class="admin-file-list">${list.map(fileRow).join('')||`<div class="empty-inline">${esc(t('noFiles'))}</div>`}</div></section><section class="admin-file-detail">${fileDetail(f)}</section></div>`;
  bindFiles();
}
function bindFiles(){
  const r=$('#projectFilesRoot');if(!r)return;
  $$('[data-folder]',r).forEach(b=>b.onclick=()=>{files.folder=b.dataset.folder?Number(b.dataset.folder):null;files.selected=null;renderFiles()});
  $$('[data-file]',r).forEach(b=>b.onclick=()=>{files.selected=Number(b.dataset.file);renderFiles()});
  $('[data-new-folder]',r)?.addEventListener('click',()=>{files.newFolderOpen=true;renderFiles();$('[data-folder-form] input',r)?.focus()});
  $('[data-cancel-folder]',r)?.addEventListener('click',()=>{files.newFolderOpen=false;renderFiles()});
  $('[data-folder-form]',r)?.addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;try{const d=Object.fromEntries(new FormData(e.currentTarget));await api(`/admin/client-projects/${projectId}/folders`,{method:'POST',csrf:true,body:{name:d.name}});files.newFolderOpen=false;await loadProjectFiles({id:projectId});toast(t('saved'))}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  $('[data-show-archived]',r)?.addEventListener('change',async e=>{files.showArchived=e.currentTarget.checked;files.selected=null;await loadProjectFiles({id:projectId})});
  $('[data-file-upload]',r)?.addEventListener('change',async e=>{for(const file of e.target.files)try{const uploaded=await uploadFile(null,file);if(files.folder)await api(`/admin/client-projects/${projectId}/files/${uploaded.id}/update`,{method:'POST',csrf:true,body:{display_name:uploaded.display_name,folder_id:files.folder,visibility:uploaded.visibility}})}catch(err){toast(err.message,'error')}await loadProjectFiles({id:projectId})});
  $('[data-file-meta]',r)?.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await api(`/admin/client-projects/${projectId}/files/${files.selected}/update`,{method:'POST',csrf:true,body:{display_name:d.display_name,folder_id:d.folder_id?Number(d.folder_id):null,visibility:d.visibility}});await loadProjectFiles({id:projectId});toast(t('saved'))}catch(err){toast(err.message,'error')}});
  $('[data-file-lifecycle]',r)?.addEventListener('click',async e=>{const action=e.currentTarget.dataset.fileLifecycle;if(action==='archive'){const ok=await confirmDialog({title:t('archiveFile'),message:t('archiveFileConfirm'),confirmText:t('archiveFile'),cancelText:t('cancel'),danger:true});if(!ok)return}try{await api(`/admin/client-projects/${projectId}/files/${files.selected}/lifecycle`,{method:'POST',csrf:true,body:{action}});files.selected=null;await loadProjectFiles({id:projectId});toast(t('saved'))}catch(err){toast(err.message,'error')}});
}
export async function loadProjectFiles(p){
  projectId=p.id;
  try{const x=await api(`/admin/client-projects/${p.id}/files${files.showArchived?'?archived=1':''}`);files={...files,folders:x.folders||[],files:x.files||[]};if(files.selected&&!files.files.some(f=>f.id===files.selected))files.selected=null;renderFiles()}catch(e){const root=$('#projectFilesRoot');if(root)root.innerHTML=`<div class="lifecycle-warning">${esc(e.message)}</div>`}
}

function accessPermissionsForm(){return `<div class="access-permission-grid">${[['can_view_progress','viewProgress'],['can_view_milestones','viewMilestones'],['can_view_tasks','viewTasks'],['can_submit_tickets','submitTickets'],['can_comment_tickets','commentTickets']].map(([name,key])=>`<label class="access-permission"><input type="checkbox" name="${name}" checked><span>${faIcon('check',{fallback:'✓'})}</span><b>${esc(t(key))}</b></label>`).join('')}</div>`}
function accessStateLabel(s){return s==='active'?t('accessActive'):s==='expired'?t('accessExpired'):t('accessRevoked')}
function renderAccess(root,cfg,accessState,latestUrl=''){
  const contacts=(cfg.contacts||[]).filter(x=>x.status==='active');
  const primary=contacts.find(x=>x.is_primary)?.id||'';
  root.innerHTML=`<div class="project-access-workspace"><section class="project-access-command"><div class="project-access-command-icon">${faIcon('link',{fallback:'↗'})}</div><div><span class="eyebrow">${esc(t('clientProjectTracking'))}</span><h3>${esc(t('clientAccess'))}</h3></div></section>${latestUrl?`<section class="generated-project-link-card"><div><span>${esc(t('clientProjectTracking'))}</span><strong>${esc(t('accessActive'))}</strong></div><div class="generated-project-link"><input id="generatedProjectLink" readonly dir="ltr" value="${esc(latestUrl)}"><button id="copyGeneratedProjectLink" class="primary-btn compact-btn" type="button">${faIcon('copy',{fallback:'□'})}<span>${esc(t('copyProjectLink'))}</span></button></div></section>`:''}<div class="project-access-grid"><form id="projectAccessGenerateForm" class="project-access-form"><div class="project-access-form-head"><div><strong>${esc(t('generateProjectLink'))}</strong><small>${esc(t('client'))}</small></div>${faIcon('user-shield',{fallback:'•'})}</div><div class="fields-2"><label class="field"><span>${esc(t('selectPortalContact'))}</span><select class="select-input" name="client_contact_id" required><option value="">—</option>${contacts.map(c=>option(c.id,`${c.name}${c.email?` · ${c.email}`:''}`,primary)).join('')}</select></label><label class="field"><span>${esc(t('accessExpires'))}</span><div class="access-duration"><input type="number" name="ttl_days" min="1" max="${Number(cfg.access?.max_ttl_days||365)}" value="${Number(cfg.access?.default_ttl_days||90)}"><span>${esc(t('days'))}</span></div></label></div><div class="field"><span>${esc(t('accessPermissions'))}</span>${accessPermissionsForm()}</div><div class="form-actions"><button type="submit" class="primary-btn">${faIcon('link',{fallback:'↗'})}<span>${esc(t('generateProjectLink'))}</span></button></div></form><section class="project-access-history"><div class="detail-section-title compact-title"><span>${esc(t('activeAccessLinks'))}</span><small>${accessState.grants?.length||0}</small></div><div class="project-access-list">${accessState.grants?.length?accessState.grants.map(g=>`<article class="project-access-card state-${esc(g.state)}"><div><strong>${esc(g.contact_name||g.contact_email||'—')}</strong><small>${esc(g.contact_email||'')} · ${esc(g.expires_at||'')}</small></div><span class="nx-status-pill nx-tone-${g.state==='active'?'success':g.state==='expired'?'warning':'muted'}">${faIcon(g.state==='active'?'link':'link-slash',{fallback:'•'})}<span>${esc(accessStateLabel(g.state))}</span></span>${g.state==='active'?`<button type="button" class="danger-btn compact-btn" data-revoke-project-access="${g.id}">${esc(t('revokeProjectLink'))}</button>`:''}</article>`).join(''):`<div class="empty-inline">${esc(t('noAccessLinks'))}</div>`}</div></section></div></div>`;
}
function collectAccess(form){const d=Object.fromEntries(new FormData(form));return {client_contact_id:Number(d.client_contact_id),ttl_days:Number(d.ttl_days||90),can_view_progress:Boolean(form.elements.can_view_progress?.checked),can_view_milestones:Boolean(form.elements.can_view_milestones?.checked),can_view_tasks:Boolean(form.elements.can_view_tasks?.checked),can_submit_tickets:Boolean(form.elements.can_submit_tickets?.checked),can_comment_tickets:Boolean(form.elements.can_comment_tickets?.checked)}}
function bindAccess(p,cfg,accessState){
  const root=$('#projectAccessRoot'),form=$('#projectAccessGenerateForm');
  form?.addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;try{const next=await api(`/admin/client-projects/${p.id}/portal-access/generate`,{method:'POST',csrf:true,body:collectAccess(e.currentTarget)});toast(t('projectLinkGenerated'));renderAccess(root,cfg,next,next.portal_url||'');bindAccess(p,cfg,next)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}});
  $('#copyGeneratedProjectLink')?.addEventListener('click',async()=>{const value=$('#generatedProjectLink')?.value||'';if(!value)return;try{await navigator.clipboard.writeText(value);toast(t('projectLinkCopied'))}catch{toast(t('requestFailed'),'error')}});
  root?.querySelectorAll('[data-revoke-project-access]').forEach(btn=>btn.addEventListener('click',async()=>{const ok=await confirmDialog({title:t('revokeProjectLink'),message:t('revokeProjectLink'),confirmText:t('revokeProjectLink'),cancelText:t('cancel'),danger:true});if(!ok)return;btn.disabled=true;try{const next=await api(`/admin/client-projects/${p.id}/portal-access/${Number(btn.dataset.revokeProjectAccess)}/revoke`,{method:'POST',csrf:true,body:{}});toast(t('projectLinkRevoked'));renderAccess(root,cfg,next);bindAccess(p,cfg,next)}catch(err){toast(err.message,'error')}finally{btn.disabled=false}}));
}
export async function loadProjectAccess(p,draft=null){const root=$('#projectAccessRoot');if(!root)return;try{const [cfg,accessState]=await Promise.all([api(`/admin/client-projects/${p.id}/support/config`),api(`/admin/client-projects/${p.id}/portal-access`)]);renderAccess(root,cfg,accessState);restoreForm($('#projectAccessGenerateForm'),draft);bindAccess(p,cfg,accessState)}catch(err){root.innerHTML=`<div class="lifecycle-warning">${esc(err.message)}</div>`}}

export function bindWorkspaceNav(){
  const activate=id=>{
    active=id;
    $$('[data-project-module]').forEach(x=>x.hidden=x.dataset.projectModule!==id);
    $$('[data-project-module-jump]').forEach(x=>x.classList.toggle('is-active',x.dataset.projectModuleJump===id));
    if(id==='files'&&projectId)void loadProjectFiles({id:projectId});
    const more=$('.project-workspace-more');if(more&&SECONDARY_MODULES.includes(id))more.open=false;
  };
  $$('[data-project-module-jump]').forEach(b=>b.onclick=()=>activate(b.dataset.projectModuleJump));
  activate(active);
}
export function captureSupportDraft(){return {workspaceModule:active,access:captureForm($('#projectAccessGenerateForm')),selectedTicketId:selected?.id||null}}
