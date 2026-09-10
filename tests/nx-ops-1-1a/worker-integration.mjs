import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../src/worker.js';
import { hashPassword } from '../../src/core/auth-admin.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON;');
for(const f of ['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql'])sqlite.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));

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
function expectedCode(id){return 'CU-'+String(Number(id)).padStart(3,'0')}
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

r=await req('/api/v1/admin/clients/config',{headers:{Cookie:cookie}});assert(r.res.status===200,'client config');assert(r.json.data.client_code?.server_generated===true,'client code must be server generated');assert(r.json.data.client_code?.minimum_digits===3,'minimum code width contract');
r=await req('/api/v1/admin/clients',{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:{client_type:'company',display_name:'No CSRF',default_currency:'EGP',preferred_language:'ar'}});assert(r.res.status===419,'missing csrf must fail');
r=await req('/api/v1/admin/clients',{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:{client_type:'company',display_name:'Bad Origin',default_currency:'EGP',preferred_language:'ar'}});assert(r.res.status===403,'cross origin must fail');

const companyBody={client_code:'MANUAL-MUST-BE-IGNORED',client_type:'company',display_name:'Acme Holdings',legal_name:'Acme Holdings LLC',default_currency:'EGP',preferred_language:'en',status:'archived',billing_name:'Acme Holdings',billing_email:'billing@acme.test',billing_phone:'+201000000000',billing_address_line1:'Cairo',billing_country_code:'EG',tax_identifier:'EG-TAX-123',primary_contact:{name:'Mona Ali',email:'mona@acme.test',phone:'+201011111111',role_title:'Owner',preferred_language:'en',is_primary:true,status:'active'}};
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:companyBody});assert(r.res.status===201,'company create '+r.text);const companyId=Number(r.json.data.id);assert(r.json.data.client_code===expectedCode(companyId),'automatic company code');assert(r.json.data.client_code!=='MANUAL-MUST-BE-IGNORED','browser code must not be authoritative');assert(r.json.data.status==='active','new client status must be server-owned active');assert(r.json.data.tax_identifier==='EG-TAX-123','company tax identifier missing');assert(r.json.data.contacts.length===1&&r.json.data.contacts[0].is_primary===1,'primary contact create');
const firstContactId=Number(r.json.data.contacts[0].id);
r=await req(`/api/v1/admin/clients/${companyId}/contacts`,{method:'POST',headers:auth,body:{name:'Second Contact',email:'second@acme.test',phone:'',role_title:'Finance',preferred_language:'en',is_primary:true,status:'active'}});assert(r.res.status===201,'second contact create');assert(r.json.data.contacts.filter(x=>x.is_primary===1).length===1,'only one primary contact');assert(r.json.data.contacts.find(x=>x.name==='Second Contact')?.is_primary===1,'new primary not selected');assert(r.json.data.contacts.every(x=>x.portal_enabled===0),'contact operation enabled portal');
r=await req(`/api/v1/admin/clients/${companyId}/contacts/${firstContactId}/update`,{method:'POST',headers:auth,body:{name:'Mona Ali',email:'mona@acme.test',phone:'+201011111111',role_title:'Owner',preferred_language:'en',is_primary:false,status:'inactive'}});assert(r.res.status===200&&r.json.data.contacts.find(x=>x.id===firstContactId)?.status==='inactive','contact soft deactivate regression');

// General edit cannot mutate Client Code or lifecycle status; Individual clears tax server-side.
r=await req(`/api/v1/admin/clients/${companyId}/update`,{method:'POST',headers:auth,body:{...companyBody,client_code:'HACK-CODE',client_type:'individual',tax_identifier:'SHOULD-NOT-SURVIVE',status:'archived',primary_contact:undefined}});assert(r.res.status===200,'client update');assert(r.json.data.client_code===expectedCode(companyId),'edit changed immutable client code');assert(r.json.data.status==='active','general edit changed lifecycle status');assert(r.json.data.client_type==='individual'&&r.json.data.tax_identifier===null,'individual must clear tax identifier');
r=await req(`/api/v1/admin/clients/${companyId}/update`,{method:'POST',headers:auth,body:{...companyBody,client_code:'OTHER-HACK',client_type:'company',tax_identifier:'EG-TAX-RESTORED',primary_contact:undefined}});assert(r.res.status===200&&r.json.data.tax_identifier==='EG-TAX-RESTORED','company tax restore failed');

// Explicit lifecycle transitions + security negatives.
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:{action:'deactivate'}});assert(r.res.status===419,'lifecycle without CSRF must fail');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:{action:'deactivate'}});assert(r.res.status===403,'cross-origin lifecycle must fail');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'deactivate'}});assert(r.res.status===200&&r.json.data.status==='on_hold','deactivate failed');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'restore'}});assert(r.res.status===409&&r.json.error.code==='CLIENT_LIFECYCLE_INVALID','invalid lifecycle transition must fail');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'activate'}});assert(r.res.status===200&&r.json.data.status==='active','reactivate failed');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'archive'}});assert(r.res.status===200&&r.json.data.status==='archived'&&r.json.data.archived_at,'archive failed');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'restore'}});assert(r.res.status===200&&r.json.data.status==='active'&&!r.json.data.archived_at,'restore failed');

// Create an Individual with a colliding user-supplied code: the server still allocates the next deterministic code.
const individualBody={client_code:r.json.data.client_code,client_type:'individual',display_name:'Delete Candidate',legal_name:'',default_currency:'EGP',preferred_language:'ar',billing_name:'Delete Candidate',billing_email:'delete@test.local',billing_phone:'',billing_country_code:'EG',tax_identifier:'MALICIOUS-TAX',primary_contact:{name:'Delete Candidate',email:'delete@test.local',phone:'',role_title:'',preferred_language:'ar',is_primary:true,status:'active'}};
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:individualBody});assert(r.res.status===201,'individual create '+r.text);const deleteId=Number(r.json.data.id),deleteCode=r.json.data.client_code;assert(deleteCode===expectedCode(deleteId),'automatic individual code');assert(r.json.data.tax_identifier===null,'individual create retained tax identifier');
// Token storage is a dependent cleanup relation, not a deletion blocker.
sqlite.prepare(`INSERT INTO client_profile_tokens(public_id,client_id,token_hash,expires_at,created_by_admin_id,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).run('cpt_delete',deleteId,'hash-delete','2099-01-01T00:00:00Z',1);
r=await req(`/api/v1/admin/clients/${deleteId}/delete`,{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:{confirm_code:deleteCode}});assert(r.res.status===403,'cross-origin delete must fail');
r=await req(`/api/v1/admin/clients/${deleteId}/delete`,{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:{confirm_code:deleteCode}});assert(r.res.status===419,'delete without CSRF must fail');
r=await req(`/api/v1/admin/clients/${deleteId}/delete`,{method:'POST',headers:auth,body:{confirm_code:'WRONG'}});assert(r.res.status===422&&r.json.error.code==='CLIENT_DELETE_CONFIRMATION_MISMATCH','delete confirmation mismatch must fail');
r=await req(`/api/v1/admin/clients/${deleteId}/delete`,{method:'POST',headers:auth,body:{confirm_code:deleteCode}});assert(r.res.status===200&&r.json.data.deleted===true,'guarded clean delete failed '+r.text);assert(!sqlite.prepare('SELECT id FROM clients WHERE id=?').get(deleteId),'deleted client still exists');assert(Number(sqlite.prepare('SELECT COUNT(*) n FROM client_contacts WHERE client_id=?').get(deleteId).n)===0,'contact cleanup failed');assert(Number(sqlite.prepare('SELECT COUNT(*) n FROM client_profile_tokens WHERE client_id=?').get(deleteId).n)===0,'token cleanup failed');

// IDs and codes must continue after a hard delete and never be reused.
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:{client_type:'company',display_name:'After Delete',legal_name:'After Delete LLC',default_currency:'EGP',preferred_language:'en',billing_name:'After Delete',billing_email:'after@test.local',billing_phone:'',billing_country_code:'EG',tax_identifier:'VAT-2'}});assert(r.res.status===201,'post-delete client create');const afterDeleteId=Number(r.json.data.id);assert(afterDeleteId>deleteId,'AUTOINCREMENT reused deleted client id');assert(r.json.data.client_code===expectedCode(afterDeleteId),'client code sequence did not continue after delete');

// Runtime boundary proof: minimum width 3, never a maximum.
sqlite.prepare("UPDATE sqlite_sequence SET seq=998 WHERE name='clients'").run();
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:{client_type:'individual',display_name:'Boundary 999',default_currency:'EGP',preferred_language:'en',billing_name:'Boundary 999',billing_email:'b999@test.local'}});assert(r.res.status===201&&Number(r.json.data.id)===999&&r.json.data.client_code==='CU-999','runtime CU-999 boundary failed');
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:{client_type:'individual',display_name:'Boundary 1000',default_currency:'EGP',preferred_language:'en',billing_name:'Boundary 1000',billing_email:'b1000@test.local'}});assert(r.res.status===201&&Number(r.json.data.id)===1000&&r.json.data.client_code==='CU-1000','runtime CU-1000 unbounded formatting failed');

async function createInquiry(key,name,email,company=''){
  const body={client_request_id:key,name,email,phone:'+201022222222',company,project_stage:'idea',timeline:'flexible',budget:{mode:'guidance',amount:null,currency:'EGP'},description:'This is a sufficiently detailed project description for conversion testing.',reference_url:'',preferred_contact:'email',privacy_accepted:true,website_confirm:'',service_ids:[1],service_slugs:[],locale:'ar',source:{page:'contact',service:'websites'}};
  const x=await req('/api/v1/project-inquiries',{method:'POST',headers:{'Idempotency-Key':key,'CF-Connecting-IP':'5.6.7.8'},body});assert([200,201].includes(x.res.status),'inquiry create '+x.text);return Number(sqlite.prepare('SELECT id FROM project_inquiries WHERE client_request_id=?').get(key).id)
}
const inquiryId=await createInquiry('ops11a-inquiry-new','Ahmed Hassan','ahmed@test.local','Ahmed Co');
const convertNew={mode:'new',create_primary_contact:true,client:{client_type:'company',display_name:'Ahmed Co',legal_name:'Ahmed Co',client_code:'MANUAL-CONVERT-CODE',default_currency:'EGP',preferred_language:'ar',billing_name:'Ahmed Co',billing_email:'ahmed@test.local',billing_phone:'+201022222222',tax_identifier:'VAT-AHMED'}};
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:convertNew});assert(r.res.status===419,'conversion without CSRF must fail');
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:convertNew});assert(r.res.status===403,'cross-origin conversion must fail');
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:auth,body:convertNew});assert(r.res.status===200&&!r.json.data.already_converted,'new conversion failed '+r.text);const convertedClientId=Number(r.json.data.client.id),convertedCode=r.json.data.client.client_code;assert(convertedCode===expectedCode(convertedClientId)&&convertedCode!=='MANUAL-CONVERT-CODE','conversion code not server allocated');assert(r.json.data.client.tax_identifier==='VAT-AHMED','conversion company tax missing');assert(r.json.data.client.contacts.length===1&&r.json.data.client.contacts[0].portal_enabled===0,'conversion contact/portal invariant');
r=await req(`/api/v1/admin/inquiries/${inquiryId}/convert-client`,{method:'POST',headers:auth,body:convertNew});assert(r.res.status===200&&r.json.data.already_converted===true,'conversion must be idempotent');assert(Number(sqlite.prepare('SELECT COUNT(*) n FROM inquiry_conversions WHERE project_inquiry_id=?').get(inquiryId).n)===1,'duplicate conversion row');assert(sqlite.prepare('SELECT status FROM project_inquiries WHERE id=?').get(inquiryId).status==='new','conversion mutated inquiry status');

// Deactivated existing clients are not eligible for new inquiry links.
const inquiry2=await createInquiry('ops11a-inquiry-existing','Existing Link','existing@test.local','Acme Holdings');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'deactivate'}});assert(r.res.status===200,'deactivate before existing link');
r=await req(`/api/v1/admin/inquiries/${inquiry2}/convert-client`,{method:'POST',headers:auth,body:{mode:'existing',client_id:companyId}});assert(r.res.status===409&&r.json.error.code==='CLIENT_INACTIVE','deactivated client accepted existing link');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'activate'}});assert(r.res.status===200,'reactivate before existing link');
r=await req(`/api/v1/admin/inquiries/${inquiry2}/convert-client`,{method:'POST',headers:auth,body:{mode:'existing',client_id:companyId}});assert(r.res.status===200&&r.json.data.client.id===companyId,'existing link failed');
// Historical relation blocks permanent delete, even with correct confirmation.
r=await req(`/api/v1/admin/clients/${companyId}/delete`,{method:'POST',headers:auth,body:{confirm_code:expectedCode(companyId)}});assert(r.res.status===409&&r.json.error.code==='CLIENT_DELETE_BLOCKED','historically linked client deletion must be blocked');assert(sqlite.prepare('SELECT id FROM clients WHERE id=?').get(companyId),'blocked client was deleted');

// Pagination still works with the new runtime.
const filler=sqlite.prepare(`INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
let maxId=Number(sqlite.prepare('SELECT COALESCE(MAX(id),0) id FROM clients').get().id);
for(let i=0;i<55;i++){const id=maxId+i+1;filler.run(`cli_fill_${String(i).padStart(3,'0')}`,expectedCode(id),'individual',`Filler ${i}`,'EGP','en')}
r=await req('/api/v1/admin/clients?status=active',{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.items.length===50&&r.json.data.meta.has_more===true&&r.json.data.meta.next_cursor,'client first page cursor failed');
const firstIds=new Set(r.json.data.items.map(x=>x.id));r=await req('/api/v1/admin/clients?status=active&cursor='+encodeURIComponent(r.json.data.meta.next_cursor),{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.items.length>=1,'client second page empty');assert(r.json.data.items.every(x=>!firstIds.has(x.id)),'cursor pagination duplicated rows');

const auditActions=sqlite.prepare("SELECT action FROM audit_logs WHERE action LIKE 'client%' OR action='inquiry.convert_client' ORDER BY id").all().map(x=>x.action);
for(const action of ['client.create','client.update','client.lifecycle','client.delete','inquiry.convert_client'])assert(auditActions.includes(action),'missing audit '+action);
const fk=sqlite.prepare('PRAGMA foreign_key_check').all();assert(fk.length===0,'foreign key check failed');
console.log('NX_OPS_1_1A_WORKER_INTEGRATION_PASS');
console.log(JSON.stringify({company_id:companyId,company_code:expectedCode(companyId),deleted_id:deleteId,deleted_code:deleteCode,post_delete_id:afterDeleteId,post_delete_code:expectedCode(afterDeleteId),converted_id:convertedClientId,converted_code:convertedCode,clients:Number(sqlite.prepare('SELECT COUNT(*) n FROM clients').get().n),conversions:Number(sqlite.prepare('SELECT COUNT(*) n FROM inquiry_conversions').get().n),audit_actions:auditActions.length},null,2));
