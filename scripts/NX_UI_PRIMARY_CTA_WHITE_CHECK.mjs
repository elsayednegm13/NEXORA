'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const abs=rel=>path.join(root,...rel.split('/'));
const read=rel=>fs.readFileSync(abs(rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1};
const pass=msg=>console.log('PASS',msg);

const approved=new Set(['public/css/design-system.css','public/css/client-profile.css']);
const manifest=JSON.parse(read('scripts/NX_UI_PRIMARY_CTA_WHITE_BASELINE_SHA256.json'));
let baselineOk=true,protectedCount=0;
for(const [rel,h] of Object.entries(manifest)){
  if(approved.has(rel)) continue;
  protectedCount++;
  if(!fs.existsSync(abs(rel))){fail(`baseline file missing: ${rel}`);baselineOk=false;continue;}
  if(sha(rel)!==h){fail(`unexpected baseline change: ${rel}`);baselineOk=false;}
}
if(baselineOk)pass(`baseline byte-identical outside approved CTA CSS (${protectedCount})`);

const ds=read('public/css/design-system.css');
const profile=read('public/css/client-profile.css');
const admin=read('public/admin/css/admin.css');
if(!/\.btn--primary\{color:#fff;/.test(ds))fail('public .btn--primary is not white');else pass('public primary CTA text/icon color = #fff');
if(!/\.primary-btn\{[^}]*color:#fff;/.test(profile))fail('client-profile .primary-btn is not white');else pass('client-profile primary CTA text/icon color = #fff');
if(!/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(admin))fail('Admin .primary-btn is not white');else pass('Admin primary CTA remains white');
if(/\.btn--primary\{[^}]*color:#02111d/.test(ds)||/\.primary-btn\{[^}]*color:#02111d/.test(profile))fail('legacy dark primary CTA text remains');else pass('legacy dark primary CTA text removed from approved surfaces');

const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expected=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expected))fail(`migration inventory changed: ${migrations.join(', ')}`);else pass('migration inventory unchanged (0001..0006)');

const htmlFiles=[],cssFiles=[],jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p)}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8'),ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);const dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${dup.join(',')}`);htmlOk=false}}if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'')}
let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let n=0;for(const c of s){if(c==='{')n++;else if(c==='}')n--;if(n<0)break}if(n!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false}}if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let jsOk=true;for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'})}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);jsOk=false}}if(jsOk)pass(`runtime JavaScript syntax (${jsFiles.length} files)`);

const run=(label,rel)=>{try{execFileSync(process.execPath,[abs(rel)],{stdio:'inherit'});pass(label)}catch{fail(label)}};
run('NX-DATA-1.2 schema/runtime proof','scripts/NX_DATA_1_2_CHECK.mjs');
run('public/unauthenticated Worker parity 21/21','tests/nx-core-2/worker-parity.mjs');
run('existing authenticated Admin compatibility 10/10','tests/nx-ops-1/existing-admin-compat.mjs');
run('NX-OPS-1.1A Clients hardening integration','tests/nx-ops-1-1a/worker-integration.mjs');
run('NX-OPS-1.1A UI contract','tests/nx-ops-1-1a/ui-contract.mjs');
run('NX-OPS-1.1B secure profile integration','tests/nx-ops-1-1b/worker-integration.mjs');
run('NX-OPS-1.1B UI contract','tests/nx-ops-1-1b/ui-contract.mjs');

if(process.exitCode){console.error('\nNEXORA PRIMARY CTA WHITE CHECK: FAIL');process.exit(process.exitCode)}
console.log('\nNEXORA PRIMARY CTA WHITE CHECK: PASS');
