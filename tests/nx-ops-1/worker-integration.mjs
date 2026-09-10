import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../src/worker.js';
import { hashPassword } from '../../src/core/auth-admin.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON;');
for(const f of ['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql'])sqlite.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));

class D1Statement{
  constructor(owner,sql,args=[]){this.owner=owner;this.sql=sql;this.args=args}
  bind(...args){return new D1Statement(this.owner,this.sql,args)}
  async first(){const row=this.owner.sqlite.prepare(this.sql).get(...this.args);return row??null}
  async all(){return {results:this.owner.sqlite.prepare(this.sql).all(...this.args)}}
  async run(){const r=this.owner.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}}}
}
class D1{
  constructor(sqlite){this.sqlite=sqlite}
  prepare(sql){return new D1Statement(this,sql)}
  async batch(stmts){
    const out=[];this.sqlite.exec('BEGIN');
    try{
      for(const s of stmts){
        const op=s.sql.trim().split(/\s+/)[0].toUpperCase();
        if(['SELECT','PRAGMA','WITH'].includes(op)||/\bRETURNING\b/i.test(s.sql)){const rows=this.sqlite.prepare(s.sql).all(...s.args);out.push({success:true,results:rows})}
        else{const r=this.sqlite.prepare(s.sql).run(...s.args);out.push({success:true,results:[],meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}})}
      }
      this.sqlite.exec('COMMIT');return out;
    }catch(e){this.sqlite.exec('ROLLBACK');throw e}
  }
}
const DB=new D1(sqlite);
const env={DB,ASSETS:{fetch:async()=>new Response('asset')},MAX_JSON_BYTES:'262144',INQUIRY_RATE_LIMIT:'50',INQUIRY_RATE_WINDOW_SECONDS:'3600',ADMIN_SESSION_TIMEOUT_SECONDS:'28800',ADMIN_LOGIN_RATE_LIMIT:'20',ADMIN_LOGIN_RATE_WINDOW_SECONDS:'900',ADMIN_SETUP_KEY:'K'.repeat(32),ADMIN_PASSWORD_PEPPER:'P'.repeat(40),ADMIN_SESSION_SECRET:'S'.repeat(40),IP_HASH_SECRET:'I'.repeat(40)};
const password='StrongPassword123!';
const passwordHash=await hashPassword(password,env);
sqlite.prepare(`INSERT INTO admin_users(name,email,password_hash,is_active,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run('Admin','admin@nexora.test',passwordHash,1);

function assert(cond,msg){if(!cond)throw new Error(msg)}
async function req(pathname,{method='GET',body,headers={}}={}){
  const h={Accept:'application/json',...headers};if(body)h['Content-Type']='application/json';
  const res=await worker.fetch(new Request('https://nexora.test'+pathname,{method,headers:h,body:body?JSON.stringify(body):undefined}),env);
  const text=await res.text();let json;try{json=JSON.parse(text)}catch{json=text}
  return {res,json,text};
}

let r=await req('/api/v1/admin/clients');assert(r.res.status===401,'unauthenticated clients must be 401');
r=await req('/api/v1/admin/auth/login',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'1.2.3.4'},body:{email:'admin@nexora.test',password}});assert(r.res.status===200,'admin login failed '+r.text);
const cookie=r.res.headers.get('set-cookie').split(';')[0],csrf=r.json.data.csrf_token;
const auth={Cookie:cookie,Origin:'https://nexora.test','X-CSRF-Token':csrf,'CF-Connecting-IP':'1.2.3.4'};

r=await req('/api/v1/admin/clients/config',{headers:{Cookie:cookie}});assert(r.res.status===200,'client config');assert(r.json.data.currencies.includes('EGP'),'currency config missing');
r=await req('/api/v1/admin/clients',{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.items.length===0,'clients should start empty');
r=await req('/api/v1/admin/clients?status=not-a-status',{headers:{Cookie:cookie}});assert(r.res.status===422&&r.json.error.code==='CLIENT_STATUS_INVALID','invalid client status must fail');
r=await req('/api/v1/admin/clients?cursor=not-a-valid-cursor',{headers:{Cookie:cookie}});assert(r.res.status===422&&r.json.error.code==='CLIENT_CURSOR_INVALID','invalid client cursor must fail');
r=await req('/api/v1/admin/clients',{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:{client_type:'company',display_name:'No CSRF',default_currency:'EGP',preferred_language:'ar',status:'active'}});assert(r.res.status===419,'missing csrf must fail');
r=await req('/api/v1/admin/clients',{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:{client_type:'company',display_name:'Bad Origin',default_currency:'EGP',preferred_language:'ar',status:'active'}});assert(r.res.status===403,'cross origin must fail');

const manualBody={client_code:'NXR-ACME',client_type:'company',display_name:'Acme Holdings',legal_name:'Acme Holdings LLC',default_currency:'EGP',preferred_language:'en',status:'active',billing_name:'Acme Holdings',billing_email:'billing@acme.test',billing_phone:'+201000000000',billing_address_line1:'Cairo',billing_country_code:'EG',primary_contact:{name:'Mona Ali',email:'mona@acme.test',phone:'+201011111111',role_title:'Owner',preferred_language:'en',is_primary:true,status:'active'}};
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:manualBody});assert(r.res.status===201,'manual client create '+r.text);const manualId=r.json.data.id;assert(r.json.data.contacts.length===1&&r.json.data.contacts[0].is_primary===1,'primary contact create');assert(r.json.data.contacts[0].portal_enabled===0,'portal access must remain disabled');
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:{...manualBody,display_name:'Duplicate Code'}});assert(r.res.status===409&&r.json.error.code==='CLIENT_CODE_CONFLICT','duplicate client code must conflict');

r=await req(`/api/v1/admin/clients/${manualId}/contacts`,{method:'POST',headers:auth,body:{name:'Second Contact',email:'second@acme.test',phone:'',role_title:'Finance',preferred_language:'en',is_primary:true,status:'active'}});assert(r.res.status===201,'contact create');assert(r.json.data.contacts.filter(x=>x.is_primary===1).length===1,'only one primary contact');assert(r.json.data.contacts.every(x=>x.portal_enabled===0),'contact writes must not enable portal access');assert(r.json.data.contacts.find(x=>x.name==='Second Contact')?.is_primary===1,'new primary contact expected');
const firstContact=r.json.data.contacts.find(x=>x.name==='Mona Ali');assert(firstContact?.is_primary===0,'old primary must be cleared');
r=await req(`/api/v1/admin/clients/${manualId}/contacts/${firstContact.id}/update`,{method:'POST',headers:auth,body:{name:'Mona Ali',email:'mona@acme.test',phone:'+201011111111',role_title:'Owner',preferred_language:'en',is_primary:false,status:'inactive'}});assert(r.res.status===200&&r.json.data.contacts.find(x=>x.id===firstContact.id).status==='inactive','contact soft deactivate');

async function createInquiry(key,name,email,company=''){
  const body={client_request_id:key,name,email,phone:'+201022222222',company,project_stage:'idea',timeline:'flexible',budget:{mode:'guidance',amount:null,currency:'EGP'},description:'This is a sufficiently detailed project description for conversion testing.',reference_url:'',preferred_contact:'email',privacy_accepted:true,website_confirm:'',service_ids:[1],service_slugs:[],locale:'ar',source:{page:'contact',service:'websites'}};
  const x=await req('/api/v1/project-inquiries',{method:'POST',headers:{'Idempotency-Key':key,'CF-Connecting-IP':'5.6.7.8'},body});assert([200,201].includes(x.res.status),'inquiry create '+x.text);return Number(sqlite.prepare('SELECT id FROM project_inquiries WHERE client_request_id=?').get(key).id)
}
const inquiryId=await createInquiry('ops1-inquiry-new','Ahmed Hassan','ahmed@test.local','Ahmed Co');
r=await req(`/api/v1/admin/inquiries/${inquiryId}`,{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.conversion===null,'inquiry conversion starts null');
const convertNew={mode:'new',create_primary_contact:true,client:{client_type:'company',display_name:'Ahmed Co',legal_name:'Ahmed Co',client_code:'NXR-AHMED',default_currency:'EGP',preferred_language:'ar',status:'active',billing_name:'Ahmed Co',billing_email:'ahmed@test.local',billing_phone:'+201022222222'}};
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:convertNew});assert(r.res.status===419,'conversion without CSRF must fail');
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:convertNew});assert(r.res.status===403,'cross-origin conversion must fail');
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:auth,body:convertNew});assert(r.res.status===200&&!r.json.data.already_converted,'new conversion failed '+r.text);const convertedClientId=r.json.data.client.id;assert(r.json.data.client.contacts.length===1&&r.json.data.client.contacts[0].is_primary===1,'conversion contact missing');assert(r.json.data.client.contacts[0].portal_enabled===0,'conversion must not grant portal access');
assert(Number(sqlite.prepare('SELECT COUNT(*) n FROM inquiry_conversions').get().n)===1,'conversion row missing');
assert(Number(sqlite.prepare("SELECT COUNT(*) n FROM clients WHERE client_code='NXR-AHMED'").get().n)===1,'converted client missing');
const inquiryStatus=sqlite.prepare('SELECT status FROM project_inquiries WHERE id=?').get(inquiryId).status;assert(inquiryStatus==='new','conversion must not mutate inquiry status');
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:auth,body:convertNew});assert(r.res.status===200&&r.json.data.already_converted===true,'conversion must be idempotent');assert(Number(sqlite.prepare("SELECT COUNT(*) n FROM clients WHERE client_code='NXR-AHMED'").get().n)===1,'idempotent conversion created duplicate client');
r=await req(`/api/v1/admin/inquiries/${inquiryId}`,{headers:{Cookie:cookie}});assert(r.json.data.conversion?.client_id===convertedClientId,'inquiry detail conversion link missing');

const inquiry2=await createInquiry('ops1-inquiry-existing','Another User','another@test.local','Acme Holdings');
r=await req(`/api/v1/admin/inquiries/${inquiry2}/convert-client`,{method:'POST',headers:auth,body:{mode:'existing',client_id:manualId}});assert(r.res.status===200&&r.json.data.client.id===manualId,'link existing client failed');
assert(Number(sqlite.prepare('SELECT COUNT(*) n FROM inquiry_conversions WHERE client_id=?').get(manualId).n)===1,'existing link conversion missing');

r=await req(`/api/v1/admin/clients/${manualId}/update`,{method:'POST',headers:auth,body:{...manualBody,status:'archived',primary_contact:undefined}});assert(r.res.status===200&&r.json.data.status==='archived'&&r.json.data.archived_at,'client archive failed');
const inquiry3=await createInquiry('ops1-inquiry-archived','Third User','third@test.local','Acme');
r=await req(`/api/v1/admin/inquiries/${inquiry3}/convert-client`,{method:'POST',headers:auth,body:{mode:'existing',client_id:manualId}});assert(r.res.status===409&&r.json.error.code==='CLIENT_ARCHIVED','archived client must reject new conversion');
r=await req(`/api/v1/admin/clients/${manualId}/update`,{method:'POST',headers:auth,body:{...manualBody,status:'active',primary_contact:undefined}});assert(r.res.status===200&&r.json.data.status==='active'&&!r.json.data.archived_at,'client restore failed');

r=await req('/api/v1/admin/clients?q=Ahmed&status=active',{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.items.some(x=>x.id===convertedClientId),'client search failed');
assert(r.json.data.meta.has_more===false,'unexpected pagination state');
const filler=sqlite.prepare(`INSERT INTO clients(public_id,client_type,display_name,default_currency,preferred_language,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
for(let i=0;i<55;i++)filler.run(`cli_fill_${String(i).padStart(3,'0')}`,'individual',`Filler ${i}`,'EGP','en');
r=await req('/api/v1/admin/clients?status=active',{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.items.length===50&&r.json.data.meta.has_more===true&&r.json.data.meta.next_cursor,'client first page cursor failed');
const firstIds=new Set(r.json.data.items.map(x=>x.id));const cursor=r.json.data.meta.next_cursor;
r=await req('/api/v1/admin/clients?status=active&cursor='+encodeURIComponent(cursor),{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.items.length>=1,'client second page empty');assert(r.json.data.items.every(x=>!firstIds.has(x.id)),'cursor pagination duplicated rows');

const auditActions=sqlite.prepare("SELECT action FROM audit_logs WHERE action LIKE 'client%' OR action='inquiry.convert_client' ORDER BY id").all().map(x=>x.action);
for(const action of ['client.create','client_contact.create','client_contact.update','inquiry.convert_client','client.update'])assert(auditActions.includes(action),'missing audit '+action);
const fk=sqlite.prepare('PRAGMA foreign_key_check').all();assert(fk.length===0,'foreign key check failed');
console.log('NX_OPS_1_WORKER_INTEGRATION_PASS');
console.log(JSON.stringify({clients:Number(sqlite.prepare('SELECT COUNT(*) n FROM clients').get().n),contacts:Number(sqlite.prepare('SELECT COUNT(*) n FROM client_contacts').get().n),conversions:Number(sqlite.prepare('SELECT COUNT(*) n FROM inquiry_conversions').get().n),audit_actions:auditActions.length},null,2));
