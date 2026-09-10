// This module drives the real frontend modules with isolated, in-memory API responses.
// No credentials, D1, R2, or external network connection. It is not a runtime app route.
const params=new URLSearchParams(location.search),lang=params.get('lang')||'ar',mode=params.get('case')||'basic';
const project={id:1,public_id:'project-ui-proof',project_code:'PRJ-001',name:lang==='ar'?'متجر الكتروني':'Online store',status:'active',allowed_statuses:['active','completed'],priority:'high',manual_progress_percent:100,effective_progress_percent:100,progress_mode:'manual',client_display_name:'Mohamed Elsayed',client_code:'CU-003',target_date:'2026-10-10',description:'',members:[],services:[],inquiries:[],currencies:[],contacts:[],archived_at:null};
const messages=[
  {author_type:'contact',body:'السلام عليكم، عايز أعرف آخر تحديثات المشروع وهل صفحة المنتجات خلصت؟',contact_name:'Mohamed Elsayed',created_at:'05:43'},
  {author_type:'admin',body:'وعليكم السلام، تم الانتهاء من صفحة المنتجات وربط الفلاتر. المتبقي مراجعة تجربة الطلب على الموبايل ثم نقفل المرحلة.',admin_name:'NEXORA',created_at:'05:45'},
  {author_type:'contact',body:'ممتاز. أهم حاجة عندي تكون طريقة العرض واضحة وسريعة على الموبايل.',contact_name:'Mohamed Elsayed',created_at:'05:49'},
  {author_type:'admin',body:'تم. هنراجع الـresponsive والـcheckout flow مع بعض قبل التسليم، وكل التغييرات هتظهر هنا مباشرة.',admin_name:'NEXORA',created_at:'05:52'},
  {author_type:'contact',body:'تمام، كملوا.',contact_name:'Mohamed Elsayed',created_at:'05:56'}
].map((m,i)=>({...m,id:i+1,visibility:'client',attachments:[]}));
if(lang==='en')messages.forEach((m,i)=>m.body=['Hello, what is the latest project update? Is the products page ready?','The products page and filters are ready. We are reviewing checkout on mobile before closing the milestone.','Great. Clear and fast presentation on mobile is my priority.','We will review responsive behavior and checkout together before delivery. Updates will appear here.','Thanks, please continue.'][i]);
if(mode==='long')for(let i=0;i<50;i++)messages.push({...messages[i%5],id:i+6,body:i%3===0?'LONG_UNBROKEN_TEXT_'.repeat(80):messages[i%5].body.repeat(6)});
const ticket=(id,title,status)=>({id,public_id:'ticket-'+id,ticket_code:'TKT-00'+id,title,type:'question',status,allowed_statuses:['new','in_progress','closed'],priority:id===3?'high':'normal',assigned_admin_id:1,description:'',attachments:[],messages:id===3?messages:[],updated_at:''});
let tickets=mode==='empty'?[]:[ticket(3,lang==='ar'?'استفسار عن المشروع':'Project update',mode==='closed'?'closed':'new'),ticket(2,lang==='ar'?'مشكلة في الطلب':'Order issue','closed'),ticket(1,lang==='ar'?'تجربة النظام':'System test','closed')];
const cfg={ticket_types:['question','issue'],ticket_priorities:['low','normal','high','urgent'],ticket_statuses:['new','in_progress','closed'],members:[{admin_user_id:1,name:'Elsayed Negm',is_active:1}],contacts:[],statuses:['active','completed'],priorities:['normal','high'],services:[],admins:[],currencies:[],execution:{progress_modes:['manual'],milestone_statuses:['pending'],task_statuses:['todo'],task_priorities:['normal']}};
const requests=[];
const json=data=>new Response(JSON.stringify({data}),{headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href),suffix=url.pathname.replace('/api/v1/admin/client-projects/1','');
  requests.push({method:options.method||'GET',path:url.pathname,body:options.body?JSON.parse(options.body):null,csrf:options.headers?.['X-CSRF-Token']||null});
  if(suffix==='/support/config'||url.pathname.endsWith('/client-projects/config'))return json(cfg);
  if(suffix==='/tickets'&&options.method==='POST'){const d=JSON.parse(options.body);const item={...ticket(tickets.length+1,d.title,'new'),...d};tickets.unshift(item);return json(item)}
  if(suffix==='/tickets')return json(tickets);
  const match=suffix.match(/^\/tickets\/(\d+)(?:\/(update|messages))?$/);
  if(match){let t=tickets.find(x=>x.id===+match[1]);if(options.method==='POST'){const d=JSON.parse(options.body);if(match[2]==='messages')t.messages.push({id:100,author_type:'admin',admin_name:'NEXORA',created_at:'06:00',attachments:[],...d});else Object.assign(t,d)}return json(t)}
  if(suffix==='/execution-summary')return json({progress_mode:'manual',effective_progress_percent:100,manual_progress_percent:100,calculated_progress_percent:100,task_count:0,milestone_count:0,completed_task_count:0});
  if(['/tasks','/milestones','/inquiry-options','/portal-access','/folders','/files'].includes(suffix))return json([]);
  throw new Error('Unexpected UI fixture request '+url.pathname);
};
// Keep the real connecting state; this fixture does not claim realtime transport proof.
window.WebSocket=class {readyState=0;close(){this.readyState=3}};
const [{state},{mountClientProjectDrawer,captureClientProjectDraft},{closeProjectWorkspace}]=await Promise.all([import('/admin/js/core/state.js'),import('/admin/js/modules/client-projects.js'),import('/admin/js/core/ui.js')]);
state.lang=lang;state.theme=params.get('theme')||'dark';state.clientProjectConfig=cfg;state.csrf='local-ui-proof-only';
document.querySelector('#authView')?.setAttribute('hidden','');
mountClientProjectDrawer(project,{support:{selectedTicketId:mode==='empty'?null:3}});
document.querySelector('[data-project-module-jump="tickets"]').click();
document.querySelector('#projectWorkspaceClose').onclick=closeProjectWorkspace;
document.querySelector('#projectWorkspaceTheme').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme};
document.querySelector('#projectWorkspaceLang').onclick=()=>{const draft=captureClientProjectDraft();state.lang=state.lang==='ar'?'en':'ar';document.documentElement.lang=state.lang;document.documentElement.dir=state.lang==='ar'?'rtl':'ltr';mountClientProjectDrawer(project,draft)};
window.uiProof=()=>{
  const rect=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}};
  const selectors=['.project-workspace-topbar','.project-context-row','.project-workspace-nav','.admin-support-workspace','.admin-ticket-sidebar','.admin-ticket-detail','.admin-ticket-detail-head','.admin-ticket-controls','.admin-ticket-thread','.admin-ticket-composer','.admin-composer-row'];
  const geometry=Object.fromEntries(selectors.map(s=>[s,rect(s)]));
  return {viewport:[innerWidth,innerHeight],theme:document.documentElement.dataset.theme,lang:document.documentElement.lang,pageOverflow:document.documentElement.scrollWidth>innerWidth,geometry,requests};
};
