'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const abs=rel=>path.join(root,...rel.split('/'));
const read=rel=>fs.readFileSync(abs(rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1};
const pass=msg=>console.log('PASS',msg);

const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expected=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expected))fail(`migration inventory mismatch: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0008)');

const baseline=JSON.parse(read('scripts/NX_OPS_3_PROTECTED_BASELINE_SHA256.json'));
let oldMigrationsOk=true;
for(const file of expected.slice(0,7)){
  const rel=`migrations/${file}`;
  if(!baseline[rel]){fail(`protected baseline missing migration hash: ${file}`);oldMigrationsOk=false;continue;}
  if(sha(rel)!==baseline[rel]){fail(`applied migration changed: ${file}`);oldMigrationsOk=false;}
}
if(oldMigrationsOk)pass('applied migrations 0001..0007 byte-identical');

const sql=read('migrations/0008_client_project_execution.sql');
const requiredTables=['client_project_milestones','client_project_tasks','client_project_task_assignees'];
for(const table of requiredTables)if(!new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`,'i').test(sql))fail(`0008 missing table: ${table}`);
const executable=sql.split(/\r?\n/).map(line=>line.replace(/--.*$/,'').trim()).filter(Boolean);
const nonAdditive=executable.find(line=>/^(DROP|TRUNCATE|DELETE|UPDATE|INSERT|REPLACE|ALTER)\b/i.test(line));
if(nonAdditive)fail(`0008 contains non-additive statement: ${nonAdditive}`);else pass('0008 additive-only SQL guard');
for(const forbidden of ['projects','service_tickets','ticket_messages','quotes','quote_items','invoices','invoice_items','payments','portal_access_grants','client_portal_sessions','file_assets','private_files','time_entries']){
  if(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${forbidden}\\b`,'i').test(sql))fail(`out-of-scope table introduced: ${forbidden}`);
}
if(/\bALTER\s+TABLE\s+(?:projects|client_projects)\b/i.test(sql)||/\bUPDATE\s+(?:projects|client_projects)\b/i.test(sql))fail('0008 mutates an accepted project table');else pass('Portfolio and Client Project base schemas remain untouched');
if(/CHECK\s*\(\s*(?:status|priority|progress_mode)\b/i.test(sql))fail('0008 freezes workflow catalogs in DB CHECK constraints');else pass('task/milestone workflow catalogs remain service-authoritative');

for(const marker of [
  'public_id TEXT NOT NULL UNIQUE',
  "status TEXT NOT NULL DEFAULT 'pending'",
  "status TEXT NOT NULL DEFAULT 'todo'",
  "priority TEXT NOT NULL DEFAULT 'normal'",
  'UNIQUE (client_project_id, id)',
  'PRIMARY KEY (client_project_task_id, admin_user_id)',
  'FOREIGN KEY (client_project_id, milestone_id) REFERENCES client_project_milestones(client_project_id, id) ON DELETE RESTRICT',
  'FOREIGN KEY (client_project_task_id, client_project_id) REFERENCES client_project_tasks(id, client_project_id) ON DELETE RESTRICT',
  'FOREIGN KEY (client_project_id, admin_user_id) REFERENCES client_project_members(client_project_id, admin_user_id) ON DELETE RESTRICT'
]) if(!sql.includes(marker))fail(`0008 schema contract missing: ${marker}`);

for(const index of [
  'idx_client_project_milestones_project_order','idx_client_project_milestones_target',
  'idx_client_project_tasks_project_status_due','idx_client_project_tasks_milestone','idx_client_project_tasks_due',
  'idx_client_project_task_assignees_admin'
]) if(!sql.includes(`CREATE INDEX IF NOT EXISTS ${index}`))fail(`0008 index missing: ${index}`);
if(!process.exitCode)pass('0008 execution tables/FKs/indexes contract present');

function runPythonProof(){
  const attempts=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
  for(const [cmd,args] of attempts){
    if(spawnSync(cmd,[...args,'--version'],{stdio:'ignore'}).status!==0)continue;
    execFileSync(cmd,[...args,abs('tests/nx-data-3/schema-proof.py')],{stdio:'inherit'});return;
  }
  throw new Error('Python 3 was not found for the D1-compatible schema proof.');
}
try{runPythonProof();pass('NX-DATA-3 SQLite/D1-compatible schema proof');}catch(err){fail(`NX-DATA-3 schema proof: ${err.message}`);}

if(process.exitCode){console.error('\nNX-DATA-3 CHECK: FAIL');process.exit(process.exitCode);}
console.log('\nNX-DATA-3 CHECK: PASS');
