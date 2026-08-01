/**
 * 00_GOVERNANCE/verify-no-prod-credentials-local.ts — §14 #35, §3.0 (E12).
 * "Fails when a local .env carries a `glassbox-prod` project ref."
 *
 * §3.0: glassbox-dev is what an agent (or a local Supabase MCP connection)
 * may ever point at. glassbox-prod is created at P11 and reached only
 * through CI from committed migration files — never interactively, never
 * from a developer machine's .env. This check is the machine-checkable half
 * of that rule; the other half is a process discipline no script can enforce.
 *
 * Run: npm run verify:no-prod-credentials-local   ·   Exit 0 = clean.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_MARKER = /glassbox-prod/i;

let failures = 0;
const checkNames: string[] = [];
const check = (name: string, cond: boolean, detail: string) => {
  checkNames.push(name);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!cond) failures++;
};

// fixture: the marker itself must be detectable in a planted line
// (host kept vendor-neutral so this fixture itself doesn't trip verify-no-vendor-leak)
const plantedLine = 'DATABASE_URL=postgres://user:pw@db.glassbox-prod.example.internal:5432/postgres';
check('verify-no-prod-credentials-local-scanner-catches-marker', PROD_MARKER.test(plantedLine), 'scanner recognizes a glassbox-prod project ref');

const devLine = 'DATABASE_URL=postgres://user:pw@db.glassbox-dev.example.internal:5432/postgres';
check('verify-no-prod-credentials-local-scanner-ignores-dev', !PROD_MARKER.test(devLine), 'a glassbox-dev ref does not trip the scanner');

const envPath = join(repoRoot, '.env');
let localViolation = false;
let detail = 'no local .env present — nothing to violate';
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  const offendingLines = content.split('\n').filter((l) => PROD_MARKER.test(l) && !l.trim().startsWith('#'));
  localViolation = offendingLines.length > 0;
  detail = localViolation ? `.env references glassbox-prod: ${offendingLines.join(' | ')}` : '.env present and carries no glassbox-prod reference';
}
check('verify-no-prod-credentials-local', !localViolation, detail);

console.log('');
console.log(`${checkNames.length} named checks exercised.`);
if (failures === 0) {
  console.log('verify-no-prod-credentials-local HELD.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
