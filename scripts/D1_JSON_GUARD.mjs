import fs from 'node:fs';

const [mode, filePath] = process.argv.slice(2);
if (!['count', 'fk-empty'].includes(mode) || !filePath) {
  console.error('usage: node D1_JSON_GUARD.mjs <count|fk-empty> <json-file>');
  process.exit(2);
}

const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); }
  catch (error) {
    // Wrangler --json should be JSON-only, but if a future version emits harmless
    // leading/trailing text, recover only when there is one unambiguous JSON payload.
    const starts = [text.indexOf('['), text.indexOf('{')].filter(i => i >= 0).sort((a,b)=>a-b);
    const start = starts[0];
    if (start === undefined) throw error;
    const candidate = text.slice(start);
    try { return JSON.parse(candidate); } catch { throw error; }
  }
}

function flattenTop(value) {
  const out = [];
  const visit = (v) => {
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (v && typeof v === 'object') out.push(v);
  };
  visit(value);
  return out;
}

let parsed;
try { parsed = parseJson(raw); }
catch (error) {
  console.error(`invalid D1 JSON: ${error.message}`);
  process.exit(3);
}

if (mode === 'count') {
  const candidates = [];
  for (const item of flattenTop(parsed)) {
    if (!Array.isArray(item.results)) continue;
    for (const row of item.results) {
      if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'rows_count')) {
        candidates.push(row.rows_count);
      }
    }
  }
  if (candidates.length !== 1) {
    console.error(`expected exactly one rows_count value, found ${candidates.length}`);
    process.exit(4);
  }
  const value = Number(candidates[0]);
  if (!Number.isSafeInteger(value) || value < 0) {
    console.error(`invalid rows_count value: ${String(candidates[0])}`);
    process.exit(5);
  }
  process.stdout.write(String(value));
  process.exit(0);
}

if (mode === 'fk-empty') {
  if (!raw) {
    process.stdout.write('0');
    process.exit(0);
  }
  let violations = 0;
  for (const item of flattenTop(parsed)) {
    if (Array.isArray(item.results)) violations += item.results.length;
  }
  process.stdout.write(String(violations));
  process.exit(0);
}

console.error(`unsupported mode: ${mode}`);
process.exit(6);
