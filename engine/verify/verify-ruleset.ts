// engine/verify/verify-ruleset.ts
// The round is bound to the rules it was played under, and the binding can fail.
//
// R1  the hash is computed over real source, and every outcome-bearing file is in it
// R2  a comment-only edit does NOT move the hash        (no false alarms)
// R3  a rule-constant edit DOES move the hash           (NEGATIVE CONTROL)
// R4  the seed commitment now rejects a rules mismatch, and needs a third party to
// R5  a mismatch names the file, not merely the fact
//
// R3 is the one that matters. Every other check here can be satisfied by a
// function that returns a constant string. This project's standing rule is that
// an oracle is not accepted until it has been SEEN TO FAIL on input with the
// property removed, and R3 is that observation for this file.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkReveal, commit, type Commitment, type Reveal } from '../../lattice/commit.js';
import { computeRules, RULE_SOURCES, sameRules, semanticText, type RulesDigest } from '../../lattice/ruleset.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');

/** Re-hashes the ruleset with one file's text replaced, without touching disk. */
function hashWithSubstitution(replacements: Readonly<Record<string, string>>): RulesDigest {
  const sha256 = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
  const files: Record<string, string> = {};
  const parts: string[] = [];
  for (const relative of RULE_SOURCES) {
    const raw = replacements[relative] ?? read(relative);
    const semantic = semanticText(raw);
    files[relative] = sha256(semantic);
    parts.push(`${relative}:${semantic.length}:${files[relative]}`);
  }
  return { hash: sha256(parts.join('\n')), files };
}

const baseline = computeRules();

// ── R1: the hash covers real source, and covers all of it ──────────────────
{
  ok(/^[0-9a-f]{64}$/.test(baseline.hash), `R1: the rules hash is not a sha256 hex digest: ${baseline.hash}`);
  ok(Object.keys(baseline.files).length === RULE_SOURCES.length,
    `R1: ${Object.keys(baseline.files).length} file hashes for ${RULE_SOURCES.length} listed sources`);

  // Determinism: computing it twice on an unchanged tree must agree, or the
  // whole comparison is noise.
  ok(computeRules().hash === baseline.hash, 'R1: two computations of the same tree disagreed');

  // The list must not have drifted behind round.ts. Anything round.ts imports
  // by relative path decides outcomes, so it belongs in RULE_SOURCES; a file
  // that influences the game but is unlisted is exactly how this mechanism
  // fails silently.
  const roundSource = read('lattice/round.ts');
  const imported = [...roundSource.matchAll(/from '(\.\.?\/[^']+)'/g)].map((m) => m[1]!);
  for (const spec of imported) {
    const resolved = spec.startsWith('../')
      ? spec.replace(/^\.\.\//, '').replace(/\.js$/, '.ts')
      : `lattice/${spec.replace(/^\.\//, '').replace(/\.js$/, '.ts')}`;
    ok(RULE_SOURCES.includes(resolved),
      `R1: round.ts imports ${resolved}, which can change an outcome, but it is not in RULE_SOURCES — ` +
        'the rules hash would not move if it were edited');
  }
  console.log(`  R1 coverage: ${RULE_SOURCES.length} sources, ${roundSource.length} bytes in round.ts alone, hash ${baseline.hash.slice(0, 16)}...`);
}

// ── R2: a comment-only edit must NOT move the hash ─────────────────────────
// Two builds differing only in prose play the same game. If this failed, every
// documentation commit would raise a ruleset alarm and the alarm would be
// ignored within a week — which is the failure mode `frame.ts` argues against
// for rendering, applied here.
{
  const original = read('lattice/round.ts');
  const commented =
    '// an entirely new comment block, added to prove prose is not a rule\n' +
    original.replace('/** Face weights. Read once per round; never re-read. */',
      '/* Face weights. Read once per round; never re-read.\n   Reworded, reflowed, and moved. */') +
    '\n// trailing remark\n';

  ok(commented !== original, 'R2 SETUP FAILED: the comment substitution changed nothing');
  const moved = hashWithSubstitution({ 'lattice/round.ts': commented });
  ok(moved.hash === baseline.hash,
    `R2: rewording comments changed the rules hash (${baseline.hash.slice(0, 12)} -> ${moved.hash.slice(0, 12)}) — ` +
      'documentation edits would raise false ruleset alarms');
  console.log('  R2 stability: comments reworded, added and removed; hash unchanged');
}

// ── R3: NEGATIVE CONTROL — a rule change MUST move the hash ────────────────
// The attack from ruleset.ts, executed. One die face weighted 5 instead of 4.
{
  const original = read('lattice/round.ts');
  const rigged = original.replace(
    'export const FACE_WEIGHTS: readonly number[] = [0, 4, 4, 4, 4, 4, 4];',
    'export const FACE_WEIGHTS: readonly number[] = [0, 4, 4, 4, 4, 4, 5];',
  );
  ok(rigged !== original, 'R3 SETUP FAILED: FACE_WEIGHTS was not found to rig — the control tested nothing');

  const riggedDigest = hashWithSubstitution({ 'lattice/round.ts': rigged });
  ok(riggedDigest.hash !== baseline.hash,
    'R3 NEGATIVE CONTROL FAILED: loading one die face did not change the rules hash — the binding is ' +
      'decorative and every other check in this file is vacuous');

  // A subtler one: the deadlock reshuffle budget, which changes the outcome
  // distribution without changing a single visible number in the UI.
  const reshuffled = original.replace('export const MAX_RESHUFFLE_ATTEMPTS = 4;',
    'export const MAX_RESHUFFLE_ATTEMPTS = 6;');
  ok(reshuffled !== original, 'R3 SETUP FAILED: MAX_RESHUFFLE_ATTEMPTS was not found');
  ok(hashWithSubstitution({ 'lattice/round.ts': reshuffled }).hash !== baseline.hash,
    'R3 NEGATIVE CONTROL FAILED: changing the reshuffle budget did not change the rules hash');

  // And one in a DIFFERENT file, so the control is not passing on round.ts alone.
  // NOTE the setup guard compares SEMANTIC text, not raw text. The first draft
  // of this check perturbed the first digit in the file, which happened to sit
  // inside a comment; the raw text changed, the guard passed, and the control
  // silently tested nothing. The hash was right to ignore it — the guard was
  // asking the wrong question.
  const gen = read('lattice/lattice-gen.ts');
  const tweaked = gen.replace('const REGION = 3;', 'const REGION = 2;');
  ok(semanticText(tweaked) !== semanticText(gen),
    'R3 SETUP FAILED: the lattice-gen.ts perturbation did not change any executable text');
  ok(hashWithSubstitution({ 'lattice/lattice-gen.ts': tweaked }).hash !== baseline.hash,
    'R3 NEGATIVE CONTROL FAILED: a constant changed in lattice-gen.ts did not move the hash');

  console.log('  R3 negative control: 3 rule edits (loaded die, reshuffle budget, generator constant) each moved the hash');
}

// ── R4: the commitment rejects a rules mismatch, and needs a third value ───
{
  const serverSeed = 'server-seed-for-the-oracle';
  const clientSeed = 'player-chosen';

  const honest: Commitment = await commit(serverSeed, clientSeed, baseline.hash);
  const honestReveal: Reveal = { serverSeed, clientSeed, rulesHash: baseline.hash };
  ok(await checkReveal(honest, honestReveal, baseline.hash),
    'R4: an honest round with matching rules was rejected');

  // THE ATTACK. The operator is entirely honest about the seed and commits to
  // the rules it will use; the player is simply running a different build.
  // Before this file existed, this passed.
  const rigged = hashWithSubstitution({
    'lattice/round.ts': read('lattice/round.ts').replace('[0, 4, 4, 4, 4, 4, 4]', '[0, 4, 4, 4, 4, 4, 5]'),
  });
  const riggedCommit: Commitment = await commit(serverSeed, clientSeed, rigged.hash);
  const riggedReveal: Reveal = { serverSeed, clientSeed, rulesHash: rigged.hash };
  ok(!(await checkReveal(riggedCommit, riggedReveal, baseline.hash)),
    'R4: a round played under a loaded die was accepted by a verifier running the honest rules — ' +
      'this is the exact attack the file was written to stop');

  // And the seed check must still work: rules agreement must not paper over a
  // broken reveal.
  ok(!(await checkReveal(honest, { serverSeed: 'a-different-seed', clientSeed, rulesHash: baseline.hash }, baseline.hash)),
    'R4: a false server seed was accepted because the rules matched');
  ok(!(await checkReveal(honest, { serverSeed, clientSeed: 'not-mine', rulesHash: baseline.hash }, baseline.hash)),
    'R4: a substituted client seed was accepted');

  console.log('  R4 binding: honest round accepted; loaded-die round rejected against an independent verifier; seed checks intact');
}

// ── R5: a mismatch names the file ──────────────────────────────────────────
{
  const board = read('lattice/board.ts');
  const widened = board.replace('export const BOARD_W = 6;', 'export const BOARD_W = 7;');
  ok(semanticText(widened) !== semanticText(board),
    'R5 SETUP FAILED: the board.ts perturbation did not change any executable text');
  const rigged = hashWithSubstitution({ 'lattice/board.ts': widened });
  const comparison = sameRules(baseline, rigged);
  ok(!comparison.agree, 'R5: an altered board.ts compared equal');
  ok(comparison.differing.length === 1 && comparison.differing[0] === 'lattice/board.ts',
    `R5: the mismatch reported ${JSON.stringify(comparison.differing)} instead of naming lattice/board.ts alone`);
  ok(sameRules(baseline, computeRules()).agree, 'R5: an unmodified tree reported a difference');
  console.log(`  R5 attribution: mismatch reported as "${comparison.differing[0]}", not merely as disagreement`);
}

if (failures.length > 0) {
  console.error(`verify-ruleset: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-ruleset: PASS — the round is bound to its rules, and a loaded die moves the hash');
