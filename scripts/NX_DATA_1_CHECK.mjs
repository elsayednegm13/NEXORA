'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fail = (message) => { throw new Error(message); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const manifestPath = path.join(here, 'NX_DATA_1_PROTECTED_BASELINE_SHA256.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let protectedCount = 0;
for (const [rel, expected] of Object.entries(manifest)) {
  const file = path.join(root, ...rel.split('/'));
  if (!fs.existsSync(file)) fail(`Protected baseline file missing: ${rel}`);
  const actual = sha256(file);
  if (actual !== expected) fail(`Protected Phase 6.2/NX-CORE-2 file changed: ${rel}`);
  protectedCount += 1;
}

const migrationsDir = path.join(root, 'migrations');
const migrations = fs.readdirSync(migrationsDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const expectedMigrations = ['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql'];
if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) {
  fail(`Unexpected migration inventory: ${migrations.join(', ')}`);
}

const sqlPath = path.join(migrationsDir, '0004_clients_core.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
for (const table of ['clients','client_contacts','inquiry_conversions']) {
  if (!new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`, 'i').test(sql)) {
    fail(`0004 missing table ${table}`);
  }
}
for (const required of [
  'public_id TEXT NOT NULL UNIQUE',
  'client_code TEXT UNIQUE',
  'default_currency TEXT NOT NULL',
  'preferred_language TEXT NOT NULL',
  'created_by_admin_id INTEGER',
  'project_inquiry_id INTEGER NOT NULL UNIQUE',
  'converted_by_admin_id INTEGER NOT NULL'
]) {
  if (!sql.includes(required)) fail(`0004 missing required contract: ${required}`);
}

const executableLines = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, '').trim())
  .filter(Boolean);
const destructive = executableLines.find((line) => /^(DROP|TRUNCATE|DELETE|UPDATE|INSERT|REPLACE|ALTER)\b/i.test(line));
if (destructive) fail(`0004 contains non-additive statement: ${destructive}`);

if (/CHECK\s*\(\s*(?:status|client_type|preferred_language)\b/i.test(sql)) {
  fail('0004 must not freeze evolving state/catalog values in DB CHECK constraints.');
}

if (!/FOREIGN KEY \(client_id\) REFERENCES clients\(id\) ON DELETE RESTRICT/i.test(sql)) {
  fail('Client contact/conversion delete-protection contract is missing.');
}
if (!/FOREIGN KEY \(project_inquiry_id\) REFERENCES project_inquiries\(id\) ON DELETE RESTRICT/i.test(sql)) {
  fail('Inquiry provenance delete-protection contract is missing.');
}

console.log('NX-DATA-1 static gate: PASS');
console.log(`Protected baseline: ${protectedCount}/${Object.keys(manifest).length} byte-identical`);
console.log('Migration inventory: 0001..0004 exact');
console.log('0004 additive-only SQL guard: PASS');
console.log('Clients Core architecture invariants: PASS');
