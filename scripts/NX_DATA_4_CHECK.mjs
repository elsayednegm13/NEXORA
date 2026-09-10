'use strict';

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proof=path.join(root,'tests','nx-data-4','schema-proof.py');
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1};
const pass=msg=>console.log('PASS',msg);

function runPython(){
  const attempts=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
  const pythonEnv={...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};
  for(const [cmd,args] of attempts){
    if(spawnSync(cmd,[...args,'--version'],{stdio:'ignore',env:pythonEnv}).status!==0)continue;
    execFileSync(cmd,[...args,proof],{stdio:'inherit',env:pythonEnv});
    return;
  }
  throw new Error('Python 3 was not found for NX-DATA-4 schema proof.');
}

try{runPython();pass('NX-DATA-4 SQLite/D1-compatible schema proof');}
catch(err){fail(`NX-DATA-4 schema proof: ${err?.message||err}`);}

if(process.exitCode){console.error('\nNX-DATA-4 CHECK: FAIL');process.exit(process.exitCode);}
console.log('\nNX-DATA-4 CHECK: PASS');
