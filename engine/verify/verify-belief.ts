// engine/verify/verify-belief.ts — the belief display cannot leak, and the
// design that ships is the one the search actually chose.
//
// B1   the belief modules CANNOT SEE THE LATTICE                (textual, like T9)
// B2   coherence separates agreement from disagreement
// B3   the wedge CANNOT, and the rejection is on the record     (negative claim)
// B4   the grammar's size is pinned and its ids are unique
// B5   the declared winner is the search's argmax at declared inputs
// B6   the winning FAMILY survives a change of seed             (robustness)
// B7   the fitness has teeth: a direction-blind encoding scores zero
// B8   a belief is a pure function of the observations it saw
// B9   the brightness ramp is uniform in measured contrast
// B10  the winner's marks stay inside the widget on every trial
// B11  no evidence and confident evidence do not render alike
// B12  the plateau escape works — the surrogate is load-bearing
// B13  the winner clears an ABSOLUTE discrimination floor, not just a relative rank

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { EMPTY_BELIEF, type Observation, observe } from '../../foundry/visual/belief.js';
import {
  ANGLE_COUNT,
  DEFAULT_PARAMS,
  FORM_COUNT,
  INTENSITY_COUNT,
  SIZE_COUNT,
  encodings,
  marksDistance,
} from '../../foundry/visual/encodings.js';
import {
  DECLARED_BEST_FAMILY,
  DECLARED_BEST_ID,
  DECLARED_BEST_PARAMS,
  DECLARED_GENERATIONS,
  DECLARED_POPULATION,
  DECLARED_SEED,
  DECLARED_TRIALS,
  DECLARED_TURNS,
  DECOY_KINDS,
  MIN_DISCRIMINATION,
  believe,
  coEvolve,
  evolveParams,
  legible,
  measure,
  scaleOf,
  scoreOne,
  trials,
} from '../../foundry/visual/evolve.js';
import { LC_INVISIBLE, LC_LARGE_UI } from '../../web/theme.js';
import { LC_TOP, rampColour, rampLc } from '../../web/lc-ramp.js';
import { apcaLc, hex, GROUND } from '../../web/theme.js';

const failures: string[] = [];
const ok = (c: boolean, d: string): void => { if (!c) failures.push(d); };

const src = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Source with comments stripped, so a discussion of a secret is not a use of it. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const stream = (dirs: readonly (readonly [number, number])[]): Observation[] => {
  // Cell 14 is interior on a 6x6 board, so every direction stays on the board.
  const from = 14;
  return dirs.map(([dx, dy], t) => ({ from, to: from + dx + dy * 6, turn: t }));
};
const rep = (dx: number, dy: number, n: number): (readonly [number, number])[] =>
  Array.from({ length: n }, () => [dx, dy] as const);

// ── B1: the belief modules cannot see the lattice ──────────────────────────
// The structural safety argument, checked rather than asserted. `belief.ts`
// claims it is safe because it never receives a board; that claim is only worth
// anything if the compiler-visible fact stays true.
{
  const banned: readonly (readonly [RegExp, string])[] = [
    [/OFFSET_LINK/, 'reads the hidden link column'],
    [/OFFSET_W/, 'reads the hidden fourth-axis column'],
    [/hiddenLinks/, 'calls the reveal-only accessor'],
    [/generateLattice/, 'generates a lattice of its own'],
    [/regionFlows/, 'reads the answer the player is trying to infer'],
  ];
  for (const rel of ['../../foundry/visual/belief.ts', '../../foundry/visual/encodings.ts']) {
    const c = code(src(rel));
    for (const [re, what] of banned) {
      ok(!re.test(c),
        `B1: ${rel} ${what}. A belief must be the player's own reconstruction from what they ` +
          'witnessed; a module that can read the answer is a leak however carefully it declines ' +
          'to draw it — the mistake web/lattice-gl.ts already made once.');
    }
  }
  ok(/OFFSET_LINK/.test('const x = OFFSET_LINK;'),
    'B1 NEGATIVE CONTROL FAILED: the scan cannot detect a planted read of the hidden column');
  // evolve.ts is the OFFLINE search and legitimately needs ground truth. It is
  // named here so the asymmetry is deliberate rather than an oversight: it never
  // ships to a client, and the encodings it produces still take only a belief.
  ok(/regionFlows/.test(code(src('../../foundry/visual/evolve.ts'))),
    'B1: evolve.ts no longer reads regionFlows. The search needs the true regional flow to build ' +
      'a decoy; without it the fitness has no ground truth and the whole ranking is vacuous.');
  console.log(`  B1 no leak: belief.ts and encodings.ts contain none of the ${banned.length} ` +
    `lattice-reading patterns; the offline search alone reads ground truth`);
}

// ── B2: coherence separates agreement from disagreement ────────────────────
{
  const parallel = believe(stream(rep(1, 0, 8)));
  const opposed = believe(stream(Array.from({ length: 8 }, (_, i) =>
    (i % 2 === 0 ? [1, 0] : [-1, 0]) as readonly [number, number])));
  const orthogonal = believe(stream(Array.from({ length: 8 }, (_, i) =>
    (i % 2 === 0 ? [1, 0] : [0, 1]) as readonly [number, number])));

  ok(parallel.coherence > orthogonal.coherence && orthogonal.coherence > opposed.coherence,
    `B2: coherence does not order agreement. parallel ${parallel.coherence.toFixed(3)}, ` +
      `orthogonal ${orthogonal.coherence.toFixed(3)}, opposed ${opposed.coherence.toFixed(3)}. ` +
      'This quantity was once a 4D cosine including the confidence and recency axes, which are ' +
      'both positive and swamped the sign of the direction: parallel and orthogonal streams then ' +
      'scored identically at 0.793. It is measured on direction alone for exactly this reason.');
  ok(opposed.coherence <= 0.01,
    `B2: a wholly opposed stream reports coherence ${opposed.coherence.toFixed(3)}, not ~0.`);
  console.log(`  B2 coherence: parallel ${parallel.coherence.toFixed(3)} > orthogonal ` +
    `${orthogonal.coherence.toFixed(3)} > opposed ${opposed.coherence.toFixed(3)}`);
}

// ── B3: the wedge cannot do it, and that refutation stays refuted ──────────
// This file shipped with the claim that bivector magnitude measures
// DISAGREEMENT. It is backwards. The check is kept as a live assertion so the
// claim cannot quietly return in a later edit.
{
  const mag = (b: { bivector: readonly number[] }): number => Math.hypot(...b.bivector);
  const alt = (a: readonly [number, number], b: readonly [number, number]) =>
    believe(stream(Array.from({ length: 5 }, (_, i) => (i % 2 === 0 ? a : b))));
  const parallel = believe(stream(rep(1, 0, 5)));
  const orthogonal = alt([1, 0], [0, 1]);
  const opposed = alt([1, 0], [-1, 0]);

  // The algebraic half, and the reason the bivector cannot be rescued by tuning:
  // wedge(v,v) and wedge(v,-v) are both zero, so neither perfect agreement nor
  // perfect opposition puts anything at all in the plane that carries direction.
  for (const [name, b] of [['parallel', parallel], ['opposed', opposed]] as const) {
    ok(Math.abs(b.bivector[0] ?? 0) < 1e-9,
      `B3: a ${name} stream has XY bivector component ${(b.bivector[0] ?? 0).toFixed(6)}, expected ` +
        'exactly zero. If this is now non-zero the observation vector changed shape, and the ' +
        'refutation recorded in belief.ts needs re-deriving rather than deleting.');
  }
  // The empirical half: what magnitude remains does not order disagreement. An
  // orthogonal pair is what a wedge is supposed to report as extreme, and it
  // lands in the middle.
  ok(mag(parallel) < mag(orthogonal) && mag(orthogonal) < mag(opposed),
    `B3: the bivector magnitudes are parallel ${mag(parallel).toFixed(4)}, orthogonal ` +
      `${mag(orthogonal).toFixed(4)}, opposed ${mag(opposed).toFixed(4)}. belief.ts records this ` +
      'exact ordering as the evidence that the quantity is a confounded proxy; a change here ' +
      'invalidates that write-up.');
  ok(mag(opposed) < mag(parallel) * 2,
    `B3: opposed/parallel bivector magnitude is now ${(mag(opposed) / mag(parallel)).toFixed(2)}x. ` +
      'The refuted claim was "nearly zero" against "large"; a factor under 2 is what makes it a ' +
      'correlation rather than a signal.');
  console.log(`  B3 wedge is a proxy, not a signal: |biv| parallel ${mag(parallel).toFixed(4)} < ` +
    `orthogonal ${mag(orthogonal).toFixed(4)} < opposed ${mag(opposed).toFixed(4)} ` +
    `(${(mag(opposed) / mag(parallel)).toFixed(2)}x), XY exactly 0 throughout`);
}

// ── B4: the grammar is enumerated, counted and pinned ──────────────────────
{
  const cs = encodings();
  const expected = FORM_COUNT * ANGLE_COUNT * SIZE_COUNT * INTENSITY_COUNT;
  ok(cs.length === expected,
    `B4: the grammar produced ${cs.length} candidates, the cross product says ${expected}. ` +
      'The space must be generated mechanically — a hand-added member is a member nobody searched ' +
      'against, which is how M10 describes trivial inflation.');
  ok(expected === 144,
    `B4: the grammar is now ${expected} candidates, not the 144 the declared result was chosen ` +
      'from. Widening the space is allowed; publishing an old winner over a new space is not.');
  ok(new Set(cs.map((c) => c.id)).size === cs.length,
    'B4: two candidates share an id, so the search cannot report which one won.');
  console.log(`  B4 grammar: ${FORM_COUNT}x${ANGLE_COUNT}x${SIZE_COUNT}x${INTENSITY_COUNT} = ` +
    `${cs.length} candidates, ids unique`);
}

const ts = trials(DECLARED_TRIALS, DECLARED_TURNS);
const ranked = coEvolve(ts, {
  seed: DECLARED_SEED,
  population: DECLARED_POPULATION,
  generations: DECLARED_GENERATIONS,
});
const winner = ranked[0]!;

// ── B5: the declared winner is the argmax, and its parameters are the evolved ones ──
{
  ok(winner.id === DECLARED_BEST_ID,
    `B5: the search's best is ${winner.id} at ${winner.fitness.toFixed(4)}, but the declared best ` +
      `is ${DECLARED_BEST_ID}. This is M10's rule applied to a picture: a declared best that has ` +
      'quietly stopped being the best fails the suite rather than sitting in a comment.');
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  ok(near(winner.params.reach, DECLARED_BEST_PARAMS.reach)
    && near(winner.params.base, DECLARED_BEST_PARAMS.base)
    && near(winner.params.gain, DECLARED_BEST_PARAMS.gain)
    && near(winner.params.floor, DECLARED_BEST_PARAMS.floor),
    `B5: the evolved parameters no longer reproduce. search ${JSON.stringify(winner.params)}, ` +
      `declared ${JSON.stringify(DECLARED_BEST_PARAMS)}. These are meant to be a deterministic ` +
      'function of the seed; if they drift, the published constants were not the ones measured.');
  console.log(`  B5 argmax: ${winner.id} at ${winner.fitness.toFixed(4)}, runner-up ` +
    `${ranked[1]!.id} at ${ranked[1]!.fitness.toFixed(4)}; parameters reproduce exactly`);
}

// ── B6: the FAMILY survives a change of search seed ────────────────────────
// The exact winner is not robust and the declaration says so: across nine sweeps
// the intensity term alternated between `weight` and `coherence` within 1-2%.
// The form, angle and size did not move at all. Asserting the exact string
// across seeds would be asserting a coin flip.
{
  const seeds = [7, 999331];
  const firsts = seeds.map((seed) =>
    coEvolve(ts, { seed, population: DECLARED_POPULATION, generations: DECLARED_GENERATIONS })[0]!.id);
  for (const id of [winner.id, ...firsts]) {
    ok(id.startsWith(DECLARED_BEST_FAMILY),
      `B6: a search seed produced winner ${id}, outside the declared family ` +
        `${DECLARED_BEST_FAMILY}*. The family is the part of this result that was measured to be ` +
        'stable; if it moves, the published design rests on one seed.');
  }
  console.log(`  B6 robustness: winners across ${seeds.length + 1} seeds are ` +
    `${[winner.id, ...firsts].join(', ')} — all in ${DECLARED_BEST_FAMILY}*`);
}

// ── B7: the fitness has teeth ──────────────────────────────────────────────
// A fitness that every encoding passes measures nothing. The adversarial case is
// a display that shows CONFIDENCE and not DIRECTION: it looks purposeful, it
// moves, it is perfectly legible, and it renders a right belief and a confidently
// wrong one identically. It must score zero on discrimination.
{
  const blind = {
    id: 'blind/const',
    encode: () => [{ x: 0.5, y: 0.5, r: 0.2, intensity: 1 }],
    encodeWith: (b: ReturnType<typeof believe>) => [
      { x: 0.5, y: 0.5, r: 0.1 + 0.1 * Math.min(1, b.weight / 10), intensity: 1 },
    ],
  };
  const raw = measure(blind, DEFAULT_PARAMS, ts);
  ok(raw.discrimination < 1e-9,
    `B7: a direction-blind encoding scored discrimination ${raw.discrimination.toFixed(6)}, not 0. ` +
      'The decoy is the same cells flowing the opposite way, so a display that ignores direction ' +
      'MUST render both identically. A non-zero score here means the measurement is picking up ' +
      'something other than the belief.');
  ok(raw.legibility > 0.9,
    `B7: the blind control scored legibility ${raw.legibility.toFixed(3)}. It is deliberately a ` +
      'big bright legible mark, so a low score means the legibility measure is broken, not that ' +
      'the control is.');
  const s = scoreOne(raw, scaleOf([...ranked, { raw }]));
  ok(s.fitness === 0,
    `B7: the blind control scored fitness ${s.fitness.toFixed(4)}. A geometric mean is used ` +
      'precisely so that a zero in one property cannot be bought back with the other three.');
  console.log(`  B7 teeth: a legible, responsive, direction-blind display scores ` +
    `discrimination ${raw.discrimination.toFixed(6)} and fitness 0`);
}

// ── B8: a belief is a pure function of what was witnessed ──────────────────
{
  const os = stream([[1, 0], [0, 1], [1, 0], [-1, 0], [0, -1], [1, 0]]);
  const a = believe(os);
  const b = believe([...os]);
  ok(JSON.stringify(a.bivector) === JSON.stringify(b.bivector)
    && a.coherence === b.coherence && a.weight === b.weight,
    'B8: two folds of the same observations disagree. A belief that is not a pure function of the ' +
      'stream cannot be re-derived by anyone checking a receipt.');
  const one = observe(EMPTY_BELIEF, os[0]!);
  ok(one.weight === 1 && one.coherence === 0 && one.observations.length === 1,
    `B8: one observation reports weight ${one.weight} coherence ${one.coherence}. A single ` +
      'observation has nothing to agree with, so its coherence must be 0 rather than a default 1 ' +
      'that would read on screen as certainty.');
  ok(Number.isFinite(a.coherence) && a.coherence >= 0 && a.coherence <= 1,
    `B8: coherence left 0..1 at ${a.coherence}.`);
  ok(a.bivector.every((v) => Number.isFinite(v)),
    'B8: the bivector contains a non-finite component, which would render as nothing at all.');
  console.log(`  B8 purity: identical streams fold identically; a lone observation reports ` +
    `coherence 0, not certainty`);
}

// ── B9: the brightness ramp is uniform in measured contrast ────────────────
// The channel every magnitude in this design rides on. A straight sRGB ramp put
// its first fifth below the disappearance floor; this one is inverted through
// APCA so equal steps in intensity are equal steps in reported contrast.
{
  ok(Math.abs(LC_TOP - 79.9) < 0.5,
    `B9: the ramp's top is |Lc| ${LC_TOP.toFixed(1)}, not the ~79.9 CYAN measures against GROUND. ` +
      'The palette moved, and every legibility number in this file was computed against the old one.');
  ok(Math.abs(rampLc(0) - LC_INVISIBLE) < 1e-9 && Math.abs(rampLc(1) - LC_TOP) < 1e-9,
    'B9: the ramp does not span exactly the disappearance floor to the brightest ink.');
  let worst = 0;
  let prev = -1;
  for (let k = 0; k <= 20; k += 1) {
    const i = k / 20;
    const got = Math.abs(apcaLc(rampColour(i), hex(GROUND)));
    worst = Math.max(worst, Math.abs(got - rampLc(i)));
    ok(got >= prev - 1e-6, `B9: the ramp is not monotone at intensity ${i.toFixed(2)}.`);
    prev = got;
  }
  ok(worst < 1.0,
    `B9: rampColour misses its target contrast by up to ${worst.toFixed(2)} Lc. The inversion is ` +
      'the whole point of implementing APCA rather than citing it; if it does not land, intensity ' +
      'is back to being uniform in sRGB and therefore not uniform in anything the player sees.');
  console.log(`  B9 ramp: spans |Lc| ${rampLc(0).toFixed(1)}-${rampLc(1).toFixed(1)}, monotone, ` +
    `worst inversion error ${worst.toFixed(3)} Lc`);
}

// ── B10: the winner's marks stay inside the widget ─────────────────────────
// The fitness once checked only that a mark's CENTRE was in bounds, and the
// search immediately drove reach and gain to their upper limits, buying
// discrimination with marks half off the widget. Containment is what makes reach
// and size compete for one finite square.
{
  const best = encodings().find((c) => c.id === DECLARED_BEST_ID)!;
  let drawn = 0;
  let clipped = 0;
  let dim = 0;
  let peak = 0;
  for (const t of ts) {
    for (const os of [t.truth, ...t.decoys]) {
      const ms = best.encodeWith(believe(os), DECLARED_BEST_PARAMS);
      for (const m of ms) {
        drawn += 1;
        if (m.x - m.r < 0 || m.x + m.r > 1 || m.y - m.r < 0 || m.y + m.r > 1) clipped += 1;
        if (!legible(m)) dim += 1;
        peak = Math.max(peak, rampLc(m.intensity));
      }
    }
  }
  ok(clipped === 0,
    `B10: ${clipped} of ${drawn} of the winner's marks fall outside the widget. A clipped mark is ` +
      'a different shape from an unclipped one and the player sees the clip.');
  ok(dim === 0,
    `B10: ${dim} of ${drawn} of the winner's marks are below the disappearance floor or under the ` +
      `${(2.5).toFixed(1)} px readable diameter.`);
  ok(peak >= LC_LARGE_UI,
    `B10: the winner's brightest state reaches only |Lc| ${peak.toFixed(1)}, under the ` +
      `${LC_LARGE_UI} floor for a UI component. A readout nobody notices is not a readout.`);
  console.log(`  B10 containment: ${drawn} marks drawn across ${ts.length} trials, 0 clipped, ` +
    `0 invisible, peak |Lc| ${peak.toFixed(1)}`);
}

// ── B11: no evidence and confident evidence do not render alike ────────────
// The state a player most needs to tell apart from every other. An empty belief
// must render, must not produce NaN, and must be visibly distinct from a settled
// one.
{
  const best = encodings().find((c) => c.id === DECLARED_BEST_ID)!;
  const empty = best.encodeWith(EMPTY_BELIEF, DECLARED_BEST_PARAMS);
  const settled = best.encodeWith(believe(stream(rep(1, 0, 8))), DECLARED_BEST_PARAMS);
  ok(empty.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.r)),
    'B11: an empty belief renders NaN. The first frame of every round is an empty belief.');
  const d = marksDistance(empty, settled);
  ok(d > 0.02,
    `B11: an empty belief and a settled one differ by only ${d.toFixed(4)}. "I know nothing yet" ` +
      'and "charge goes right" reading the same is the failure this widget exists to prevent.');

  // ── AND IT MUST NOT POINT ANYWHERE ────────────────────────────────────────
  //
  // Being merely DIFFERENT from a settled belief is not enough, and the first
  // render proved it: with no evidence at all the winner drew a tight cluster of
  // marks on the widget's rim at an arbitrary angle, because `resultant` returns
  // (0,0) and `atan2(0,0)` is 0 — a heading of exactly zero radians, rendered as
  // confidently as a real one. The fitness could not see this. Every property it
  // measures is a DIFFERENCE between two renderings, and a phantom heading is
  // perfectly self-consistent.
  //
  // So every form's displacement now scales with the size term, and zero evidence
  // collapses to the anchor. This asserts that, because a distance metric never
  // will.
  for (const m of empty) {
    ok(Math.hypot(m.x - 0.5, m.y - 0.5) < 0.02,
      `B11: with no observations a mark sits ${Math.hypot(m.x - 0.5, m.y - 0.5).toFixed(3)} from ` +
        'the widget centre. An empty belief has no direction, and a display that shows one anyway ' +
        'is inventing evidence — the single most misleading thing this widget could do.');
  }
  console.log(`  B11 empty vs settled: distance ${d.toFixed(4)}, no NaN, and all ${empty.length} ` +
    `marks of an empty belief sit on the anchor rather than pointing somewhere`);
}

// ── B12: the plateau escape is load-bearing ────────────────────────────────
// The geometric mean returns a flat zero over whole regions of parameter space,
// and a plain hill climb cannot move on it: the first co-evolution run left 96 of
// 144 structures sitting on DEFAULT_PARAMS. The lexicographic surrogate is what
// gets them off it, and this asserts it still does.
{
  const scale = scaleOf(encodings().map((c) => ({ raw: measure(c, DEFAULT_PARAMS, ts) })));
  const stuck = encodings()
    .map((c) => ({ c, raw: measure(c, DEFAULT_PARAMS, ts) }))
    .filter((e) => scoreOne(e.raw, scale).fitness === 0 && e.raw.legibility === 0);
  ok(stuck.length > 0,
    'B12: no structure starts on the zero plateau, so this check no longer exercises anything. ' +
      'That is not necessarily good news — verify the fitness still zeroes an illegible display.');
  const moved = stuck.filter((e) => {
    const ev = evolveParams(e.c, ts, scale, { seed: 4242, population: 12, generations: 8 });
    return ev.params.floor !== DEFAULT_PARAMS.floor || ev.params.reach !== DEFAULT_PARAMS.reach;
  });
  ok(moved.length > stuck.length / 2,
    `B12: only ${moved.length} of ${stuck.length} zero-fitness structures moved off the default ` +
      'parameters. Without a smooth secondary key the climb stands on a flat zero and the ranking ' +
      'reports which structures happened to start in a scoring region, not which are good.');
  console.log(`  B12 plateau: ${moved.length}/${stuck.length} zero-fitness structures escaped ` +
    `DEFAULT_PARAMS under the lexicographic surrogate`);
}

// ── B13: an absolute floor, not only a relative rank ───────────────────────
// The independent audit's objection to field-relative scoring: it "makes the
// score relative to a potentially mediocre population, masking the fact that the
// entire candidate set might be functionally useless." A ranking cannot answer
// that, so one derived absolute number does. Two renderings that differ by less
// than the smallest mark a player can resolve do not differ.
{
  const best = encodings().find((c) => c.id === DECLARED_BEST_ID)!;
  const raw = measure(best, DECLARED_BEST_PARAMS, ts);
  ok(raw.discrimination >= MIN_DISCRIMINATION,
    `B13: the winner's worst-case right-versus-wrong separation is ${raw.discrimination.toFixed(4)}, ` +
      `under the absolute floor ${MIN_DISCRIMINATION.toFixed(4)}. It may still be first in the ` +
      'field; first in a field of useless displays is useless.');
  // And the floor must be capable of failing something, or it is decoration.
  const worstInField = Math.min(...ranked.map((r) => r.raw.discrimination));
  ok(worstInField < MIN_DISCRIMINATION,
    `B13: every candidate in the grammar clears the absolute floor (worst ` +
      `${worstInField.toFixed(4)} vs floor ${MIN_DISCRIMINATION.toFixed(4)}), so the floor rejects ` +
      'nothing and tests nothing.');
  console.log(`  B13 absolute floor: winner separates wrong beliefs by ${raw.discrimination.toFixed(4)} ` +
    `against a floor of ${MIN_DISCRIMINATION.toFixed(4)}; the field's worst is ${worstInField.toFixed(4)}, ` +
    `so the floor has bite. Decoys: ${DECOY_KINDS.join(', ')} (worst case scored)`);
}

if (failures.length > 0) {
  console.error(`verify-belief: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-belief: B1-B13 pass. The display is built only from what the player witnessed, ' +
  'the encoding that ships is the one a search over 144 chose, the bivector rationale that was ' +
  'refuted stays refuted, and a handsome display that ignores direction scores zero.');
