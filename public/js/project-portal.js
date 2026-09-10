'use strict';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[char]));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const requestId=()=>`req_${crypto.randomUUID().replace(/-/g,'')}`;

const TICKET_TYPES=['bug','issue','change_request','feedback','question','support_request'];
const TICKET_PRIORITIES=['low','normal','high','urgent'];
const TICKET_STATUSES=['new','under_review','in_progress','waiting_client','resolved','closed','rejected','cancelled'];
const MAX_LOCAL_ATTACHMENTS=8;
const MAX_LOCAL_FILE_BYTES=25*1024*1024;

const TEXT={
  ar:{
    connecting:'جاري الاتصال',connected:'متصل الآن',logout:'خروج',theme:'تغيير المظهر',openingProject:'جاري فتح المشروع…',linkUnavailable:'الرابط غير متاح',linkUnavailableHint:'قد يكون الرابط منتهيًا أو تم إلغاؤه. اطلب رابطًا جديدًا من NEXORA.',client:'العميل',targetDate:'الموعد المستهدف',progress:'التقدم',overview:'بيانات المشروع',execution:'تنفيذ المشروع',ticketsSupport:'التذاكر والدعم',projectSnapshot:'ملخص المشروع',deliveryProgress:'تقدم التنفيذ',liveUpdates:'تحديث مباشر',tickets:'التذاكر',ticketCountUnit:'تذكرة',newTicket:'تذكرة جديدة',searchTickets:'البحث في التذاكر…',selectTicket:'اختر تذكرة',selectTicketHint:'اختر تذكرة من القائمة لعرض المحادثة والتفاصيل.',backToTickets:'العودة للتذاكر',newMessages:'رسائل جديدة',ticketClosed:'تم إغلاق التذكرة',ticketClosedHint:'إذا كان لديك طلب جديد، أنشئ تذكرة جديدة.',commentsUnavailable:'الرد غير متاح',commentsUnavailableHint:'يمكنك متابعة التذكرة، لكن الرد غير مفعّل لهذا الرابط.',attachFile:'إرفاق ملف',voiceNote:'تعليق صوتي',writeReply:'اكتب ردك هنا…',sendReply:'إرسال الرد',supportRequest:'طلب دعم',close:'إغلاق',ticketTitle:'عنوان التذكرة',type:'النوع',priority:'الأولوية',description:'الوصف',addFiles:'إضافة ملفات أو صور',fileHint:'PDF، صور، صوت أو مستندات — حتى 25MB للملف',cancel:'إلغاء',sendTicket:'إرسال التذكرة',download:'تنزيل',status:'الحالة',start:'تاريخ البدء',clientCode:'رمز العميل',noMilestones:'لا توجد مراحل متاحة',generalTasks:'مهام عامة',noTasks:'لا توجد مهام',allTickets:'كل التذاكر',noTickets:'لا توجد تذاكر بعد',noMessages:'لا توجد رسائل بعد',ticketCreated:'تم إنشاء التذكرة',ticketCreatedFilesFailed:'تم إنشاء التذكرة، لكن تعذر رفع بعض الملفات.',messageSent:'تم إرسال الرسالة',filesUploading:'جارٍ رفع الملفات',fileUploadFailed:'تعذر رفع الملف',voiceUnavailable:'التسجيل الصوتي غير متاح في هذا المتصفح.',voiceReady:'التعليق الصوتي جاهز',recording:'جارٍ التسجيل… اضغط مرة أخرى للإيقاف',sessionEnded:'انتهت جلسة المشروع. اطلب رابطًا جديدًا من NEXORA.',fileTooLarge:'الملف أكبر من الحد المسموح 25MB.',tooManyFiles:'الحد الأقصى 8 ملفات في العملية الواحدة.',reconnecting:'إعادة الاتصال…',syncingFiles:'جارٍ إرفاق الملفات بالتذكرة…',viewFile:'معاينة الملف',downloadFile:'تنزيل الملف',project:'المشروع',completed:'مكتمل',noTarget:'غير محدد',unknown:'غير محدد'
  },
  en:{
    connecting:'Connecting',connected:'Connected',logout:'Logout',theme:'Toggle theme',openingProject:'Opening project…',linkUnavailable:'Link unavailable',linkUnavailableHint:'This link may have expired or been revoked. Ask NEXORA for a new link.',client:'Client',targetDate:'Target date',progress:'Progress',overview:'Project overview',execution:'Project execution',ticketsSupport:'Tickets & support',projectSnapshot:'Project snapshot',deliveryProgress:'Delivery progress',liveUpdates:'Live updates',tickets:'Tickets',ticketCountUnit:'tickets',newTicket:'New ticket',searchTickets:'Search tickets…',selectTicket:'Select a ticket',selectTicketHint:'Choose a ticket from the list to view its conversation and details.',backToTickets:'Back to tickets',newMessages:'New messages',ticketClosed:'Ticket closed',ticketClosedHint:'Create a new ticket if you have another request.',commentsUnavailable:'Replies unavailable',commentsUnavailableHint:'You can follow this ticket, but replies are not enabled for this link.',attachFile:'Attach file',voiceNote:'Voice note',writeReply:'Write your reply…',sendReply:'Send reply',supportRequest:'Support request',close:'Close',ticketTitle:'Ticket title',type:'Type',priority:'Priority',description:'Description',addFiles:'Add files or images',fileHint:'PDF, images, audio or documents — up to 25MB per file',cancel:'Cancel',sendTicket:'Send ticket',download:'Download',status:'Status',start:'Start date',clientCode:'Client code',noMilestones:'No milestones available',generalTasks:'General tasks',noTasks:'No tasks',allTickets:'All tickets',noTickets:'No tickets yet',noMessages:'No messages yet',ticketCreated:'Ticket created',ticketCreatedFilesFailed:'Ticket created, but some files could not be uploaded.',messageSent:'Message sent',filesUploading:'Uploading files',fileUploadFailed:'File upload failed',voiceUnavailable:'Voice recording is unavailable in this browser.',voiceReady:'Voice note ready',recording:'Recording… press again to stop',sessionEnded:'This project session has ended. Ask NEXORA for a new link.',fileTooLarge:'The file exceeds the 25MB limit.',tooManyFiles:'A maximum of 8 files is allowed per operation.',reconnecting:'Reconnecting…',syncingFiles:'Attaching files to the ticket…',viewFile:'Preview file',downloadFile:'Download file',project:'Project',completed:'Completed',noTarget:'Not set',unknown:'Not set'
  }
};
const LABELS={
  ar:{new:'جديدة',under_review:'قيد المراجعة',in_progress:'قيد التنفيذ',waiting_client:'بانتظارك',resolved:'تم الحل',closed:'مغلقة',rejected:'مرفوضة',cancelled:'ملغاة',low:'منخفضة',normal:'عادية',high:'عالية',urgent:'عاجلة',bug:'خطأ',issue:'مشكلة',change_request:'طلب تعديل',feedback:'ملاحظة',question:'استفسار',support_request:'طلب دعم',planning:'تخطيط',active:'نشط',on_hold:'متوقف مؤقتًا',completed:'مكتمل',pending:'للتنفيذ',blocked:'متوقفة',todo:'للتنفيذ',done:'مكتملة'},
  en:{new:'New',under_review:'Under review',in_progress:'In progress',waiting_client:'Waiting for you',resolved:'Resolved',closed:'Closed',rejected:'Rejected',cancelled:'Cancelled',low:'Low',normal:'Normal',high:'High',urgent:'Urgent',bug:'Bug',issue:'Issue',change_request:'Change request',feedback:'Feedback',question:'Question',support_request:'Support request',planning:'Planning',active:'Active',on_hold:'On hold',completed:'Completed',pending:'Pending',blocked:'Blocked',todo:'To do',done:'Done'}
};

let lang=localStorage.getItem('nexora_project_portal_lang')||'ar';
let theme=localStorage.getItem('nexora_project_portal_theme')||'dark';
let csrf='';
let project=null;
let tickets=[];
let selectedId=null;
let selected=null;
let tab='tickets';
let ws=null;
let reconnectTimer=null;
let reconnectAttempt=0;
let pollTimer=null;
let heartbeatTimer=null;
let realtimeRefreshTimer=null;
let newFiles=[];
let newTicketRequestId=null;
let recorder=null;
let mediaStream=null;
let voiceChunks=[];
const replyDrafts=new Map();

const tr=key=>TEXT[lang]?.[key]??TEXT.en[key]??key;
const label=value=>LABELS[lang]?.[value]||value||'—';
const dateTime=value=>{
  if(!value)return '—';
  const raw=String(value);
  const parsed=new Date(raw.includes('T')?raw:raw.replace(' ','T')+'Z');
  if(Number.isNaN(parsed.getTime()))return raw;
  return new Intl.DateTimeFormat(lang==='ar'?'ar-EG':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(parsed);
};
const dateOnly=value=>{
  if(!value)return tr('noTarget');
  const raw=String(value);
  const parsed=new Date(raw.length<=10?`${raw}T00:00:00`:raw);
  if(Number.isNaN(parsed.getTime()))return raw;
  return new Intl.DateTimeFormat(lang==='ar'?'ar-EG':'en-GB',{dateStyle:'medium'}).format(parsed);
};
const bytes=value=>{const n=Number(value||0);return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`};
const statusIcon=value=>({completed:'circle-check',done:'circle-check',resolved:'circle-check',closed:'lock',active:'circle-play',in_progress:'arrows-rotate',under_review:'clock',waiting_client:'hourglass-half',on_hold:'pause',pending:'circle',todo:'circle',urgent:'triangle-exclamation',high:'arrow-up',normal:'minus',low:'arrow-down',blocked:'ban',rejected:'circle-xmark',cancelled:'circle-xmark',new:'sparkles'}[value]||'circle');
const tone=value=>({completed:'success',done:'success',resolved:'success',closed:'success',active:'progress',in_progress:'progress',under_review:'progress',new:'progress',waiting_client:'warning',on_hold:'warning',pending:'warning',todo:'muted',urgent:'danger',high:'warning',normal:'muted',low:'success',blocked:'danger',rejected:'danger',cancelled:'danger'}[value]||'muted');
const pill=value=>`<span class="portal-pill tone-${tone(value)}"><i class="fa-solid fa-${statusIcon(value)}" aria-hidden="true"></i><span>${esc(label(value))}</span></span>`;

function applyStaticI18n(){
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.documentElement.dataset.theme=theme;
  $('#portalLangBtn').textContent=lang==='ar'?'EN':'AR';
  $$('[data-i18n]').forEach(el=>{el.textContent=tr(el.dataset.i18n)});
  $$('[data-i18n-placeholder]').forEach(el=>{el.placeholder=tr(el.dataset.i18nPlaceholder)});
  $$('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',tr(el.dataset.i18nAria))});
  if(project){renderHero();renderOverview();renderExecution();renderTickets();renderSelected({preserveThread:true});}
  updateLiveUi(ws?.readyState===WebSocket.OPEN);
}
function show(mode){
  $('#portalLoading').hidden=mode!=='loading';
  $('#portalInvalid').hidden=mode!=='invalid';
  $('#portalView').hidden=mode!=='view';
  $('#portalLogoutBtn').hidden=mode!=='view';
  $('#portalRealtimeTop').hidden=mode!=='view';
}
async function parseResponse(res){
  let json={};
  try{json=await res.json()}catch{}
  if(!res.ok){const error=new Error(json?.error?.message||'Request failed');error.code=json?.error?.code;error.status=res.status;throw error}
  return json.data;
}
async function api(path,{method='GET',body=null,csrfRequired=false,retry=false}={}){
  const headers={Accept:'application/json'};
  if(body!==null)headers['Content-Type']='application/json';
  if(csrfRequired)headers['X-CSRF-Token']=csrf;
  const run=()=>fetch(`/api/v1${path}`,{method,headers,credentials:'same-origin',body:body===null?undefined:JSON.stringify(body)});
  let response;
  try{response=await run()}catch(error){if(!retry)throw error;await sleep(350);response=await run()}
  if(retry&&response.status>=500){await sleep(350);response=await run()}
  return parseResponse(response);
}
function toast(message,error=false){
  const el=$('#portalToast');
  el.textContent=message;el.className=`portal-toast${error?' error':''}`;el.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true},error?5000:2600);
}
function rawToken(){return new URLSearchParams(location.hash.slice(1)).get('token')||''}
function switchTab(id){
  tab=id;
  $$('[data-tab]').forEach(button=>button.classList.toggle('is-active',button.dataset.tab===id));
  $$('[data-pane]').forEach(pane=>{pane.hidden=pane.dataset.pane!==id});
}

function renderHero(){
  const p=project?.project||{},client=project?.client||{},contact=project?.contact||{};
  const progress=Math.max(0,Math.min(100,Number(p.progress_percent||0)));
  $('#portalTopProjectCode').textContent=p.project_code||'CLIENT PROJECT';
  $('#portalTopProjectName').textContent=p.name||'NEXORA';
  $('#portalProjectCode').textContent=p.project_code||'—';
  $('#portalProjectName').textContent=p.name||'—';
  $('#portalProjectNameStat').textContent=p.name||'—';
  $('#portalProjectAvatar').textContent=(p.name||'N').charAt(0).toUpperCase();
  $('#portalClientCode').textContent=client.client_code||'—';
  $('#portalClientName').textContent=client.display_name||'—';
  $('#portalContactName').textContent=contact.name||contact.email||'—';
  const status=$('#portalProjectStatus');status.className=`portal-status tone-${tone(p.status)}`;status.innerHTML=`<i class="fa-solid fa-${statusIcon(p.status)}" aria-hidden="true"></i><span>${esc(label(p.status))}</span>`;
  $('#portalTargetDate').textContent=dateOnly(p.target_date);
  $('#portalProgress').textContent=`${progress}%`;
  $('#portalProgressState').textContent=progress>=100?tr('completed'):label(p.status);
  $('.portal-progress-ring')?.style.setProperty('--p',String(progress));
}
function infoCard(icon,title,value){return `<article class="portal-info-card"><i class="fa-solid fa-${icon}" aria-hidden="true"></i><div><small>${esc(title)}</small><strong>${esc(value||'—')}</strong></div></article>`}
function renderOverview(){
  const p=project?.project||{},client=project?.client||{};
  $('#portalOverviewGrid').innerHTML=[
    infoCard('diagram-project',tr('status'),label(p.status)),
    infoCard('calendar-day',tr('start'),dateOnly(p.start_date)),
    infoCard('calendar-check',tr('targetDate'),dateOnly(p.target_date)),
    infoCard('address-card',tr('clientCode'),client.client_code||'—')
  ].join('');
}
function renderExecution(){
  const milestones=project?.milestones||[],tasks=project?.tasks||[];
  const groups=milestones.map(milestone=>({...milestone,tasks:tasks.filter(task=>task.milestone_public_id===milestone.public_id)}));
  const loose=tasks.filter(task=>!task.milestone_public_id);
  if(loose.length)groups.push({public_id:'general',title:tr('generalTasks'),status:'in_progress',tasks:loose});
  if(!groups.length){$('#portalExecutionBoard').innerHTML=`<div class="portal-overview-note">${esc(tr('noMilestones'))}</div>`;return}
  const firstOpen=Math.max(0,groups.findIndex(group=>!['completed','done'].includes(group.status)));
  $('#portalExecutionBoard').innerHTML=groups.map((group,index)=>`<details class="portal-stage" ${index===firstOpen?'open':''}><summary><strong>${esc(group.title||'—')}</strong>${pill(group.status)}<i class="fa-solid fa-chevron-down portal-stage-chevron" aria-hidden="true"></i></summary><div class="portal-stage-tasks">${group.tasks?.length?group.tasks.map(task=>`<article class="portal-task-row"><div><strong>${esc(task.title||'—')}</strong><small>${esc(label(task.status))}</small></div>${pill(task.status)}</article>`).join(''):`<div class="portal-overview-note">${esc(tr('noTasks'))}</div>`}</div></details>`).join('');
}
function renderFilters(){
  const select=$('#portalTicketFilter'),current=select.value;
  select.innerHTML=`<option value="">${esc(tr('allTickets'))}</option>`+TICKET_STATUSES.map(value=>`<option value="${esc(value)}">${esc(label(value))}</option>`).join('');
  select.value=TICKET_STATUSES.includes(current)?current:'';
}
function ticketMatches(ticket){
  const query=$('#portalTicketSearch').value.trim().toLowerCase(),filter=$('#portalTicketFilter').value;
  if(filter&&ticket.status!==filter)return false;
  if(!query)return true;
  return [ticket.ticket_code,ticket.title,ticket.description,label(ticket.type)].some(value=>String(value||'').toLowerCase().includes(query));
}
function renderTickets(){
  renderFilters();
  const visible=tickets.filter(ticketMatches);
  $('#portalTicketCount').textContent=String(tickets.length);
  $('#portalTicketFooterCount').textContent=String(tickets.length);
  $('#portalTicketNavCount').textContent=String(tickets.length);
  $('#portalTickets').innerHTML=visible.length?visible.map(ticket=>`<button class="portal-ticket-item ${selectedId===ticket.public_id?'is-active':''}" data-ticket="${esc(ticket.public_id)}" type="button"><div><small>${esc(ticket.ticket_code||ticket.public_id)}</small><strong>${esc(ticket.title)}</strong><small>${esc(label(ticket.type))} · ${esc(dateTime(ticket.updated_at))}</small></div><div class="portal-ticket-item-meta">${pill(ticket.priority)}${pill(ticket.status)}</div></button>`).join(''):`<div class="portal-overview-note">${esc(tr('noTickets'))}</div>`;
  $$('[data-ticket]').forEach(button=>button.addEventListener('click',()=>void openTicket(button.dataset.ticket,{background:false,forceBottom:true})));
}
function fileUrl(file,download=false){return `/api/v1/client-portal/files/${encodeURIComponent(file.public_id)}${download?'?download=1':''}`}
function attachment(file){
  const icon=file.file_kind==='pdf'?'file-pdf':file.file_kind==='image'?'file-image':file.file_kind==='audio'?'file-audio':'file-lines';
  return `<div class="portal-attachment"><i class="fa-solid fa-${icon}" aria-hidden="true"></i><div><strong>${esc(file.display_name)}</strong><small>${esc(bytes(file.version?.size_bytes))}</small></div><div>${file.previewable?`<button class="portal-mini-btn" type="button" data-preview="${esc(file.public_id)}" aria-label="${esc(tr('viewFile'))}"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>`:''}<a class="portal-mini-btn" href="${esc(fileUrl(file,true))}" aria-label="${esc(tr('downloadFile'))}"><i class="fa-solid fa-download" aria-hidden="true"></i></a></div></div>`;
}
function allSelectedFiles(){return [...(selected?.attachments||[]),...(selected?.messages||[]).flatMap(message=>message.attachments||[])]}
function threadState(){
  const thread=$('#portalTicketThread');
  if(!thread)return null;
  return {scrollTop:thread.scrollTop,nearBottom:thread.scrollHeight-thread.scrollTop-thread.clientHeight<90,messageCount:selected?.messages?.length||0};
}
function scrollThreadBottom(){const thread=$('#portalTicketThread');if(!thread)return;thread.scrollTop=thread.scrollHeight;$('#portalNewMessagesBtn').hidden=true}
function renderThread(ticket,{previous=null,forceBottom=false}={}){
  const output=[];
  if(ticket.attachments?.length)output.push(`<div class="portal-attachment-grid">${ticket.attachments.map(attachment).join('')}</div>`);
  for(const message of ticket.messages||[]){
    const admin=message.author_type==='admin';
    output.push(`<article class="portal-message ${admin?'is-admin':'is-client'}"><span class="portal-message-avatar">${admin?'N':'<i class="fa-solid fa-user" aria-hidden="true"></i>'}</span><div><div class="portal-message-meta"><strong>${esc(admin?'NEXORA':message.author_name||tr('client'))}</strong><time>${esc(dateTime(message.created_at))}</time></div><div class="portal-message-bubble">${esc(message.body||'')}${message.attachments?.length?`<div class="portal-attachment-grid">${message.attachments.map(attachment).join('')}</div>`:''}</div></div></article>`);
  }
  const thread=$('#portalTicketThread');
  thread.innerHTML=output.length?output.join(''):`<div class="portal-overview-note">${esc(tr('noMessages'))}</div>`;
  $$('[data-preview]',thread).forEach(button=>button.addEventListener('click',()=>preview(allSelectedFiles().find(file=>file.public_id===button.dataset.preview))));
  requestAnimationFrame(()=>{
    if(forceBottom||!previous||previous.nearBottom){scrollThreadBottom();return}
    thread.scrollTop=Math.min(previous.scrollTop,Math.max(0,thread.scrollHeight-thread.clientHeight));
    if((ticket.messages?.length||0)>previous.messageCount)$('#portalNewMessagesBtn').hidden=false;
  });
}
function getReplyDraft(id=selectedId){
  if(!id)return {body:'',files:[],uploads:new Map(),request:null};
  if(!replyDrafts.has(id))replyDrafts.set(id,{body:'',files:[],uploads:new Map(),request:null});
  return replyDrafts.get(id);
}
function saveReplyDraft(){if(!selectedId)return;const draft=getReplyDraft();const input=$('#portalReplyBody');if(input)draft.body=input.value}
function restoreReplyDraft(){
  const draft=getReplyDraft();
  $('#portalReplyBody').value=draft.body||'';
  renderPendingFiles($('#portalReplyAttachments'),draft.files,()=>{draft.request=null});
}
function renderSelected({preserveThread=false,forceBottom=false}={}){
  if(!selected||!selectedId)return;
  const previous=preserveThread?threadState():null;
  $('#portalTicketEmpty').hidden=true;
  $('#portalTicketDetail').hidden=false;
  $('#portalTicketCode').textContent=selected.ticket_code||'—';
  $('#portalTicketTitle').textContent=selected.title||'—';
  $('#portalTicketMeta').textContent=`${label(selected.type)} · ${dateTime(selected.opened_at||selected.updated_at)}`;
  $('#portalTicketBadges').innerHTML=`${pill(selected.priority)}${pill(selected.status)}`;
  renderThread(selected,{previous,forceBottom});
  const closed=selected.status==='closed';
  const cannotComment=!closed&&selected.can_comment===false;
  $('#portalClosedNotice').hidden=!closed;
  $('#portalClosedNewTicket').hidden=!closed||!project?.permissions?.submit_tickets;
  $('#portalCommentUnavailable').hidden=!cannotComment;
  $('#portalReplyForm').hidden=closed||cannotComment;
  $('.portal-ticket-workspace').classList.add('is-detail');
  restoreReplyDraft();
  renderTickets();
}
async function openTicket(id,{background=false,forceBottom=false}={}){
  const same=selectedId===id;
  if(selectedId)saveReplyDraft();
  const previous=same?threadState():null;
  try{
    const detail=await api(`/client-portal/tickets/${encodeURIComponent(id)}`);
    selectedId=id;selected=detail;
    $('#portalTicketEmpty').hidden=true;$('#portalTicketDetail').hidden=false;
    $('#portalTicketCode').textContent=selected.ticket_code||'—';
    $('#portalTicketTitle').textContent=selected.title||'—';
    $('#portalTicketMeta').textContent=`${label(selected.type)} · ${dateTime(selected.opened_at||selected.updated_at)}`;
    $('#portalTicketBadges').innerHTML=`${pill(selected.priority)}${pill(selected.status)}`;
    renderThread(selected,{previous:background?previous:null,forceBottom:forceBottom||!background});
    const closed=selected.status==='closed',cannotComment=!closed&&selected.can_comment===false;
    $('#portalClosedNotice').hidden=!closed;$('#portalClosedNewTicket').hidden=!closed||!project?.permissions?.submit_tickets;$('#portalCommentUnavailable').hidden=!cannotComment;$('#portalReplyForm').hidden=closed||cannotComment;
    $('.portal-ticket-workspace').classList.add('is-detail');
    restoreReplyDraft();renderTickets();
  }catch(error){if(!background)toast(error.message,true)}
}
function mergeTicketSummary(detail){
  const summary={public_id:detail.public_id,ticket_code:detail.ticket_code,type:detail.type,title:detail.title,description:detail.description,status:detail.status,priority:detail.priority,opened_at:detail.opened_at,resolved_at:detail.resolved_at,closed_at:detail.closed_at,updated_at:detail.updated_at};
  tickets=[summary,...tickets.filter(ticket=>ticket.public_id!==summary.public_id)].sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
}
async function loadTickets({refreshSelected=false,background=false}={}){
  const next=await api('/client-portal/tickets');
  tickets=next||[];renderTickets();
  if(selectedId&&!tickets.some(ticket=>ticket.public_id===selectedId)){
    saveReplyDraft();selectedId=null;selected=null;$('.portal-ticket-workspace').classList.remove('is-detail');$('#portalTicketDetail').hidden=true;$('#portalTicketEmpty').hidden=false;return;
  }
  if(refreshSelected&&selectedId)await openTicket(selectedId,{background,forceBottom:false});
}
async function loadProject({background=false}={}){
  try{const fresh=await api('/client-portal/project');project={...project,...fresh};renderHero();renderOverview();renderExecution();$('#portalNewTicketBtn').hidden=!project.permissions?.submit_tickets;$('#portalClosedNewTicket').hidden=!(selected?.status==='closed'&&project.permissions?.submit_tickets)}catch(error){if(!background)throw error}
}

function updateLiveUi(online){
  for(const id of ['portalRealtimeTop','portalListRealtime']){
    const el=$(`#${id}`);if(!el)continue;el.classList.toggle('is-offline',!online);const span=$('span',el);if(span)span.textContent=online?tr('connected'):tr('connecting');
  }
}
function stopPolling(){clearInterval(pollTimer);pollTimer=null}
function startPolling(){
  stopPolling();
  if(document.hidden||ws?.readyState===WebSocket.OPEN)return;
  pollTimer=setInterval(()=>void reconcileSilently({type:'poll'}),30000);
}
function stopHeartbeat(){clearInterval(heartbeatTimer);heartbeatTimer=null}
function startHeartbeat(){stopHeartbeat();heartbeatTimer=setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)try{ws.send('ping')}catch{}},25000)}
function reconnectDelay(){const base=Math.min(30000,1000*(2**Math.min(reconnectAttempt,5)));return Math.round(base*(.8+Math.random()*.4))}
function scheduleReconnect(){
  clearTimeout(reconnectTimer);
  if(document.hidden)return;
  const delay=reconnectDelay();reconnectAttempt++;
  reconnectTimer=setTimeout(connectRealtime,delay);
}
function connectRealtime(){
  clearTimeout(reconnectTimer);stopHeartbeat();
  try{if(ws&&ws.readyState<2)ws.close()}catch{}
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  try{ws=new WebSocket(`${protocol}//${location.host}/api/v1/client-portal/realtime`)}catch{updateLiveUi(false);startPolling();scheduleReconnect();return}
  updateLiveUi(false);
  ws.onopen=()=>{reconnectAttempt=0;updateLiveUi(true);stopPolling();startHeartbeat();void reconcileSilently({type:'reconnect'})};
  ws.onmessage=event=>{if(event.data==='pong')return;let payload={};try{payload=JSON.parse(event.data)}catch{}scheduleRealtimeReconcile(payload)};
  ws.onerror=()=>updateLiveUi(false);
  ws.onclose=()=>{updateLiveUi(false);stopHeartbeat();startPolling();scheduleReconnect()};
}
function scheduleRealtimeReconcile(event){clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(()=>void reconcileSilently(event),110)}
async function reconcileSilently(event={}){
  if(document.hidden)return;
  try{
    const type=String(event.type||'');
    if(!type||type==='poll'||type==='reconnect'||type.startsWith('project.')||type==='execution.updated')await loadProject({background:true});
    if(!type||type==='poll'||type==='reconnect'||type.startsWith('ticket.')||type.startsWith('file.')){
      await loadTickets({refreshSelected:false,background:true});
      if(selectedId&&(!event.ticket_public_id||event.ticket_public_id===selectedId))await openTicket(selectedId,{background:true,forceBottom:false});
    }
  }catch{}
}

function fillTicketForm(){
  const form=$('#portalTicketForm');
  form.elements.type.innerHTML=TICKET_TYPES.map(value=>`<option value="${value}">${esc(label(value))}</option>`).join('');
  form.elements.priority.innerHTML=TICKET_PRIORITIES.map(value=>`<option value="${value}" ${value==='normal'?'selected':''}>${esc(label(value))}</option>`).join('');
}
function validateAddedFiles(existing,incoming){
  const next=[...incoming];
  if(existing.length+next.length>MAX_LOCAL_ATTACHMENTS){toast(tr('tooManyFiles'),true);return []}
  if(next.some(file=>file.size>MAX_LOCAL_FILE_BYTES)){toast(tr('fileTooLarge'),true);return []}
  return next;
}
function renderPendingFiles(host,files,onChange=()=>{}){
  host.hidden=!files.length;
  host.innerHTML=files.map((file,index)=>`<span class="portal-pending-file"><span>${esc(file.name)}</span><button type="button" data-remove-file="${index}" aria-label="${esc(tr('close'))}">×</button></span>`).join('');
  $$('[data-remove-file]',host).forEach(button=>button.onclick=()=>{files.splice(Number(button.dataset.removeFile),1);onChange();renderPendingFiles(host,files,onChange)});
}
function openDrawer(){
  newFiles=[];newTicketRequestId=requestId();fillTicketForm();$('#portalTicketForm').reset();fillTicketForm();renderPendingFiles($('#portalNewTicketFileList'),newFiles);$('#portalNewTicketUploadState').hidden=true;$('#portalNewTicketBackdrop').hidden=false;$('#portalNewTicketDrawer').classList.add('is-open');$('#portalNewTicketDrawer').setAttribute('aria-hidden','false');requestAnimationFrame(()=>$('#portalTicketForm input[name="title"]')?.focus());
}
function closeDrawer(){
  $('#portalNewTicketBackdrop').hidden=true;$('#portalNewTicketDrawer').classList.remove('is-open');$('#portalNewTicketDrawer').setAttribute('aria-hidden','true');
}
async function uploadFile(ticketId,file,stableRequestId=requestId()){
  const headers={Accept:'application/json','Content-Type':file.type||'application/octet-stream','X-CSRF-Token':csrf,'X-Nexora-File-Name':encodeURIComponent(file.name),'X-Nexora-Client-Request-Id':stableRequestId};
  const run=()=>fetch(`/api/v1/client-portal/tickets/${encodeURIComponent(ticketId)}/files`,{method:'POST',headers,credentials:'same-origin',body:file});
  let response;
  try{response=await run()}catch{await sleep(350);response=await run()}
  if(response.status>=500){await sleep(350);response=await run()}
  return parseResponse(response);
}
async function createTicket(event){
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
  const data=Object.fromEntries(new FormData(form));
  const requestKey=newTicketRequestId||requestId();newTicketRequestId=requestKey;
  let created=null;
  try{
    created=await api('/client-portal/tickets',{method:'POST',csrfRequired:true,retry:true,body:{title:data.title,description:data.description,type:data.type,priority:data.priority,client_request_id:requestKey}});
  }catch(error){toast(error.message,true);button.disabled=false;return}

  newTicketRequestId=null;
  const attachments=[...newFiles];newFiles=[];
  closeDrawer();switchTab('tickets');
  saveReplyDraft();selectedId=created.public_id;selected=created;mergeTicketSummary(created);renderTickets();renderSelected({forceBottom:true});
  toast(tr('ticketCreated'));
  button.disabled=false;

  if(!attachments.length){void reconcileSilently({type:'ticket.created',ticket_public_id:created.public_id});return}
  const uploadState=$('#portalUploadState');uploadState.hidden=false;uploadState.className='portal-sync-note';
  let failures=0;
  for(let index=0;index<attachments.length;index++){
    uploadState.textContent=`${tr('filesUploading')} ${index+1}/${attachments.length}`;
    try{
      const file=await uploadFile(created.public_id,attachments[index],requestId());
      if(selectedId===created.public_id){selected.attachments=[...(selected.attachments||[]),file];renderThread(selected,{previous:threadState(),forceBottom:true})}
    }catch{failures++}
  }
  if(failures){uploadState.className='portal-sync-note is-error';uploadState.textContent=tr('ticketCreatedFilesFailed');toast(tr('ticketCreatedFilesFailed'),true)}else uploadState.hidden=true;
  try{await loadTickets({refreshSelected:false,background:true});if(selectedId===created.public_id)await openTicket(created.public_id,{background:true,forceBottom:true})}catch{}
}
function replySignature(body,files){return `${body}\n${files.map(file=>`${file.name}:${file.size}:${file.lastModified}`).join('|')}`}
async function reply(event){
  event.preventDefault();
  if(!selected||selected.status==='closed'||selected.can_comment===false)return;
  saveReplyDraft();
  const draft=getReplyDraft(),body=draft.body.trim();
  if(!body&&!draft.files.length)return;
  const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
  const signature=replySignature(body,draft.files);
  if(!draft.request||draft.request.signature!==signature)draft.request={signature,id:requestId()};
  const state=$('#portalUploadState');
  try{
    const attachmentIds=[];
    for(let index=0;index<draft.files.length;index++){
      const file=draft.files[index];let upload=draft.uploads.get(file);
      if(!upload){
        state.hidden=false;state.className='portal-sync-note';state.textContent=`${tr('filesUploading')} ${index+1}/${draft.files.length}`;
        const stable=requestId();const result=await uploadFile(selectedId,file,stable);upload={requestId:stable,publicId:result.public_id};draft.uploads.set(file,upload);
      }
      attachmentIds.push(upload.publicId);
    }
    const detail=await api(`/client-portal/tickets/${encodeURIComponent(selectedId)}/messages`,{method:'POST',csrfRequired:true,retry:true,body:{body,attachment_public_ids:attachmentIds,client_request_id:draft.request.id}});
    draft.body='';draft.files=[];draft.uploads=new Map();draft.request=null;selected=detail;mergeTicketSummary(detail);state.hidden=true;restoreReplyDraft();renderTickets();renderSelected({forceBottom:true});toast(tr('messageSent'));
    void reconcileSilently({type:'ticket.message.created',ticket_public_id:selectedId});
  }catch(error){
    state.hidden=true;
    if(error.code==='CLIENT_PORTAL_TICKET_CLOSED'){try{await openTicket(selectedId,{background:true})}catch{}}
    toast(error.message||tr('fileUploadFailed'),true);
  }finally{button.disabled=false}
}
function preview(file){
  if(!file)return;
  const url=fileUrl(file);$('#portalPreviewTitle').textContent=file.display_name;$('#portalPreviewDownload').href=fileUrl(file,true);
  if(file.file_kind==='image')$('#portalPreviewBody').innerHTML=`<img src="${esc(url)}" alt="${esc(file.display_name)}">`;
  else if(file.file_kind==='pdf')$('#portalPreviewBody').innerHTML=`<iframe src="${esc(url)}#toolbar=1" title="${esc(file.display_name)}"></iframe>`;
  else if(file.file_kind==='audio')$('#portalPreviewBody').innerHTML=`<audio controls preload="metadata" src="${esc(url)}"></audio>`;
  else $('#portalPreviewBody').innerHTML=`<div class="portal-preview-fallback"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i><a class="portal-primary" href="${esc(fileUrl(file,true))}">${esc(tr('download'))}</a></div>`;
  $('#portalPreviewBackdrop').hidden=false;$('#portalPreview').hidden=false;
}
function closePreview(){$('#portalPreviewBackdrop').hidden=true;$('#portalPreview').hidden=true;$('#portalPreviewBody').innerHTML=''}
async function toggleVoice(){
  if(recorder&&recorder.state==='recording'){recorder.stop();return}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){toast(tr('voiceUnavailable'),true);return}
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];recorder=new MediaRecorder(mediaStream);
    recorder.ondataavailable=event=>{if(event.data.size)voiceChunks.push(event.data)};
    recorder.onstop=()=>{
      const blob=new Blob(voiceChunks,{type:recorder.mimeType||'audio/webm'}),draft=getReplyDraft();
      if(draft.files.length>=MAX_LOCAL_ATTACHMENTS){toast(tr('tooManyFiles'),true)}else{draft.files.push(new File([blob],`voice-note-${Date.now()}.webm`,{type:blob.type}));draft.request=null;renderPendingFiles($('#portalReplyAttachments'),draft.files,()=>{draft.request=null})}
      $('#portalVoiceState').hidden=false;$('#portalVoiceState').textContent=tr('voiceReady');mediaStream?.getTracks().forEach(track=>track.stop());mediaStream=null;recorder=null;
    };
    recorder.start();$('#portalVoiceState').hidden=false;$('#portalVoiceState').textContent=tr('recording');
  }catch(error){toast(error.message||tr('voiceUnavailable'),true)}
}
function backToTickets(){$('.portal-ticket-workspace').classList.remove('is-detail');$('#portalNewMessagesBtn').hidden=true}
function bind(){
  $('#portalLangBtn').addEventListener('click',()=>{saveReplyDraft();lang=lang==='ar'?'en':'ar';localStorage.setItem('nexora_project_portal_lang',lang);applyStaticI18n()});
  $('#portalThemeBtn').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';localStorage.setItem('nexora_project_portal_theme',theme);applyStaticI18n()});
  $$('[data-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
  $('#portalTicketSearch').addEventListener('input',renderTickets);$('#portalTicketFilter').addEventListener('change',renderTickets);
  $('#portalNewTicketBtn').addEventListener('click',openDrawer);$('#portalClosedNewTicket').addEventListener('click',openDrawer);$('#portalNewTicketClose').addEventListener('click',closeDrawer);$('#portalTicketCancel').addEventListener('click',closeDrawer);$('#portalNewTicketBackdrop').addEventListener('click',closeDrawer);
  $('#portalTicketForm').addEventListener('submit',createTicket);
  $('#portalNewTicketFiles').addEventListener('change',event=>{const added=validateAddedFiles(newFiles,event.target.files);newFiles.push(...added);event.target.value='';renderPendingFiles($('#portalNewTicketFileList'),newFiles)});
  $('#portalReplyForm').addEventListener('submit',reply);$('#portalAttachBtn').addEventListener('click',()=>$('#portalReplyFile').click());
  $('#portalReplyFile').addEventListener('change',event=>{const draft=getReplyDraft(),added=validateAddedFiles(draft.files,event.target.files);draft.files.push(...added);draft.request=null;event.target.value='';renderPendingFiles($('#portalReplyAttachments'),draft.files,()=>{draft.request=null})});
  $('#portalReplyBody').addEventListener('input',()=>{const draft=getReplyDraft();draft.body=$('#portalReplyBody').value;draft.request=null});
  $('#portalVoiceBtn').addEventListener('click',toggleVoice);$('#portalTicketBack').addEventListener('click',backToTickets);$('#portalNewMessagesBtn').addEventListener('click',scrollThreadBottom);
  $('#portalPreviewClose').addEventListener('click',closePreview);$('#portalPreviewBackdrop').addEventListener('click',closePreview);
  $('#portalLogoutBtn').addEventListener('click',async()=>{try{await api('/client-portal/logout',{method:'POST'})}catch{}try{ws?.close()}catch{}show('invalid');$('#portalInvalid h1').textContent=tr('sessionEnded');$('#portalInvalid p').textContent=''});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPolling();return}if(!ws||ws.readyState>1)connectRealtime();else void reconcileSilently({type:'reconnect'})});
  window.addEventListener('online',()=>{if(!ws||ws.readyState>1)connectRealtime()});window.addEventListener('offline',()=>{updateLiveUi(false);startPolling()});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!$('#portalPreview').hidden)closePreview();else if($('#portalNewTicketDrawer').classList.contains('is-open'))closeDrawer();else if(innerWidth<=760&&$('.portal-ticket-workspace').classList.contains('is-detail'))backToTickets()});
}
async function authenticate(){
  try{
    const token=rawToken();let data;
    if(token){data=await api('/client-portal/exchange',{method:'POST',body:{token}});history.replaceState(null,'',location.pathname+location.search)}
    else data=await api('/client-portal/session');
    csrf=data.csrf_token||'';project=data;show('view');applyStaticI18n();renderHero();renderOverview();renderExecution();$('#portalNewTicketBtn').hidden=!project.permissions?.submit_tickets;await loadTickets();switchTab('tickets');connectRealtime();
  }catch{show('invalid')}
}

applyStaticI18n();
bind();
void authenticate();
