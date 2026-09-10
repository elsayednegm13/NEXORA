import baselineWorker from './fixtures/phase6_2_worker.js';
import candidateWorker from '../../src/worker.js';

const service={id:1,slug:'websites',title_ar:'المواقع',title_en:'Websites',short_description_ar:'قصير',short_description_en:'Short',description_ar:'وصف',description_en:'Description',icon_key:'web',is_active:1,is_featured:1,sort_order:1,seo_title_ar:'',seo_title_en:'',seo_description_ar:'',seo_description_en:''};
const project={id:1,slug:'nineveh-platform',title_ar:'نينوى',title_en:'Nineveh',short_description_ar:'',short_description_en:'',description_ar:'',description_en:'',challenge_ar:'',challenge_en:'',solution_ar:'',solution_en:'',website_url:'https://example.com',domain:'example.com',status:'live',cover_image:'',is_featured:1,is_active:1,sort_order:1,seo_title_ar:'',seo_title_en:'',seo_description_ar:'',seo_description_en:''};
const options=[
 {group_key:'project_stage',option_key:'existing',label_ar:'قائم',label_en:'Existing',sort_order:1},
 {group_key:'timeline',option_key:'1_3_months',label_ar:'1-3',label_en:'1-3',sort_order:1},
 {group_key:'budget_mode',option_key:'defined',label_ar:'محدد',label_en:'Defined',sort_order:1},
 {group_key:'currency',option_key:'EGP',label_ar:'EGP',label_en:'EGP',sort_order:1},
];

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];db.log.push(['prepare',norm(sql)]);}
  bind(...args){this.args=args;this.db.log.push(['bind',norm(this.sql),args]);return this;}
  async first(){this.db.log.push(['first',norm(this.sql),this.args]);return this.db.first(this.sql,this.args);}
  async all(){this.db.log.push(['all',norm(this.sql),this.args]);return {results:this.db.all(this.sql,this.args)};}
  async run(){this.db.log.push(['run',norm(this.sql),this.args]);return {success:true};}
}
function norm(s){return String(s).replace(/\s+/g,' ').trim();}
class DB {
  constructor(){this.log=[];}
  prepare(sql){return new Statement(this,sql);}
  async batch(stmts){this.log.push(['batch',stmts.length]);return stmts.map(()=>({success:true,results:[]}));}
  first(sql,args){const s=norm(sql);
    if(s==='SELECT 1 ok') return {ok:1};
    if(s.includes('INSERT INTO api_rate_limits')) return {attempts:1};
    if(s.includes('SELECT * FROM services WHERE slug=? AND is_active=1')) return service;
    if(s.includes('SELECT p.*,ma.url cover_image') && s.includes('WHERE p.slug=?')) return project;
    if(s.includes('SELECT public_id,status FROM project_inquiries WHERE client_request_id=?')) return null;
    if(s.includes('SELECT public_id FROM project_inquiries WHERE client_request_id=?')) return null;
    if(s.includes('SELECT COUNT(*) count FROM admin_users')) return {count:0};
    if(s.includes('FROM admin_users WHERE email=?')) return null;
    if(s.includes('FROM admin_users WHERE id=?')) return null;
    return null;
  }
  all(sql,args){const s=norm(sql);
    if(s.includes('FROM services WHERE is_active=1 ORDER BY sort_order,id') && s.startsWith('SELECT id,slug')) return [service];
    if(s.includes('FROM service_capabilities')) return [{id:1,title_ar:'قدرة',title_en:'Capability',description_ar:'',description_en:'',sort_order:1}];
    if(s.includes('FROM service_technologies')) return [{id:1,slug:'cloudflare',name_ar:'Cloudflare',name_en:'Cloudflare',icon_url:'',sort_order:1}];
    if(s.includes('FROM project_services ps JOIN projects')) return [{id:1,slug:'nineveh-platform',title_ar:'نينوى',title_en:'Nineveh',domain:'example.com',image:'',sort_order:1}];
    if(s.includes('FROM projects p LEFT JOIN media_assets') && s.includes('WHERE p.is_active=1')) return [project];
    if(s.includes('FROM project_technologies')) return [{id:1,slug:'cloudflare',name_ar:'Cloudflare',name_en:'Cloudflare',icon_url:'',sort_order:1}];
    if(s.includes('FROM project_services ps JOIN services')) return [{id:1,slug:'websites',title_ar:'المواقع',title_en:'Websites',icon_key:'web',sort_order:1}];
    if(s.includes('FROM project_results')) return [];
    if(s.includes('FROM project_media')) return [];
    if(s.includes('SELECT group_key,option_key,label_ar,label_en,sort_order FROM inquiry_option_items')) return options;
    if(s.includes('SELECT group_key,option_key FROM inquiry_option_items')) return options.map(({group_key,option_key})=>({group_key,option_key}));
    if(s.startsWith('SELECT id FROM services WHERE is_active=1')) return [{id:1}];
    return [];
  }
}

function envWith(db){return {
 DB:db,
 ASSETS:{fetch:async()=>new Response('asset-ok',{status:200,headers:{'X-Asset':'1'}})},
 MAX_JSON_BYTES:'262144',INQUIRY_RATE_LIMIT:'5',INQUIRY_RATE_WINDOW_SECONDS:'3600',ADMIN_SESSION_TIMEOUT_SECONDS:'28800',ADMIN_LOGIN_RATE_LIMIT:'8',ADMIN_LOGIN_RATE_WINDOW_SECONDS:'900',
 ADMIN_SETUP_KEY:'K'.repeat(32),ADMIN_PASSWORD_PEPPER:'P'.repeat(40),ADMIN_SESSION_SECRET:'S'.repeat(40),IP_HASH_SECRET:'I'.repeat(40)
};}
async function snap(worker, spec){
 const db=new DB(); const env=envWith(db);
 const req=new Request('https://nexora.test'+spec.path,{method:spec.method||'GET',headers:spec.headers||{},body:spec.body?JSON.stringify(spec.body):undefined});
 const res=await worker.fetch(req,env); let body=await res.text();
 try{const j=JSON.parse(body); if(j?.request_id)j.request_id='<RID>'; if(j?.data?.public_id?.startsWith?.('inq_'))j.data.public_id='<INQ>'; body=JSON.stringify(j);}catch{}
 const headers={}; for(const k of ['content-type','cache-control','x-content-type-options','set-cookie','x-asset']){const v=res.headers.get(k);if(v)headers[k]=v;}
 return {status:res.status,headers,body,db:db.log.map(x=>JSON.parse(JSON.stringify(x)))};
}
const cases=[
 {name:'options',path:'/api/v1/services',method:'OPTIONS'},
 {name:'health',path:'/api/v1/health'},
 {name:'health-db',path:'/api/v1/health/db'},
 {name:'services-list',path:'/api/v1/services'},
 {name:'service-detail',path:'/api/v1/services/websites'},
 {name:'service-invalid-slug',path:'/api/v1/services/INVALID!'},
 {name:'projects-list',path:'/api/v1/projects'},
 {name:'project-detail',path:'/api/v1/projects/nineveh-platform'},
 {name:'project-invalid-slug',path:'/api/v1/projects/INVALID!'},
 {name:'inquiry-config',path:'/api/v1/project-inquiries/config'},
 {name:'inquiry-invalid',path:'/api/v1/project-inquiries',method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'1.2.3.4'},body:{}},
 {name:'inquiry-success',path:'/api/v1/project-inquiries',method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'req-1','CF-Connecting-IP':'1.2.3.4'},body:{client_request_id:'req-1',name:'Ahmed',email:'a@example.com',phone:'',company:'',project_stage:'existing',timeline:'1_3_months',budget:{mode:'defined',amount:100,currency:'EGP'},description:'This description is definitely longer than twenty characters.',reference_url:'',preferred_contact:'email',privacy_accepted:true,website_confirm:'',service_ids:[1],service_slugs:[],locale:'ar',source:{page:'contact'}}},
 {name:'setup-status',path:'/api/v1/admin/setup/status'},
 {name:'admin-me-unauth',path:'/api/v1/admin/auth/me'},
 {name:'admin-login-invalid',path:'/api/v1/admin/auth/login',method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'1.2.3.4'},body:{email:'admin@example.com',password:'wrong'}},
 {name:'admin-dashboard-unauth',path:'/api/v1/admin/dashboard'},
 {name:'admin-inquiries-unauth',path:'/api/v1/admin/inquiries'},
 {name:'admin-projects-unauth',path:'/api/v1/admin/projects'},
 {name:'admin-services-unauth',path:'/api/v1/admin/services'},
 {name:'unknown-api',path:'/api/v1/unknown'},
 {name:'asset-fallback',path:'/index.html'},
];
let fail=0;
for(const c of cases){
 const a=await snap(baselineWorker,c), b=await snap(candidateWorker,c);
 // successful inquiry logs contain generated UUID only in bind; normalize it there.
 const clean=o=>JSON.parse(JSON.stringify(o).replace(/inq_[a-f0-9]{24}/g,'<INQ>').replace(/req_[a-f0-9]{16}/g,'<RID>'));
 const ca=clean(a), cb=clean(b); const eq=JSON.stringify(ca)===JSON.stringify(cb);
 console.log(`${eq?'PASS':'FAIL'} ${c.name}`);
 if(!eq){fail++;console.log('BASE',JSON.stringify(ca,null,2));console.log('CAND',JSON.stringify(cb,null,2));}
}
if(fail){console.error(`Worker parity failures: ${fail}`);process.exit(1)}
console.log(`WORKER_PARITY_PASS ${cases.length}/${cases.length}`);
