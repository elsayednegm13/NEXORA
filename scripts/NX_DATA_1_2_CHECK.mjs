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
const expected=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expected))fail(`migration inventory mismatch: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0006)');
const locked={
 '0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
 '0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
 '0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
 '0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533',
 '0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f'
};
let lockedOk=true;for(const [f,h] of Object.entries(locked)){if(sha(`migrations/${f}`)!==h){fail(`applied migration changed: ${f}`);lockedOk=false}}if(lockedOk)pass('applied migrations 0001..0005 byte-identical');
const m6=read('migrations/0006_clients_code_alignment.sql');
for(const forbidden of [/\bDROP\b/i,/\bTRUNCATE\b/i,/\bDELETE\b/i,/\bINSERT\b/i,/\bALTER\b/i])if(forbidden.test(m6))fail(`0006 contains forbidden operation ${forbidden}`);
if((m6.match(/UPDATE\s+clients/gi)||[]).length!==2)fail('0006 must contain exactly two UPDATE clients phases');
if(!m6.includes("client_code = 'CU-' || printf('%03d', id)"))fail('0006 does not implement CU-{id} alignment');else pass('0006 mutation scope exact: two-phase Client Code alignment only');
for(const term of ['project_inquiries','projects SET','services SET','inquiry_conversions SET','client_contacts SET'])if(m6.includes(term))fail(`0006 touches protected domain: ${term}`);

function runPython(){const attempts=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];for(const [cmd,args] of attempts){if(spawnSync(cmd,[...args,'--version'],{stdio:'ignore'}).status!==0)continue;execFileSync(cmd,[...args,abs('tests/nx-data-1-2/schema-proof.py')],{stdio:'inherit'});return}throw new Error('Python 3 not found')}
try{runPython();pass('NX-DATA-1.2 SQLite/D1-compatible proof')}catch(e){fail(`NX-DATA-1.2 schema proof: ${e.message}`)}

const clients=read('src/modules/operations/clients.js');
if(!clients.includes("client_code='CU-' || printf('%03d', id)"))fail('corrected runtime allocator missing');else pass('runtime allocator aligned to real Client id');
if(clients.includes("printf('%03d', id - 1)"))fail('superseded id-1 allocator remains in runtime');

const ui=read('tests/nx-ops-1-1a/ui-contract.mjs');
if(ui.includes("printf('%03d', id - 1)"))fail('superseded id-1 UI contract remains');
const integration=read('tests/nx-ops-1-1a/worker-integration.mjs');
for(const marker of ["function expectedCode(id){return 'CU-'+String(Number(id)).padStart(3,'0')}","client_code==='CU-999'","client_code==='CU-1000'"])if(!integration.includes(marker))fail(`corrected integration marker missing: ${marker}`);

if(process.exitCode){console.error('\nNX-DATA-1.2 CHECK: FAIL');process.exit(process.exitCode)}else console.log('\nNX-DATA-1.2 CHECK: PASS');
