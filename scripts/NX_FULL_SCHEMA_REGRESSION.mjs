import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const full="['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql','0009_client_project_portal_support.sql']";
const workerTests=['tests/nx-ops-1-1a/worker-integration.mjs','tests/nx-ops-1-1b/worker-integration.mjs','tests/nx-ops-2/worker-integration.mjs','tests/nx-ops-3/worker-integration.mjs'];
for(const rel of workerTests){
  const src=path.join(root,rel),dir=path.dirname(src),tmp=path.join(dir,`.nx-data4-${path.basename(rel)}`);
  let text=fs.readFileSync(src,'utf8');
  text=text.replace(/for\(const f of \[[^\]]+\]\)sqlite\.exec\(fs\.readFileSync\(path\.join\(root,'migrations',f\),'utf8'\)\);/,`for(const f of ${full})sqlite.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));`);
  if(text===fs.readFileSync(src,'utf8'))throw new Error('Could not adapt migration fixture for '+rel);
  fs.writeFileSync(tmp,text);
  try{const r=spawnSync(process.execPath,[tmp],{cwd:root,encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw new Error(`Regression failed: ${rel} (${r.status})`)}finally{try{fs.unlinkSync(tmp)}catch{}}
}
for(const rel of ['tests/nx-ops-1-1a/ui-contract.mjs','tests/nx-ops-1-1b/ui-contract.mjs','tests/nx-ops-2/ui-contract.mjs','tests/nx-ops-3/ui-contract.mjs']){const r=spawnSync(process.execPath,[path.join(root,rel)],{cwd:root,encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw new Error(`UI regression failed: ${rel}`)}
console.log('NX_FULL_SCHEMA_REGRESSION_PASS');
