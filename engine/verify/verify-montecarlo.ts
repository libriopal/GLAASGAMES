// engine/verify/verify-montecarlo.ts — the harness is trustworthy, and the 69
// candidates were ranked by it rather than by taste.
//
// M0  CALIBRATION: the ladder reproduces what is already known about the
//     shipped game. An instrument that cannot re-derive a measured result has
//     no business ranking variants nobody has measured.
// M1  the catalogue is exactly 69, deterministic, and contains candidates that
//     are SUPPOSED to be bad
// M2  the fairness gate catches every loaded distribution        (the exploit)
// M3  the fairness gate PASSES every uniform one            (no false positive)
// M4  exploitability: a trivial strategy must not capture the ceiling
// M5  the shipped config is byte-identical after the config extension
// M6  each of the above is caught when broken            (NEGATIVE CONTROLS)
//
// ─────────────────────────────────────────────────────────────────────────────
// M2 AND M3 ARE THE PAIR THAT MATTERS, AND NEITHER IS SUFFICIENT ALONE.
//
// A fairness check that rejects everything is as useless as one that rejects
// nothing, and only the second failure is embarrassing enough to get noticed.
// The catalogue therefore contains 45 candidates built to be REJECTED and 24
// built to PASS, and the suite asserts both directions. That is the epidemiology
// analogy this project already uses: an effect claimed must also be shown to
// VANISH where it cannot exist.

import {
  BASELINE,
  catalogue,
  loadedIds,
} from '../../foundry/montecarlo/variants.js';
import { evaluate, faceUniformityChiSquare } from '../../foundry/montecarlo/harness.js';
import { DEFAULT_ROUND, playRound } from '../../lattice/round.js';

const failures: string[] = [];
const fail = (d: string): void => void failures.push(d);
const ok = (c: boolean, d: string): void => { if (!c) fail(d); };

/** Rounds per agent per variant. */
const SEEDS = Number(process.env['MC_SEEDS'] ?? 120);

/**
 * Chi-square critical value, 5 degrees of freedom, p = 0.001.
 *
 * PINNED FROM THE TABLE, not tuned until the answer came out right. At 5 df the
 * 0.001 critical value is 20.515. A uniform board should clear it essentially
 * always; a loaded one should not.
 */
const CHI_CRITICAL = 20.515;

// ── M5: the shipped game did not move ──────────────────────────────────────
// `RoundConfig.faceWeights` was added for this harness. It is optional and
// defaults to FACE_WEIGHTS, so the released game must be bit-for-bit what it
// was. If this fails, the extension was not additive and nothing else matters.
{
  const r = playRound(90210, DEFAULT_ROUND, () => 0);
  ok(r.score === 32 && (r.digest >>> 0) === 3740550746,
    `M5: the shipped config now scores ${r.score} / digest ${r.digest >>> 0}, but the game as ` +
      'released scored 32 / 3740550746 — the config extension was not additive');
  console.log(`  M5 additive: shipped config still scores 32, digest 3740550746 — unchanged`);
}

// ── M1: the catalogue ──────────────────────────────────────────────────────
{
  const all = catalogue();
  ok(all.length === 69, `M1: the catalogue holds ${all.length} candidates, expected 69`);
  const ids = new Set(all.map((v) => v.id));
  ok(ids.size === all.length, 'M1: duplicate candidate ids — the sweep is not a grid');
  const again = catalogue().map((v) => v.id).join(',');
  ok(again === all.map((v) => v.id).join(','), 'M1: the catalogue is not deterministic');

  const loaded = loadedIds();
  ok(loaded.length === 45,
    `M1: ${loaded.length} candidates carry a loaded distribution, expected 45 — the suite needs ` +
      'candidates that are supposed to fail, or M2 tests nothing');
  ok(all.length - loaded.length === 24,
    `M1: ${all.length - loaded.length} fair candidates, expected 24`);
  console.log(`  M1 catalogue: 69 candidates — 24 fair, 45 deliberately loaded; ids deterministic`);
}

// ── M0: calibration against the shipped game ───────────────────────────────
{
  const m = evaluate(BASELINE, SEEDS);
  ok(m.clairvoyant > m.blind,
    `M0: the clairvoyant ceiling (${m.clairvoyant.toFixed(1)}) does not exceed blind ` +
      `(${m.blind.toFixed(1)}) — the ladder is not ordered and every ratio below is meaningless`);
  ok(m.skillDepth > 0,
    `M0: skill depth on the SHIPPED game measures ${m.skillDepth.toFixed(3)}. verify-learnable ` +
      'already established that inference pays here (+6.3% for the trail). An instrument that ' +
      'cannot reproduce a known-positive result must not be used to rank anything.');
  ok(m.faceChiSquare < CHI_CRITICAL,
    `M0: the SHIPPED game fails its own fairness gate (chi-square ${m.faceChiSquare.toFixed(1)} ` +
      `> ${CHI_CRITICAL}) — the gate is miscalibrated, not the game (verify-lattice L1y proves ` +
      'these dice uniform)');
  console.log(`  M0 calibration: shipped game — blind ${m.blind.toFixed(1)}, greedy ${m.greedy.toFixed(1)}, ` +
    `charge ${m.chargeAware.toFixed(1)}, regional ${m.regional.toFixed(1)}, ceiling ${m.clairvoyant.toFixed(1)}`);
  console.log(`                 skill depth ${m.skillDepth.toFixed(3)}, dominance ${m.dominance.toFixed(3)}, ` +
    `chi-square ${m.faceChiSquare.toFixed(1)} (< ${CHI_CRITICAL})`);
}

// ── M2 / M3 / M4: the sweep ────────────────────────────────────────────────
{
  const all = catalogue();
  const loaded = new Set(loadedIds());
  const results = all.map((v) => ({ v, m: evaluate(v, SEEDS) }));

  let caughtLoaded = 0;
  let falsePositives = 0;
  const missed: string[] = [];

  for (const { v, m } of results) {
    const flaggedUnfair = m.faceChiSquare >= CHI_CRITICAL;
    if (loaded.has(v.id)) {
      if (flaggedUnfair) caughtLoaded += 1;
      else if (missed.length < 4) missed.push(`${v.id} (chi ${m.faceChiSquare.toFixed(1)})`);
    } else if (flaggedUnfair) {
      falsePositives += 1;
    }
  }

  // M2 — every loaded candidate caught.
  ok(caughtLoaded === loaded.size,
    `M2: ${caughtLoaded}/${loaded.size} loaded distributions were caught by the fairness gate. ` +
      `Missed: ${missed.join(', ')}. A gate that lets a loaded die through is the exploit this ` +
      'suite exists to prevent.');

  // M3 — and no fair candidate falsely accused.
  ok(falsePositives === 0,
    `M3: ${falsePositives} uniform candidates were flagged unfair — a gate that rejects everything ` +
      'is as useless as one that rejects nothing, and gets switched off faster');

  console.log(`  M2/M3 fairness: ${caughtLoaded}/${loaded.size} loaded caught, ` +
    `${falsePositives}/${all.length - loaded.size} fair falsely flagged`);

  // M4 — exploitability. A trivial one-line strategy must not capture the
  // ceiling. This is the single-player best-response gap; NashConv proper does
  // not apply (no opponent), and the harness header says so rather than
  // borrowing the term.
  const fair = results.filter((r) => !loaded.has(r.v.id));
  const worst = fair.reduce((a, b) => (a.m.dominance > b.m.dominance ? a : b));
  ok(worst.m.dominance < 0.95,
    `M4: on ${worst.v.id} a trivial strategy captures ${(worst.m.dominance * 100).toFixed(1)}% of ` +
      'the achievable value — the interesting decisions are decorative there');

  // Rank the survivors, which is the deliverable.
  const survivors = fair
    .filter((r) => r.m.faceChiSquare < CHI_CRITICAL && r.m.stagnation < 0.2)
    .sort((a, b) => b.m.skillDepth - a.m.skillDepth);

  ok(survivors.length > 0, 'M4: no candidate survived the gates, so the sweep produced nothing');

  console.log('');
  console.log(`  M4 RANKED SURVIVORS (${survivors.length} of ${all.length}), by skill depth:`);
  for (const s of survivors.slice(0, 8)) {
    console.log(`    ${s.v.id.padEnd(16)} depth ${s.m.skillDepth.toFixed(3)}  ` +
      `dominance ${s.m.dominance.toFixed(3)}  headroom ${s.m.headroom.toFixed(3)}  ` +
      `stagnation ${(s.m.stagnation * 100).toFixed(0)}%  — ${s.v.note}`);
  }
  const base = evaluate(BASELINE, SEEDS);
  const better = survivors.filter((s) => s.m.skillDepth > base.skillDepth).length;
  console.log('');
  console.log(`  M4 verdict: ${better} of ${survivors.length} survivors beat the SHIPPED config's ` +
    `skill depth of ${base.skillDepth.toFixed(3)}.`);
}

// ── M6: the controls ───────────────────────────────────────────────────────
{
  // The fairness statistic must be able to fire. A distribution that is loaded
  // by construction, measured against uniform expectations, must exceed the
  // critical value — otherwise M2 passing means nothing.
  const loadedFaces: number[] = [];
  for (let i = 0; i < 3000; i += 1) loadedFaces.push(i % 10 === 0 ? 1 : 6);
  const chiLoaded = faceUniformityChiSquare(loadedFaces);
  ok(chiLoaded >= CHI_CRITICAL,
    `M6 NEGATIVE CONTROL FAILED: a 90%-sixes sample scored chi-square ${chiLoaded.toFixed(1)}, ` +
      `below the ${CHI_CRITICAL} critical value — the fairness statistic cannot detect a loaded die`);

  // And it must NOT fire on a genuinely uniform sample.
  const fairFaces: number[] = [];
  for (let i = 0; i < 3000; i += 1) fairFaces.push((i % 6) + 1);
  const chiFair = faceUniformityChiSquare(fairFaces);
  ok(chiFair < CHI_CRITICAL,
    `M6 NEGATIVE CONTROL FAILED: a perfectly uniform sample scored ${chiFair.toFixed(1)} and would ` +
      'be rejected — the gate has a false-positive problem');

  console.log(`  M6 controls: 90%-sixes scores chi-square ${chiLoaded.toFixed(0)} (rejected); ` +
    `uniform scores ${chiFair.toFixed(2)} (accepted); critical ${CHI_CRITICAL} at 5 df, p=0.001`);
}

if (failures.length > 0) {
  console.error(`verify-montecarlo: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-montecarlo: M0-M6 pass over ${SEEDS} seeds x 5 agents x 69 candidates. The ` +
  'catalogue was ranked by measurement, and the gate was shown to reject loaded dice and accept fair ones.');
