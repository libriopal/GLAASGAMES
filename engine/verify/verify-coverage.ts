// engine/verify/verify-coverage.ts — does every oracle touch its own subject?
//
// `verify-oracles` carries CURATED mutations: hand-written edits with a written
// argument for why behaviour changes. That is the strong instrument, and it is
// expensive — it covered 11 of this repo's 43 verify files, leaving 32 that had
// never been shown capable of failing at all.
//
// Hand-writing 32 more curated entries would take a long time and produce a lot
// of weak ones, because many of those oracles import only `types.ts` files with
// no behaviour to perturb. So this file does the cheaper, coarser thing to ALL
// of them, automatically, and is explicit about what that proves.
//
// WHAT THIS PROVES: for each oracle, the primary behavioural export of its
// subject is DELETED (renamed), and the oracle must fail. If it still passes,
// the oracle never exercised the thing it imports — it is checking something
// else, or nothing.
//
// WHAT THIS DOES NOT PROVE: that the oracle's assertions are strong. An oracle
// that calls a function and asserts almost nothing about the result will still
// "catch" a missing export, because the import itself explodes. This is a
// COVERAGE instrument, not an assertion-strength one. Curated mutations in
// verify-oracles remain the strong tier, and every survivor here is a candidate
// for promotion into it.
//
// Being clear about that distinction is the point. Reporting "43/43 covered"
// while measuring something weaker than the curated tier would be exactly the
// vocabulary-proxy mistake this project keeps rediscovering, one level up.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const failures: string[] = [];
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Oracles already covered by a CURATED mutation, which is the stronger tier. */
const CURATED_ALREADY = new Set(
  [...readFileSync(join(ROOT, 'engine/verify/verify-oracles.ts'), 'utf8')
    .matchAll(/oracle: '([^'\s]+)/g)].map((m) => m[1]!),
);

/**
 * Oracles this instrument cannot drive, with the reason stated rather than
 * silently skipped.
 *
 * These are not excused from the negative-control rule; they are excused from
 * THIS harness, and each says why it needs different treatment.
 */
const CANNOT_DRIVE: Readonly<Record<string, string>> = {
  'engine/verify/verify-oracles.ts':
    'it is the mutation harness itself — running it under mutation would nest the harness inside its own subject',
  'engine/verify/verify-coverage.ts': 'this file',
  'engine/verify/verify-parity.ts': 'needs a GPU adapter; covered by the gpu-parity CI workflow instead',
  'engine/verify/verify-render.ts': 'needs a WebGPU adapter; covered by scripts/verify-render.sh under Deno',
  '00_GOVERNANCE/verify-no-secrets.ts': 'scans the repository rather than importing a subject to disable',
  '00_GOVERNANCE/verify-no-prod-credentials-local.ts': 'scans the environment rather than importing a subject',
};

function listOracles(): string[] {
  const out = execFileSync('find', ['.', '-name', 'verify-*.ts', '-not', '-path', './node_modules/*'],
    { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, '')).sort();
}

interface Target { readonly subject: string; readonly name: string }

/**
 * A function the oracle IMPORTS BY NAME from a behavioural module.
 *
 * THE FIRST VERSION PICKED THE FIRST EXPORT IN THE FILE, AND THAT WAS WRONG.
 * verify-trig imports fixed.ts but never calls `toFixed`, so deleting `toFixed`
 * changed nothing it does — the oracle "survived" a mutation to code it does
 * not use, which says nothing about the oracle. That is the equivalent-mutant
 * problem, reproduced inside the instrument built to avoid it.
 *
 * So the target must be a name the oracle actually pulled in. `types.ts` and
 * type-only imports are skipped: deleting a type changes nothing at runtime.
 */
function targetFor(oracle: string): Target | null {
  const src = readFileSync(join(ROOT, oracle), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g)) {
    const spec = m[2]!;
    const abs = resolve(dirname(join(ROOT, oracle)), spec.replace(/\.js$/, '.ts'));
    const rel = relative(ROOT, abs);
    if (!existsSync(abs)) continue;
    if (rel.includes('verify-') || /(^|\/)types\.ts$/.test(rel)) continue;

    const subjectSrc = readFileSync(abs, 'utf8');
    const names = m[1]!.split(',')
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith('type '))
      .map((n) => (n.split(/\s+as\s+/)[0] ?? '').trim());
    for (const name of names) {
      if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(subjectSrc)) {
        return { subject: rel, name };
      }
    }
  }
  return null;
}

/** Renames one exported function, deleting it as far as importers can see. */
function disableExport(source: string, name: string): string {
  return source.replace(
    new RegExp(`(export\\s+(?:async\\s+)?function\\s+)${name}\\b`),
    `$1${name}_DISABLED_BY_COVERAGE`,
  );
}

function runOracle(oracle: string): boolean {
  try {
    execFileSync('npx', ['tsx', oracle], { cwd: ROOT, stdio: 'pipe', timeout: 300_000 });
    return true;
  } catch {
    return false;
  }
}

const oracles = listOracles();
const survivors: string[] = [];
const undrivable: string[] = [];
let probed = 0;
let caught = 0;

for (const oracle of oracles) {
  if (CURATED_ALREADY.has(oracle)) continue;
  if (oracle in CANNOT_DRIVE) { undrivable.push(`${oracle} — ${CANNOT_DRIVE[oracle]}`); continue; }

  const target = targetFor(oracle);
  if (target === null) {
    undrivable.push(`${oracle} — imports no named function from a behavioural module`);
    continue;
  }

  const path = join(ROOT, target.subject);
  const original = readFileSync(path, 'utf8');
  const next = disableExport(original, target.name);
  if (next === original) {
    undrivable.push(`${oracle} — could not delete ${target.subject}:${target.name}`);
    continue;
  }

  probed += 1;
  try {
    writeFileSync(path, next, 'utf8');
    if (runOracle(oracle)) {
      survivors.push(`${oracle} still PASSED with ${target.subject}:${target.name}() deleted`);
    } else {
      caught += 1;
    }
  } finally {
    writeFileSync(path, original, 'utf8');
    if (readFileSync(path, 'utf8') !== original) {
      throw new Error(`FATAL: failed to restore ${target.subject} — the working tree is dirty`);
    }
  }
}

console.log(`  coverage: ${caught}/${probed} oracles noticed their subject being deleted`);
console.log(`  curated (stronger tier): ${CURATED_ALREADY.size} oracles in verify-oracles.ts`);
for (const note of undrivable) console.log(`  not driven here: ${note}`);
for (const s of survivors) console.log(`  SURVIVOR: ${s}`);

if (survivors.length > 0) {
  console.error(`verify-coverage: FAIL — ${survivors.length} oracles pass with their subject removed`);
  for (const s of survivors) console.error(`  ${s}`);
  console.error('  Each is an oracle that does not exercise what it imports. Promote it into the curated');
  console.error('  registry with a real mutation, or fix the oracle.');
  process.exit(1);
}
if (failures.length > 0) process.exit(1);

console.log('verify-coverage: PASS — every drivable oracle fails when its subject is deleted');
