// M7: the auditor's scenario, run for real.
//
// A systematically wrong parser, the artifact REGENERATED with it, and the
// pinned constants UPDATED to agree — the whole system made self-consistent
// around a wrong answer. Every check that calls `parsePrompt` now agrees with
// itself. A9 reads the corpus by a different algorithm and must object.
//
// If A9 does not catch this, A9 is decoration and should be deleted.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PARSER = `${ROOT}/corpus/alleles.ts`;
const ORACLE = `${ROOT}/engine/verify/verify-alleles.ts`;
const POOL = `${ROOT}/design/allele-pool.json`;

for (const [f, b] of [[PARSER, `${tmpdir()}/m7-parser`], [ORACLE, `${tmpdir()}/m7-oracle`], [POOL, `${tmpdir()}/m7-pool`]]) {
  copyFileSync(f, b);
}
const restore = () => {
  copyFileSync(`${tmpdir()}/m7-parser`, PARSER);
  copyFileSync(`${tmpdir()}/m7-oracle`, ORACLE);
  copyFileSync(`${tmpdir()}/m7-pool`, POOL);
};

const run = (args) => {
  try {
    return { code: 0, out: execFileSync('npx', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString() };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

// THE SYSTEMATIC ERROR, chosen because it is INVISIBLE to every check that
// goes through `parsePrompt`: the parser never splits on `|`. Each locus
// becomes arity one, holding the whole brace body as a single allele.
//
// Note what still passes. `raw.join('|')` on a one-element array is the body
// itself, so `expand` reassembles the source byte for byte and A3 is green. The
// skeletons are untouched, so A2 is green. Brace positions are unchanged, so
// the locus COUNT is unchanged and the regenerated artifact is self-consistent.
// A5, A6 and A8 all re-run the same wrong parser and all agree with it. Only
// the allele count moves — and the mutant updates that constant too.
//
// A first attempt at this mutant truncated long prompts instead, and could not
// be made self-consistent at all: `gen-alleles` refuses to emit a pool its own
// round trip rejects, so the generator's guard stopped it before the oracle saw
// it. That is a result, not a failed test — but it left A9 unexercised, which
// is why this one exists.
const parser = readFileSync(`${tmpdir()}/m7-parser`, 'utf8');
const mutated = parser.replace(
  "const raw = source.slice(open + 1, close).split('|');",
  'const raw = [source.slice(open + 1, close)];',
);
if (mutated === parser) { console.log('ANCHOR MISS'); restore(); process.exit(1); }
writeFileSync(PARSER, mutated);

// Regenerate the artifact with the broken parser — the artifact now stores the
// TRUNCATED source, so A3 round-trips and A5/A6/A8 all agree.
const gen = run(['tsx', 'scripts/gen-alleles.mjs']);
console.log(`  regenerated: ${gen.out.trim().split('\n').pop()}`);

// Update the pinned constants to whatever the broken parser produced, exactly
// as someone would when "the corpus changed".
const pool = JSON.parse(readFileSync(POOL, 'utf8'));
let oracle = readFileSync(`${tmpdir()}/m7-oracle`, 'utf8')
  .replace(/const GRAMMAR_PROMPTS = \d+;/, `const GRAMMAR_PROMPTS = ${pool.total_prompts};`)
  .replace(/const TOTAL_LOCI = \d+;/, `const TOTAL_LOCI = ${pool.total_loci};`)
  .replace(/const DISTINCT_ALLELES = \d+;/, `const DISTINCT_ALLELES = ${pool.distinct_alleles};`)
  .replace(/const PLAN_GRAMMAR_PROMPTS = \d+;/, `const PLAN_GRAMMAR_PROMPTS = ${pool.total_prompts - 5};`);
writeFileSync(ORACLE, oracle);

const verdict = run(['tsx', 'engine/verify/verify-alleles.ts']);
const lines = verdict.out.split('\n').filter((l) => /^\s{2}A\d/.test(l));
const a9 = lines.filter((l) => l.trim().startsWith('A9'));
const others = [...new Set(lines.filter((l) => !l.trim().startsWith("A9")).map((l) => l.trim().slice(0, 3)))];

console.log(`  exit ${verdict.code}; ${lines.length} failures, ${a9.length} of them A9`);
if (a9.length > 0) console.log(`  A9 says: ${a9[0].trim().slice(0, 150)}`);
if (others.length > 0) console.log(`  also caught by: ${others.join(", ")}`);

restore();

if (verdict.code === 0) { console.log('\nM7 SURVIVED — A9 is decoration'); process.exit(1); }
if (a9.length === 0) { console.log('\nM7 caught, but not by A9 — A9 has not been seen to fail'); process.exit(1); }
console.log('\nM7 CAUGHT by A9');
