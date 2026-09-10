import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../src/worker.js';
import { hashPassword } from '../../src/core/auth-admin.js';
import { sha256Hex } from '../../src/core/crypto.js';

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
        if(['SELECT','PRAGMA','WITH'].includes(op)||/\bRETURNING\b/i.test(s.sql)){const rows=this.sqlite.prepare(s.sql).all(...s.args);out.push({success:true,results:rows,meta:{changes:0}})}
        else{const r=this.sqlite.prepare(s.sql).run(...s.args);out.push({success:true,results:[],meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}})}
      }
      this.sqlite.exec('COMMIT');return out;
    }catch(e){this.sqlite.exec('ROLLBACK');throw e}
  }
}
const DB=new D1(sqlite);
const env={DB,ASSETS:{fetch:async()=>new Response('asset')},MAX_JSON_BYTES:'262144',INQUIRY_RATE_LIMIT:'100',INQUIRY_RATE_WINDOW_SECONDS:'3600',ADMIN_SESSION_TIMEOUT_SECONDS:'28800',ADMIN_LOGIN_RATE_LIMIT:'50',ADMIN_LOGIN_RATE_WINDOW_SECONDS:'900',ADMIN_SETUP_KEY:'K'.repeat(32),ADMIN_PASSWORD_PEPPER:'P'.repeat(40),ADMIN_SESSION_SECRET:'S'.repeat(40),IP_HASH_SECRET:'I'.repeat(40)};
const password='StrongPassword123!';
const passwordHash=await hashPassword(password,env);
sqlite.prepare(`INSERT INTO admin_users(name,email,password_hash,is_active,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run('Admin','admin@nexora.test',passwordHash,1);

function assert(cond,msg){if(!cond)throw new Error(msg)}
async function req(pathname,{method='GET',body,headers={}}={}){
  const h={Accept:'application/json',...headers};if(body!==undefined)h['Content-Type']='application/json';
  const res=await worker.fetch(new Request('https://nexora.test'+pathname,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined}),env);
  const text=await res.text();let json;try{json=JSON.parse(text)}catch{json=text}
  return {res,json,text};
}
function tokenFrom(url){const u=new URL(url);return new URLSearchParams(u.hash.slice(1)).get('token')||''}

let r=await req('/api/v1/admin/auth/login',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'1.2.3.4'},body:{email:'admin@nexora.test',password}});assert(r.res.status===200,'admin login failed '+r.text);
const cookie=r.res.headers.get('set-cookie').split(';')[0],csrf=r.json.data.csrf_token;
const auth={Cookie:cookie,Origin:'https://nexora.test','X-CSRF-Token':csrf,'CF-Connecting-IP':'1.2.3.4'};

// Create a company through the accepted NX-OPS-1.1A runtime.
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:{client_type:'company',display_name:'Profile Co',legal_name:'Profile Co LLC',default_currency:'EGP',preferred_language:'en',billing_name:'Profile Co',billing_email:'old@profile.test',billing_phone:'+201000000001',billing_country_code:'EG',tax_identifier:'OLD-TAX'}});assert(r.res.status===201,'client create '+r.text);
const companyId=Number(r.json.data.id),companyCode=r.json.data.client_code;assert(companyCode==='CU-001','company code baseline');

r=await req(`/api/v1/admin/clients/${companyId}/profile-completion`);assert(r.res.status===401,'profile status must require admin');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion`,{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.link===null,'initial profile link state');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:{}});assert(r.res.status===419,'generate without csrf must fail');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:{...auth,Origin:'https://evil.test'},body:{}});assert(r.res.status===403,'generate cross-origin must fail');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});assert(r.res.status===200,'generate link failed '+r.text);assert(r.json.data.link?.state==='active','generated link not active');assert(/\/client-profile\.html#token=/.test(r.json.data.completion_url),'completion url must use fragment token');
const token1=tokenFrom(r.json.data.completion_url);assert(/^[A-Za-z0-9_-]{43}$/.test(token1),'token entropy/format');
const stored1=sqlite.prepare('SELECT id,token_hash,revoked_at,completed_at FROM client_profile_tokens WHERE client_id=? ORDER BY id DESC LIMIT 1').get(companyId);assert(stored1.token_hash!==token1,'raw token stored in D1');assert(stored1.token_hash===await sha256Hex(token1),'stored token hash mismatch');assert(!r.text.includes(stored1.token_hash),'token hash leaked to admin response');

// Regeneration revokes the first capability and returns a new one.
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});assert(r.res.status===200,'regenerate failed');const token2=tokenFrom(r.json.data.completion_url);assert(token2&&token2!==token1,'regeneration did not rotate token');assert(sqlite.prepare('SELECT revoked_at FROM client_profile_tokens WHERE id=?').get(stored1.id).revoked_at,'old token not revoked');
r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'2.2.2.2'},body:{token:token1}});assert(r.res.status===410,'revoked token resolved');
r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://evil.test','CF-Connecting-IP':'2.2.2.2'},body:{token:token2}});assert(r.res.status===403,'public resolve cross-origin must fail');
r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'2.2.2.2'},body:{token:token2}});assert(r.res.status===200,'active token resolve '+r.text);assert(r.json.data.client_code===companyCode&&r.json.data.client_type==='company','safe identity dto');assert(r.json.data.profile.billing_email==='old@profile.test','profile dto missing field');for(const forbidden of ['status','created_by_admin_id','archived_at','inquiry_conversions','contacts','public_id'])assert(!(forbidden in r.json.data),`public DTO leaked ${forbidden}`);

// Client cannot mutate server-owned identity/type/status. Completion consumes the link once.
const completionProfile={...r.json.data.profile,display_name:'Profile Co Updated',legal_name:'Profile Co Updated LLC',preferred_language:'ar',billing_name:'Profile Billing',billing_email:'new@profile.test',billing_phone:'+201000000099',billing_address_line1:'Cairo',billing_address_line2:'Suite 9',billing_city:'Cairo',billing_region:'Cairo',billing_postal_code:'11511',billing_country_code:'eg',tax_identifier:'NEW-TAX',client_code:'HACK',client_type:'individual',status:'archived'};
r=await req('/api/v1/client-profile/complete',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'2.2.2.2'},body:{token:token2,profile:completionProfile}});assert(r.res.status===200&&r.json.data.completed===true,'profile complete failed '+r.text);
const updated=sqlite.prepare('SELECT client_code,client_type,status,display_name,preferred_language,billing_email,billing_country_code,tax_identifier FROM clients WHERE id=?').get(companyId);assert(updated.client_code===companyCode,'client completion changed code');assert(updated.client_type==='company','client completion changed type');assert(updated.status==='active','client completion changed status');assert(updated.display_name==='Profile Co Updated'&&updated.preferred_language==='ar','allowed client fields not updated');assert(updated.billing_email==='new@profile.test'&&updated.billing_country_code==='EG'&&updated.tax_identifier==='NEW-TAX','billing/tax completion failed');
r=await req('/api/v1/client-profile/complete',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'2.2.2.2'},body:{token:token2,profile:completionProfile}});assert(r.res.status===410,'completed token replay accepted');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion`,{headers:{Cookie:cookie}});assert(r.res.status===200&&r.json.data.link?.state==='completed','admin state not completed');assert(!r.text.includes('token_hash'),'token hash leaked in status');

// Active link is automatically revoked when the client is deactivated.
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});const token3=tokenFrom(r.json.data.completion_url);assert(token3,'third token missing');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'deactivate'}});assert(r.res.status===200&&r.json.data.status==='on_hold','deactivate failed');const latest=sqlite.prepare('SELECT revoked_at FROM client_profile_tokens WHERE client_id=? ORDER BY id DESC LIMIT 1').get(companyId);assert(latest.revoked_at,'deactivate did not revoke active link');
r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'3.3.3.3'},body:{token:token3}});assert(r.res.status===410,'deactivated client token resolved');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});assert(r.res.status===409&&r.json.error.code==='CLIENT_PROFILE_LINK_UNAVAILABLE','inactive client generated link');
r=await req(`/api/v1/admin/clients/${companyId}/lifecycle`,{method:'POST',headers:auth,body:{action:'activate'}});assert(r.res.status===200,'reactivate failed');

// Explicit revoke and expiry both invalidate links.
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});const token4=tokenFrom(r.json.data.completion_url);r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/revoke`,{method:'POST',headers:{Cookie:cookie,Origin:'https://nexora.test'},body:{}});assert(r.res.status===419,'revoke without csrf must fail');r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/revoke`,{method:'POST',headers:auth,body:{}});assert(r.res.status===200&&r.json.data.link?.state==='revoked','revoke failed');r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'4.4.4.4'},body:{token:token4}});assert(r.res.status===410,'revoked token resolve accepted');
r=await req(`/api/v1/admin/clients/${companyId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});const token5=tokenFrom(r.json.data.completion_url);sqlite.prepare("UPDATE client_profile_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE client_id=? AND revoked_at IS NULL AND completed_at IS NULL").run(companyId);r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'5.5.5.5'},body:{token:token5}});assert(r.res.status===410,'expired token resolve accepted');r=await req(`/api/v1/admin/clients/${companyId}/profile-completion`,{headers:{Cookie:cookie}});assert(r.json.data.link?.state==='expired','admin expiry state failed');

// Individual completion never retains a tax identifier.
r=await req('/api/v1/admin/clients',{method:'POST',headers:auth,body:{client_type:'individual',display_name:'Individual Profile',default_currency:'EGP',preferred_language:'en',billing_email:'person@profile.test',tax_identifier:'SERVER-MUST-CLEAR'}});assert(r.res.status===201&&r.json.data.tax_identifier===null,'individual create tax baseline');const individualId=Number(r.json.data.id),individualCode=r.json.data.client_code;
r=await req(`/api/v1/admin/clients/${individualId}/profile-completion/generate`,{method:'POST',headers:auth,body:{}});const individualToken=tokenFrom(r.json.data.completion_url);r=await req('/api/v1/client-profile/resolve',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'6.6.6.6'},body:{token:individualToken}});assert(r.res.status===200&&r.json.data.client_type==='individual'&&r.json.data.profile.tax_identifier===null,'individual resolve tax');r=await req('/api/v1/client-profile/complete',{method:'POST',headers:{Origin:'https://nexora.test','CF-Connecting-IP':'6.6.6.6'},body:{token:individualToken,profile:{...r.json.data.profile,display_name:'Individual Updated',preferred_language:'en',tax_identifier:'MALICIOUS-TAX'}}});assert(r.res.status===200,'individual completion failed');const individual=sqlite.prepare('SELECT client_code,client_type,status,tax_identifier FROM clients WHERE id=?').get(individualId);assert(individual.client_code===individualCode&&individual.client_type==='individual'&&individual.status==='active'&&individual.tax_identifier===null,'individual completion authority violation');

const actions=sqlite.prepare("SELECT action FROM audit_logs WHERE action LIKE 'client_profile%' ORDER BY id").all().map(x=>x.action);for(const action of ['client_profile_link.generate','client_profile_link.revoke','client_profile.complete'])assert(actions.includes(action),'missing audit '+action);
const auditJson=sqlite.prepare("SELECT context_json FROM audit_logs WHERE action LIKE 'client_profile%' AND context_json IS NOT NULL").all().map(x=>x.context_json).join('\n');for(const secret of [token1,token2,token3,token4,token5,individualToken])assert(!auditJson.includes(secret),'raw token leaked to audit');
assert(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'foreign key check failed');
console.log('NX_OPS_1_1B_WORKER_INTEGRATION_PASS');
console.log(JSON.stringify({company_id:companyId,company_code:companyCode,individual_id:individualId,individual_code:individualCode,profile_tokens:Number(sqlite.prepare('SELECT COUNT(*) n FROM client_profile_tokens').get().n),profile_audit_actions:actions.length},null,2));
