'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (rel) => path.join(root, ...rel.split('/'));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8');
const sha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const fail = (message) => { console.error('FAIL', message); process.exitCode = 1; };
const pass = (message) => console.log('PASS', message);
const exists = (rel) => fs.existsSync(abs(rel));

// 1) Freeze the complete accepted NX-OPS-1 + live reconciliation + select-theme hotfix baseline.
const manifest = JSON.parse(read('scripts/NX_DATA_1_1_PROTECTED_BASELINE_SHA256.json'));
let protectedOk = true;
for (const [rel, expected] of Object.entries(manifest)) {
  if (!exists(rel)) { fail(`protected NX-OPS-1 baseline file missing: ${rel}`); protectedOk = false; continue; }
  if (sha(rel) !== expected) { fail(`protected NX-OPS-1 baseline file changed: ${rel}`); protectedOk = false; }
}
if (protectedOk) {
  pass(`NX-OPS-1 accepted baseline byte-identical (${Object.keys(manifest).length})`);
  const publicCount = Object.keys(manifest).filter((x) => x.startsWith('public/') && !x.startsWith('public/admin/')).length;
  if (publicCount !== 35) fail(`unexpected public non-admin baseline inventory: ${publicCount}`);
  else pass('public website byte-identical (35 files)');
}

// 2) Migration inventory and immutable live chain through 0004.
const migrations = fs.readdirSync(abs('migrations')).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort();
const expectedMigrations = ['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql'];
if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) fail(`migration inventory mismatch: ${migrations.join(', ')}`);
else pass('migration inventory exact (0001..0005)');
const priorHashes = {
  '0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
  '0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
  '0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
  '0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533'
};
for (const [file, expected] of Object.entries(priorHashes)) if (sha(`migrations/${file}`) !== expected) fail(`prior migration hash changed: ${file}`);
if (!process.exitCode) pass('live migrations 0001..0004 bytes retained');

// 3) 0005 is tightly scoped: token storage + deterministic Client Code normalization only.
const sql = read('migrations/0005_clients_hardening.sql');
if (!/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+client_profile_tokens\b/i.test(sql)) fail('0005 missing client_profile_tokens');
for (const forbidden of ['client_projects','project_tasks','project_milestones','service_tickets','ticket_messages','quotes','quote_items','invoices','invoice_items','portal_access_grants','file_assets']) {
  if (new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${forbidden}\\b`, 'i').test(sql)) fail(`future table introduced early: ${forbidden}`);
}
for (const forbidden of [/\bDROP\b/i,/\bTRUNCATE\b/i,/\bDELETE\s+FROM\b/i,/\bALTER\s+TABLE\b/i,/\bINSERT\s+INTO\b/i,/\bREPLACE\s+INTO\b/i]) if (forbidden.test(sql)) fail(`0005 contains forbidden SQL: ${forbidden}`);
const updates = [...sql.matchAll(/\bUPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi)].map((m) => m[1].toLowerCase());
if (updates.length !== 2 || updates.some((x) => x !== 'clients')) fail(`0005 UPDATE scope must be exactly two clients updates; got: ${updates.join(', ')}`);
else pass('0005 data mutation scope exact: two-phase clients.client_code normalization only');
for (const marker of [
  'public_id TEXT NOT NULL UNIQUE',
  'client_id INTEGER NOT NULL',
  'token_hash TEXT NOT NULL UNIQUE',
  'expires_at TEXT NOT NULL',
  'created_by_admin_id INTEGER NOT NULL',
  'FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT',
  'FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT',
  "client_code = 'CU-' || printf('%03d', id - 1)"
]) if (!sql.includes(marker)) fail(`0005 missing contract: ${marker}`);
if (/\bUPDATE\s+(projects|project_inquiries|services|admin_users|client_contacts|inquiry_conversions)\b/i.test(sql)) fail('0005 touches a protected existing domain outside clients.client_code');
else pass('protected existing domains are not mutated by 0005');

// 4) Schema-only phase: no runtime/API/Admin UI expansion yet.
const apiSource = read('src/api-router.js');
for (const forbidden of ['/api/v1/client-profile/resolve','/api/v1/client-profile/complete','/api/v1/admin/clients/:id/profile-link','/api/v1/admin/client-projects']) {
  if (apiSource.includes(forbidden)) fail(`runtime route introduced early in data-only gate: ${forbidden}`);
}
if (!process.exitCode) pass('no NX-OPS-1.1 runtime/API exposure introduced early');

// 5) D1-compatible relational/data proof.
function runPythonProof() {
  const attempts = process.platform === 'win32' ? [['python', []], ['py', ['-3']]] : [['python3', []], ['python', []]];
  for (const [cmd, args] of attempts) {
    const probe = spawnSync(cmd, [...args, '--version'], { stdio: 'ignore' });
    if (probe.status !== 0) continue;
    execFileSync(cmd, [...args, abs('tests/nx-data-1-1/schema-proof.py')], { stdio: 'inherit' });
    return;
  }
  throw new Error('Python 3 was not found for the D1-compatible schema proof.');
}
try { runPythonProof(); pass('NX-DATA-1.1 SQLite/D1-compatible proof'); } catch (err) { fail(`NX-DATA-1.1 schema proof: ${err.message}`); }

// 6) Runtime remains exactly NX-OPS-1 because this gate changes schema/migration only.
const env = { ...process.env, NODE_NO_WARNINGS: '1' };
try { execFileSync(process.execPath, [abs('tests/nx-core-2/worker-parity.mjs')], { stdio: 'inherit', env }); pass('public/unauthenticated Worker parity 21/21'); } catch { fail('public/unauthenticated Worker parity'); }
try { execFileSync(process.execPath, [abs('tests/nx-ops-1/existing-admin-compat.mjs')], { stdio: 'inherit', env }); pass('existing authenticated Admin compatibility 10/10'); } catch { fail('existing authenticated Admin compatibility'); }
try { execFileSync(process.execPath, [abs('tests/nx-ops-1/worker-integration.mjs')], { stdio: 'inherit', env }); pass('NX-OPS-1 Clients + Inquiry conversion integration'); } catch { fail('NX-OPS-1 Clients + Inquiry conversion integration'); }

if (process.exitCode) {
  console.error('\nNX-DATA-1.1 CHECK: FAIL');
  process.exit(process.exitCode);
} else {
  console.log('\nNX-DATA-1.1 CHECK: PASS');
}
