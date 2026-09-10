import baselineWorker from '../nx-core-2/fixtures/phase6_2_worker.js';
import candidateWorker from '../../src/worker.js';
import { hashPassword } from '../../src/core/auth-admin.js';

const envSecrets={MAX_JSON_BYTES:'262144',ADMIN_SESSION_TIMEOUT_SECONDS:'28800',ADMIN_LOGIN_RATE_LIMIT:'8',ADMIN_LOGIN_RATE_WINDOW_SECONDS:'900',ADMIN_SETUP_KEY:'K'.repeat(32),ADMIN_PASSWORD_PEPPER:'P'.repeat(40),ADMIN_SESSION_SECRET:'S'.repeat(40),IP_HASH_SECRET:'I'.repeat(40)};
const password='Password123!';
const passwordHash=await hashPassword(password,envSecrets);
const admin={id:1,name:'Admin User',email:'admin@example.com',password_hash:passwordHash,is_active:1,last_login_at:null};
const inquiry={id:1,public_id:'inq_test001',client_request_id:'req1',submission_language:'ar',name:'Ahmed',email:'a@example.com',phone:'',company:'Acme',project_stage_key:'existing',timeline_key:'soon',budget_mode_key:'defined',budget_amount:100,budget_currency:'EGP',description:'Long description for admin detail.',reference_url:null,preferred_contact:'email',status:'new',assigned_admin_id:null,internal_notes:null,created_at:'2026-09-07 12:00:00',updated_at:'2026-09-07 12:00:00',assigned_admin_name:null,project_stage_label_ar:'قائم',project_stage_label_en:'Existing',timeline_label_ar:'قريب',timeline_label_en:'Soon',budget_mode_label_ar:'محدد',budget_mode_label_en:'Defined',source_service_slug:'websites',source_service_title_ar:'المواقع',source_service_title_en:'Websites'};
const project={id:1,slug:'nineveh-platform',title_ar:'نينوى',title_en:'Nineveh',short_description_ar:'',short_description_en:'',description_ar:'',description_en:'',challenge_ar:'',challenge_en:'',solution_ar:'',solution_en:'',website_url:'https://example.com',domain:'example.com',status:'live',cover_image:'',is_featured:1,is_active:1,sort_order:1,seo_title_ar:'',seo_title_en:'',seo_description_ar:'',seo_description_en:'',updated_at:'2026-09-07 12:00:00'};
const service={id:1,slug:'websites',title_ar:'المواقع',title_en:'Websites',short_description_ar:'',short_description_en:'',description_ar:'',description_en:'',icon_key:'web',is_active:1,is_featured:1,sort_order:1,seo_title_ar:'',seo_title_en:'',seo_description_ar:'',seo_description_en:'',updated_at:'2026-09-07 12:00:00'};
function norm(s){return String(s).replace(/\s+/g,' ').trim();}
class Statement{constructor(db,sql){this.db=db;this.sql=sql;this.args=[];db.log.push(['prepare',norm(sql)]);}bind(...a){this.args=a;dbLog(this.db,['bind',norm(this.sql),a]);return this;}async first(){dbLog(this.db,['first',norm(this.sql),this.args]);return this.db.first(this.sql,this.args);}async all(){dbLog(this.db,['all',norm(this.sql),this.args]);return {results:this.db.all(this.sql,this.args)}}async run(){dbLog(this.db,['run',norm(this.sql),this.args]);return {success:true}}}
function dbLog(db,x){db.log.push(x)}
class DB{constructor(){this.log=[];}prepare(sql){return new Statement(this,sql)}async batch(stmts){this.log.push(['batch',stmts.map(s=>norm(s.sql))]);if(stmts.length===7 && norm(stmts[0].sql).includes('COUNT(*) value FROM projects')){return [12,12,5,5,1,1,null].map((v,i)=>i<6?{results:[{value:v}]}:{results:[{id:1,public_id:'inq_test001',name:'Ahmed',email:'a@example.com',status:'new',created_at:'2026-09-07 12:00:00'}]})}return stmts.map(()=>({results:[],success:true}))}
 first(sql,args){const s=norm(sql);if(s.includes('INSERT INTO api_rate_limits'))return {attempts:1};if(s.includes('FROM admin_users WHERE email=?'))return admin;if(s.includes('FROM admin_users WHERE id=? AND is_active=1'))return admin;if(s.includes('SELECT status FROM project_inquiries'))return {status:'new'};if(s.includes('FROM project_inquiries i LEFT JOIN admin_users'))return {...inquiry};if(s.includes('FROM projects p LEFT JOIN media_assets')&&s.includes('WHERE p.id=?'))return {...project};if(s.includes('SELECT * FROM services WHERE id=?'))return {...service};return null}
 all(sql,args){const s=norm(sql);if(s.includes('FROM project_inquiries i LEFT JOIN services s')&&s.includes('LIMIT 100'))return [{id:1,public_id:'inq_test001',name:'Ahmed',email:'a@example.com',phone:'',company:'Acme',status:'new',submission_language:'ar',source_service_slug:'websites',source_package_key:null,created_at:'2026-09-07 12:00:00',updated_at:'2026-09-07 12:00:00',source_service_title_ar:'المواقع',source_service_title_en:'Websites'}];if(s.includes('FROM project_inquiry_services'))return [{id:1,slug:'websites',title_ar:'المواقع',title_en:'Websites',icon_key:'web'}];if(s.includes('FROM project_inquiry_status_history'))return [{id:1,from_status:null,to_status:'new',note:null,created_at:'2026-09-07 12:00:00',changed_by:null}];if(s.includes('FROM projects p LEFT JOIN media_assets')&&!s.includes('WHERE p.id=?'))return [{...project}];if(s==='SELECT * FROM services ORDER BY sort_order,id')return [{...service}];return []}}
function makeEnv(db){return {...envSecrets,DB:db,ASSETS:{fetch:async()=>new Response('asset')}}}
function cleanObj(o){
  if(Array.isArray(o?.db)){
    o.db=o.db.map(entry=>{
      if(!Array.isArray(entry)||!String(entry[1]||'').includes('api_rate_limits'))return entry;
      const copy=structuredClone(entry);
      const args=copy.at(-1);
      if(Array.isArray(args)&&args.length===8){for(const i of [2,3,5,7])args[i]='<NOW>';}
      return copy;
    });
  }
  let s=JSON.stringify(o);s=s.replace(/req_[a-f0-9]{16}/g,'<RID>').replace(/nexora_admin=[^;]+/g,'nexora_admin=<TOKEN>').replace(/"csrf_token":"[^"]+"/g,'"csrf_token":"<CSRF>"');return JSON.parse(s)
}
async function doReq(worker,db,path,{method='GET',body,headers={}}={}){const req=new Request('https://nexora.test'+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const res=await worker.fetch(req,makeEnv(db));const text=await res.text();let parsed;try{parsed=JSON.parse(text)}catch{parsed=text}return {res,text,parsed}}
async function flow(worker){const db=new DB();
 const login=await doReq(worker,db,'/api/v1/admin/auth/login',{method:'POST',headers:{'CF-Connecting-IP':'1.2.3.4','Origin':'https://nexora.test'},body:{email:'admin@example.com',password}});if(login.res.status!==200)throw new Error('login '+login.res.status+' '+login.text);const csrf=login.parsed.data.csrf_token;const cookie=login.res.headers.get('set-cookie').split(';')[0];const authHeaders={'Cookie':cookie,'X-CSRF-Token':csrf,'Origin':'https://nexora.test'};
 const specs=[
  ['me','/api/v1/admin/auth/me',{}],['dashboard','/api/v1/admin/dashboard',{}],['inquiries','/api/v1/admin/inquiries?q=Ahmed&status=new',{}],['inquiry-detail','/api/v1/admin/inquiries/1',{}],['inquiry-update','/api/v1/admin/inquiries/1/update',{method:'POST',headers:authHeaders,body:{status:'reviewing',internal_notes:'Note',status_note:'Moving'}}],['projects','/api/v1/admin/projects',{}],['project-update','/api/v1/admin/projects/1/update',{method:'POST',headers:authHeaders,body:{slug:'nineveh-platform',title_ar:'نينوى',title_en:'Nineveh',short_description_ar:'',short_description_en:'',description_ar:'',description_en:'',challenge_ar:'',challenge_en:'',solution_ar:'',solution_en:'',website_url:'https://example.com',domain:'example.com',status:'live',is_featured:true,is_active:true,sort_order:1,seo_title_ar:'',seo_title_en:'',seo_description_ar:'',seo_description_en:''}}],['services','/api/v1/admin/services',{}],['service-update','/api/v1/admin/services/1/update',{method:'POST',headers:authHeaders,body:{slug:'websites',title_ar:'المواقع',title_en:'Websites',short_description_ar:'',short_description_en:'',description_ar:'',description_en:'',icon_key:'web',is_active:true,is_featured:true,sort_order:1,seo_title_ar:'',seo_title_en:'',seo_description_ar:'',seo_description_en:''}}],['logout','/api/v1/admin/auth/logout',{method:'POST',headers:authHeaders}]
 ];
 const out={login:{status:login.res.status,body:login.parsed,setCookie:login.res.headers.get('set-cookie')},cases:{}};
 for(const [name,path,opt] of specs){const headers=opt.headers||{'Cookie':cookie};const r=await doReq(worker,db,path,{...opt,headers});out.cases[name]={status:r.res.status,body:r.parsed,setCookie:r.res.headers.get('set-cookie')}}
 out.db=db.log;return cleanObj(out)}
function stripOps1Additions(x){
  for(const key of ['inquiry-detail','inquiry-update']){const data=x?.cases?.[key]?.body?.data;if(data&&Object.prototype.hasOwnProperty.call(data,'conversion'))delete data.conversion}
  if(Array.isArray(x.db))x.db=x.db.filter(entry=>!JSON.stringify(entry).includes('inquiry_conversions'));
  return x;
}
const a=stripOps1Additions(await flow(baselineWorker)),b=stripOps1Additions(await flow(candidateWorker));const eq=JSON.stringify(a)===JSON.stringify(b);console.log(eq?'NX_OPS_1_EXISTING_ADMIN_COMPAT_PASS':'NX_OPS_1_EXISTING_ADMIN_COMPAT_FAIL');if(!eq){console.log('BASE',JSON.stringify(a,null,2));console.log('CAND',JSON.stringify(b,null,2));process.exit(1)}console.log('Existing authenticated admin routes: 10/10 compatible (additive conversion field excluded)');
