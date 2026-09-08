// engine/verify/verify-oracles.ts — the oracle over the oracles.
//
// Every verify file in this repo asserts something about the code. Nothing
// asserted anything about the verify files. This one does: it breaks the
// subject on purpose and requires the oracle to notice.
//
// O1  every registered oracle passes on unmodified source        (the baseline)
// O2  TIER 1 — every curated mutation is CAUGHT                  (the gate)
// O3  the harness can itself fail                                (NEGATIVE CONTROL)
// O4  TIER 2 — generated mutants, scored and reported, never gating
//
// O3 deserves saying plainly. This file is an oracle, so it is subject to its
// own rule, and the way it would silently pass is by never actually running the
// subject — a broken spawn, a wrong path, a swallowed exit code would all make
// every mutant look "caught". So O3 plants a mutation that MUST survive: it
// perturbs a constant no oracle looks at, and fails the build if the harness
// claims to have caught it. A harness that catches everything is broken in
// exactly the same way as one that catches nothing.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyMutation, candidates, sample, type Mutation } from './mutate.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const abs = (relative: string): string => `${ROOT}${relative}`;

/**
 * A curated mutation: a specific edit with a stated behavioural consequence.
 *
 * `why` is not documentation. It is the argument that this mutant is NOT
 * equivalent — the reason a human can assert the program's behaviour genuinely
 * changes. Tier 1 gates the build, so every entry has to carry that argument or
 * the gate is resting on an assumption again.
 */
interface Curated {
  readonly oracle: string;
  readonly subject: string;
  readonly find: string;
  readonly replace: string;
  readonly why: string;
}

const CURATED: readonly Curated[] = [
  {
    oracle: 'engine/verify/verify-ruleset.ts',
    subject: 'lattice/ruleset.ts',
    find: "parts.push(`${relative}:${semantic.length}:${files[relative]}`);",
    replace: 'parts.push(`${relative}`);',
    why: 'the rules hash stops depending on file CONTENT, so a loaded die no longer moves it',
  },
  {
    oracle: 'engine/verify/verify-lattice.ts',
    subject: 'lattice/round.ts',
    find: 'export const FACE_WEIGHTS: readonly number[] = [0, 4, 4, 4, 4, 4, 4];',
    replace: 'export const FACE_WEIGHTS: readonly number[] = [0, 9, 4, 4, 4, 4, 1];',
    why: 'the die is loaded toward face 1 and away from face 6, changing the outcome distribution',
  },
  {
    oracle: 'engine/verify/verify-lattice.ts',
    subject: 'lattice/bond.ts',
    find: 'export function payoutEqualsPrincipal',
    replace: 'export function payoutEqualsPrincipal_DISABLED',
    why: 'the principal-return guarantee loses its checker entirely; if the oracle still passes it was never calling it',
  },
  {
    oracle: 'engine/verify/verify-theme.ts',
    subject: 'web/theme.ts',
    find: "export const INK_DIM = '#cbd0d8';",
    replace: "export const INK_DIM = '#8b97a8';",
    why: 'restores the exact colour that scored WCAG 6.62:1 but APCA 42.8 — the pairing this oracle was written to catch',
  },
  {
    oracle: 'engine/verify/verify-theme.ts',
    subject: 'web/theme.ts',
    find: "export const CYAN = '#85e3ff';",
    replace: "export const CYAN = '#85ff9e';",
    why: 'moves the leading accent out of the measured cyan band and into the green band the corpus barely contains',
  },
  {
    oracle: 'engine/verify/verify-ruleset.ts',
    subject: 'lattice/ruleset.ts',
    find: "if (source[i] === '\\\\') { i += 2; continue; }",
    replace: "if (source[i] !== '\\\\') { i += 2; continue; }",
    why: 'inverts escape handling in the scanner, so an escaped quote ends a string early and code after it is ' +
      'misread as string content — promoted from a TIER 2 survivor, which is what that tier is for',
  },
  {
    oracle: 'engine/verify/verify-ruleset.ts',
    subject: 'lattice/ruleset.ts',
    find: 'spans.push({ start: literalStart, end: Math.min(i, n), isString: true });',
    replace: 'spans.push({ start: literalStart, end: Math.min(i, n), isString: false });',
    why: 'string literals stop being marked as strings, so whitespace inside them is collapsed and two ' +
      'programs printing different text hash identically — also a promoted TIER 2 survivor',
  },
  {
    oracle: 'engine/verify/verify-theme.ts',
    subject: 'design/corpus-manifest.json',
    find: '"images": 1129,',
    replace: '"images": 1128,',
    why: 'the corpus pin stops covering the same number of images the palette claims to be derived from, ' +
      'so the provenance chain is broken at its first link',
  },
  {
    oracle: 'engine/verify/verify-session.ts',
    subject: 'lattice/session.ts',
    find: "if (this.#phase !== 'revealed') {",
    replace: 'if (false) {',
    why: 'removes the phase gate so a host can read the hidden lattice mid-round, which ends the inference ' +
      'game and makes the mutual-information argument in P1 measure something the player can simply see',
  },
  {
    oracle: 'engine/verify/verify-session.ts',
    subject: 'lattice/round.ts',
    find: 'state.turn += 1;',
    replace: 'state.turn += 2;',
    why: 'the interactive driver and playRound would still agree with THEMSELVES but the round would run half ' +
      'its turns; catches a turn-accounting change that a single-driver test could not see',
  },
  {
    oracle: 'engine/verify/verify-app.ts',
    subject: 'web/lattice-app.ts',
    find: 'const link = revealedLinks?.[index] ?? NO_LINK;',
    replace: 'const link = session ? session.seed % 36 : NO_LINK;',
    why: 'the page paints a link marker on every cell from the moment it is dealt — the exact leak A5 exists ' +
      'to catch, and one no library-level oracle can see because it lives in the host',
  },
  {
    oracle: 'engine/verify/verify-gl2.ts',
    subject: 'web/gl2-renderer.ts',
    find: 'draw(world: Int32Array, capacity: number, camera: Gl2Camera, width: number, height: number): number {',
    replace: 'draw(world: Int32Array, capacity: number, camera: Gl2Camera, width: number, height: number): number {\n    if (true) { const g = this.gl; g.viewport(0, 0, width, height); g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT); return 0; }',
    why: 'the renderer clears the frame and draws nothing — the most likely real regression, and the one a ' +
      '"pixels came back lit" check would miss if it did not also test an empty world',
  },
  {
    // NOTE the subject is a STAGED ASSET, not a source file. verify-apk compares
    // the built APK against the staged tree, so a source mutation would not move
    // either side and the mutant would survive for a reason that says nothing
    // about the oracle. Perturbing the staged tree is what actually exercises
    // the comparison K2 performs.
    // --debug, because the RELEASE variant cannot pass without a keystore this
    // machine does not have, and an oracle that is already red proves nothing
    // about a mutant. The comparison being exercised is identical in both.
    oracle: 'engine/verify/verify-apk.ts --debug',
    subject: 'android/app/src/main/assets/index.html',
    find: '<title>GLAAS · Lattice</title>',
    replace: '<title>GLAAS · Lattice (tampered)</title>',
    why: 'the staged page no longer matches the one inside the APK, which is exactly the divergence that lets ' +
      'a tester install a build that is not the code under review',
  },
  {
    oracle: 'engine/verify/verify-coldstart.ts',
    subject: 'web/lattice.html',
    find: "if (!document.querySelector('#board .cell')) reveal('the board never appeared');",
    replace: '/* watchdog removed */;',
    why: 'a module that never executes fires no error event, so without the timeout backstop a failed load ' +
      'shows an empty board and says nothing — the blank screen a reviewer files as "does not work"',
  },
  {
    oracle: 'engine/verify/verify-devices.ts',
    subject: 'web/lattice.html',
    find: '    #app { padding-left: 6px; padding-right: 6px; }',
    replace: '    #app { padding-left: 20px; padding-right: 20px; }',
    why: 'restores a horizontal overflow on a 320px screen — the board becomes wider than the smallest phone ' +
      'still sold, which is the defect D1 was written after finding',
  },
  {
    oracle: 'engine/verify/verify-listing.ts',
    subject: 'web/lattice.html',
    find: 'Take a cell each turn.',
    replace: 'Bank a cell each turn. Server seed shown after every round.',
    why: 'restores the provably-fair vernacular an independent reviewer judged to read as simulated gambling — ' +
      'the exact copy regression P3 exists to stop',
  },
  {
    oracle: 'engine/verify/verify-fixed.ts',
    subject: 'engine/math/fixed.ts',
    find: 'export function mulFixed',
    replace: 'export function mulFixed_DISABLED',
    why: 'removes the highest-risk arithmetic in the engine; nothing that imports it can still be checked',
  },
];

/** Runs one oracle. Returns true when it PASSED (exit 0). */
function runOracle(oracle: string): { readonly passed: boolean; readonly detail: string } {
  // The entry may carry arguments (e.g. "verify-apk.ts --debug"), because some
  // oracles check a variant. Split rather than requiring one file per variant.
  const [script, ...args] = oracle.split(' ');
  try {
    execFileSync('npx', ['tsx', script!, ...args], {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 180_000,
      encoding: 'utf8',
    });
    return { passed: true, detail: 'exit 0' };
  } catch (error) {
    const e = error as { status?: number; signal?: string; stderr?: string; stdout?: string };
    if (e.signal) return { passed: false, detail: `killed by ${e.signal}` };
    return { passed: false, detail: `exit ${e.status ?? '?'}` };
  }
}

/**
 * Runs `oracle` against `subject` with `mutate` applied, then restores.
 *
 * The restore is in a `finally` and the content is held in memory, so an
 * exception or a timeout cannot leave a mutated file on disk. The caller also
 * re-reads and compares afterwards; a harness that permanently corrupts the
 * repository it is auditing would be worse than no harness.
 */
function withMutation(subject: string, mutate: (source: string) => string, body: () => boolean): boolean {
  const path = abs(subject);
  const original = readFileSync(path, 'utf8');
  try {
    writeFileSync(path, mutate(original), 'utf8');
    return body();
  } finally {
    writeFileSync(path, original, 'utf8');
    if (readFileSync(path, 'utf8') !== original) {
      throw new Error(`FATAL: failed to restore ${subject} — the working tree is dirty`);
    }
  }
}

const only = process.argv[2];
const tier2 = process.env.MUTATION_TIER2 === '1';

// ── O1: the registered oracles pass on unmodified source ───────────────────
const registered = [...new Set(CURATED.map((c) => c.oracle))].filter((o) => !only || o.includes(only));
{
  for (const oracle of registered) {
    const result = runOracle(oracle);
    ok(result.passed,
      `O1: ${oracle} does not pass on unmodified source (${result.detail}) — every mutation result below ` +
        'would be meaningless, because a mutant cannot be "caught" by an oracle that was already failing');
  }
  console.log(`  O1 baseline: ${registered.length} oracles pass on unmodified source`);
}

// ── O2: TIER 1 — every curated mutation must be caught ─────────────────────
{
  let caught = 0;
  const survivors: string[] = [];
  for (const c of CURATED.filter((c) => !only || c.oracle.includes(only))) {
    const subjectSource = readFileSync(abs(c.subject), 'utf8');
    if (!subjectSource.includes(c.find)) {
      fail(`O2 SETUP FAILED: ${c.subject} no longer contains the text this mutation targets ` +
        `(${JSON.stringify(c.find.slice(0, 60))}) — the mutation tested nothing and the gate is silently open`);
      continue;
    }
    const survived = withMutation(c.subject, (s) => s.replace(c.find, c.replace), () => runOracle(c.oracle).passed);
    if (survived) {
      survivors.push(`${c.oracle} did not notice: ${c.why}`);
    } else {
      caught += 1;
    }
  }
  for (const s of survivors) {
    fail(`O2: MUTANT SURVIVED — ${s}. The oracle passes with the property removed, so it is not evidence for it.`);
  }
  console.log(`  O2 curated: ${caught}/${CURATED.filter((c) => !only || c.oracle.includes(only)).length} behaviour-changing mutations caught`);
}

// ── O3: NEGATIVE CONTROL — the harness must be able to report a survivor ───
// If this "catches" its mutant, the harness is reporting caught for everything
// and Tier 1 above proves nothing.
{
  const oracle = 'engine/verify/verify-theme.ts';
  const survived = withMutation('lattice/round.ts',
    (s) => s.replace('export const MAX_RESHUFFLE_ATTEMPTS = 4;', 'export const MAX_RESHUFFLE_ATTEMPTS = 5;'),
    () => runOracle(oracle).passed);
  ok(survived,
    'O3 NEGATIVE CONTROL FAILED: verify-theme reported a FAILURE when an unrelated lattice constant changed. ' +
      'Either the harness fails oracles regardless of the mutation, or theme verification depends on round.ts. ' +
      'Every "caught" above is suspect until this is explained.');
  console.log('  O3 negative control: an unrelated mutation survives, so "caught" means the oracle noticed rather than the harness misfiring');
}

// ── O4: TIER 2 — generated mutants, reported and never gating ──────────────
// Off by default: it costs minutes, and its output is a search result rather
// than a verdict. MUTATION_TIER2=1 to run it.
if (tier2) {
  const SUBJECTS: readonly (readonly [string, string])[] = [
    ['engine/verify/verify-ruleset.ts', 'lattice/ruleset.ts'],
    ['engine/verify/verify-theme.ts', 'web/theme.ts'],
  ];
  const PER_FILE = Number.parseInt(process.env.MUTATION_SAMPLE ?? '8', 10);
  for (const [oracle, subject] of SUBJECTS) {
    const source = readFileSync(abs(subject), 'utf8');
    const all = candidates(source);
    const chosen = sample(all, PER_FILE, 0x5eed);
    const survivors: Mutation[] = [];
    for (const m of chosen) {
      const survived = withMutation(subject, (s) => applyMutation(s, m), () => runOracle(oracle).passed);
      if (survived) survivors.push(m);
    }
    const score = chosen.length === 0 ? 1 : (chosen.length - survivors.length) / chosen.length;
    console.log(
      `  O4 ${subject}: ${chosen.length - survivors.length}/${chosen.length} caught ` +
        `(score ${(score * 100).toFixed(0)}%, ${all.length} candidates total)`,
    );
    for (const m of survivors) {
      console.log(`     SURVIVED  ${m.operator}  ${JSON.stringify(m.original)} -> ${JSON.stringify(m.replacement)} at offset ${m.offset}`);
    }
    console.log('     (survivors are CANDIDATES, not defects: an equivalent mutant survives correctly. ' +
      'Promote a real one into CURATED with a written argument for why behaviour changed.)');
  }
} else {
  console.log('  O4 generated: skipped — set MUTATION_TIER2=1 to run the search (minutes, reports only)');
}

// ── Restore DERIVED state, not just source ─────────────────────────────────
//
// FOUND BY verify-apk IMMEDIATELY AFTER THIS HARNESS RAN. `withMutation`
// faithfully restores every source file it edits, and that is not enough:
// several oracles REBUILD the web bundle and the staged APK assets as their
// first act. A mutant that is live during such a rebuild gets compiled into
// android/app/src/main/assets and stays there after the source is put back.
//
// The tree then looks clean to git while the staged assets carry the mutation,
// and an APK built at that moment would ship it. verify-apk caught exactly
// that: index.html in the staged tree read "/* watchdog removed */" while
// web/lattice.html was intact.
//
// So the derived artifacts are regenerated here, unconditionally, as the last
// act of the run.
{
  try {
    execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
    console.log('  restored: web bundle and staged app assets rebuilt from the restored sources');
  } catch {
    fail('the derived artifacts could not be rebuilt after mutation, so the staged tree may still carry a mutant');
  }
}

if (failures.length > 0) {
  console.error(`verify-oracles: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-oracles: PASS — every curated defect is caught, and the harness can still report a survivor');
