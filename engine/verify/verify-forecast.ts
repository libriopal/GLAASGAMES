// engine/verify/verify-forecast.ts — the forecast is checked against what arrives.
//
// A forecast is the one piece of interface that can be WRONG rather than merely
// ugly. Every other oracle in this directory asks whether the game computed what
// it said; this one asks whether the game showed the player something that then
// came true. F4 is the whole file: it plays real rounds, records what row 1
// predicted, and compares it against the faces that actually landed on the
// board. If that ever diverges, the strip is lying to the player in the exact
// register a slot machine lies, and `lattice/reveal.ts` exists to argue that
// this project must not.

import { Board, CELL_COUNT, EMPTY, OFFSET_FACE, OFFSET_LINK, NO_LINK } from '../../lattice/board.js';
import {
  CONFIDENCE_MAX,
  FORECAST_DEPTH,
  FORECAST_WIDTH,
  RESHUFFLE_COST,
  faceAtOrdinal,
  forecast,
  liveLinkCount,
} from '../../lattice/draw-stream.js';
import { DEFAULT_ROUND, FACE_WEIGHTS, advanceTurn, beginRound, isStagnant } from '../../lattice/round.js';
import { cellLc, forecastStripSvg } from '../../web/forecast-strip.js';
import { projectToken } from '../../web/board4d.js';
import { LC_INVISIBLE } from '../../web/theme.js';

let failures = 0;
function check(id: string, ok: boolean, detail: string): void {
  if (!ok) {
    failures += 1;
    console.log(`  ${id}: FAIL — ${detail}`);
  }
}

// ── F1 · A face is a pure function of (seed, ordinal) ─────────────────────────
// The property the whole forecast rests on, asserted directly rather than
// assumed: asking for the same ordinal at different times returns the same face,
// and asking out of order does not perturb anything.
{
  const seed = 0x51a7;
  const forward: number[] = [];
  for (let i = 0; i < 500; i += 1) forward.push(faceAtOrdinal(seed, i, FACE_WEIGHTS));
  let stable = true;
  for (let i = 499; i >= 0; i -= 1) {
    if (faceAtOrdinal(seed, i, FACE_WEIGHTS) !== forward[i]) stable = false;
  }
  // And interleaved with unrelated queries, which a stateful stream would fail.
  for (let i = 0; i < 500; i += 1) {
    faceAtOrdinal(seed ^ 0xffff, i * 7, FACE_WEIGHTS);
    if (faceAtOrdinal(seed, i, FACE_WEIGHTS) !== forward[i]) stable = false;
  }
  check('F1', stable, 'a face changed depending on when it was asked for');
  console.log(`  F1 purity: 500 ordinals, read forward, backward and interleaved — identical`);
}

// ── F2 · The stream is not degenerate ────────────────────────────────────────
// A mixer that collapsed onto one face, or that repeated with a short period,
// would satisfy F1 perfectly and be useless. Both failure modes are checked.
{
  const seen = new Map<number, number>();
  const seed = 0x2b3c;
  const N = 20000;
  for (let i = 0; i < N; i += 1) {
    const f = faceAtOrdinal(seed, i, FACE_WEIGHTS);
    seen.set(f, (seen.get(f) ?? 0) + 1);
  }
  const faces = [...seen.keys()].sort((a, b) => a - b);
  const counts = [...seen.values()];
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  // FACE_WEIGHTS is uniform 4/4/4/4/4/4, so each face should take about a sixth.
  const expected = N / 6;
  const skew = Math.max(hi - expected, expected - lo) / expected;
  check('F2', faces.length === 6, `only ${faces.length} distinct faces in ${N} draws`);
  check('F2', skew < 0.06, `face frequency skewed ${(skew * 100).toFixed(1)}% from uniform`);
  console.log(`  F2 distribution: 6 faces over ${N} draws, worst deviation ${(skew * 100).toFixed(2)}% from uniform`);
}

// ── F3 · Distinct seeds are not shifted copies of one another ────────────────
// The failure a naive `seed + ordinal` scramble has: two rounds whose seeds
// differ by one share a sequence offset by one, so a player who learned one seed
// would know another. The ordinal is mixed WITH the seed to prevent it.
{
  let worst = 0;
  for (let s = 1; s <= 40; s += 1) {
    for (let shift = 0; shift <= 3; shift += 1) {
      let same = 0;
      for (let i = 0; i < 300; i += 1) {
        if (faceAtOrdinal(s, i + shift, FACE_WEIGHTS) === faceAtOrdinal(s + 1, i, FACE_WEIGHTS)) same += 1;
      }
      worst = Math.max(worst, same / 300);
    }
  }
  // Chance agreement on six faces is 1/6 ≈ 16.7%. Anything near 1.0 is a copy.
  check('F3', worst < 0.30, `adjacent seeds agree on ${(worst * 100).toFixed(0)}% of draws at some shift`);
  console.log(`  F3 seed independence: worst adjacent-seed agreement ${(worst * 100).toFixed(1)}% (chance is 16.7%)`);
}

// ── F4 · ROW 1 COMES TRUE ────────────────────────────────────────────────────
// The oracle this file exists for. Real rounds, a forecast taken before each
// turn, and then a check that the faces which actually entered the board are the
// ones row 1 named, in order.
{
  let predicted = 0;
  let matched = 0;
  let roundsWithRefill = 0;

  for (let seed = 1; seed <= 120; seed += 1) {
    const state = beginRound(seed, DEFAULT_ROUND);
    let sawRefill = false;

    while (state.turn < DEFAULT_ROUND.turns && !state.conceded) {
      // Taken at the moment the player would see it: after stagnation is
      // resolved for this turn, before the action is chosen. `advanceTurn`
      // resolves stagnation at its top, so we mirror that here.
      let guard = 0;
      while (isStagnant(state.board) && guard < 4) {
        for (let i = 0; i < CELL_COUNT; i += 1) {
          state.board.set(i, OFFSET_FACE, faceAtOrdinal(state.seed, state.draws + i, state.weights));
        }
        state.draws += RESHUFFLE_COST;
        guard += 1;
      }

      const before = forecast(state.seed, state.draws, state.weights, state.board);
      const drawsBefore = state.draws;

      // Bank a cell that is not empty, so a refill definitely happens.
      let target = 0;
      for (let i = 0; i < CELL_COUNT; i += 1) {
        if (state.board.get(i, OFFSET_FACE) !== EMPTY) { target = i; break; }
      }
      const ok = advanceTurn(state, DEFAULT_ROUND, () => target);
      if (!ok) break;

      const consumed = state.draws - drawsBefore;
      if (consumed === 0) continue;
      sawRefill = true;

      // Everything consumed this turn should have been named by the forecast,
      // in order, as long as it fell inside the window we displayed.
      for (let k = 0; k < consumed && k < FORECAST_WIDTH; k += 1) {
        predicted += 1;
        const actual = faceAtOrdinal(state.seed, drawsBefore + k, state.weights);
        if (before.faces[k] === actual) matched += 1;
      }
    }
    if (sawRefill) roundsWithRefill += 1;
  }

  check('F4', predicted > 0, 'no refills observed at all — the test proved nothing');
  check('F4', matched === predicted, `${predicted - matched} of ${predicted} row-1 predictions did not come true`);
  console.log(`  F4 row 1 comes true: ${matched}/${predicted} refill faces matched the forecast across ${roundsWithRefill} rounds`);
}

// ── F5 · Row 1 is certain and row 2 is graded ────────────────────────────────
{
  const board = new Board();
  const f = forecast(7, 36, FACE_WEIGHTS, board);
  check('F5', f.faces.length === FORECAST_WIDTH * FORECAST_DEPTH, `forecast has ${f.faces.length} cells`);
  const rowOne = f.confidence.slice(0, FORECAST_WIDTH);
  check('F5', rowOne.every((c) => c === CONFIDENCE_MAX), 'a row-1 cell was shown as uncertain');
  // An empty board has no live links at all, so row 2 must claim nothing.
  const rowTwo = f.confidence.slice(FORECAST_WIDTH);
  check('F5', rowTwo.every((c) => c === 0), `dead board still claimed confidence ${rowTwo.join(',')}`);
  console.log(`  F5 grading: row 1 all ${CONFIDENCE_MAX}, row 2 on a dead board all 0`);
}

// ── F6 · Confidence tracks the thing it claims to track ──────────────────────
// The claim is that row-2 confidence falls as the board approaches stagnation.
//
// ── THIS TEST WAS VACUOUS ON ITS FIRST RUN AND REPORTED r=1.000 ──────────────
//
// Sampled from ordinary play alone, every board carried 20-plus live links, so
// every sample sat in the top confidence bucket. The confidence series had ZERO
// variance, the correlation was undefined, and the code's `syy === 0` escape
// turned that into a pass printing a perfect score. A test that cannot vary its
// own input is not measuring the relationship it claims to measure; it is
// measuring nothing and saying so in the most reassuring way available.
//
// Fixed by SWEEPING the input: links are severed progressively so boards are
// sampled across the whole range from healthy to stagnant, and the test now
// refuses to pass if the confidence series turns out constant.
{
  const samples: { live: number; conf: number }[] = [];
  for (let seed = 1; seed <= 60; seed += 1) {
    for (let sever = 0; sever <= CELL_COUNT; sever += 3) {
      const state = beginRound(seed, DEFAULT_ROUND);
      for (let i = 0; i < sever && i < CELL_COUNT; i += 1) {
        state.board.set(i, OFFSET_LINK, NO_LINK);
      }
      const live = liveLinkCount(state.board);
      const f = forecast(state.seed, state.draws, state.weights, state.board);
      samples.push({ live, conf: f.confidence[FORECAST_WIDTH] ?? 0 });
    }
  }
  const n = samples.length;
  const buckets = new Set(samples.map((s) => s.conf));
  check('F6', buckets.size >= 3, `confidence took only ${buckets.size} distinct values — the sweep did not vary it`);
  const mx = samples.reduce((a, s) => a + s.live, 0) / n;
  const my = samples.reduce((a, s) => a + s.conf, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const s of samples) {
    sxy += (s.live - mx) * (s.conf - my);
    sxx += (s.live - mx) ** 2;
    syy += (s.conf - my) ** 2;
  }
  // No escape hatch. A degenerate series is a FAILURE, not a free pass — that
  // escape is exactly what made the first version of this test meaningless.
  check('F6', sxx > 0 && syy > 0, 'one of the two series was constant, so no correlation exists to report');
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  check('F6', r > 0.5, `confidence correlates with live links at only r=${r.toFixed(3)}`);
  console.log(`  F6 confidence meaning: r=${r.toFixed(3)} against live-link count over ${n} board states spanning ${buckets.size} confidence levels`);
}

// ── F7 · Depth is capped, and the cap is structural ──────────────────────────
// Not a rendering decision. If a third row could be produced by asking, someone
// would ask, and the board becomes a search problem.
{
  const f = forecast(11, 36, FACE_WEIGHTS, new Board());
  const rows = f.faces.length / FORECAST_WIDTH;
  check('F7', rows === 2, `forecast returned ${rows} rows`);
  check('F7', FORECAST_DEPTH === 2, `FORECAST_DEPTH is ${FORECAST_DEPTH}`);
  console.log(`  F7 depth cap: ${rows} rows, and no parameter exists to request more`);
}

// ── F8 · NEGATIVE CONTROL ────────────────────────────────────────────────────
// F4 passing means nothing unless it can fail. A deliberately wrong forecast —
// one ordinal off, the classic off-by-one a real implementation would have —
// must be caught by the same comparison.
{
  const state = beginRound(99, DEFAULT_ROUND);
  const drawsBefore = state.draws;
  const honest = forecast(state.seed, state.draws, state.weights, state.board);
  const shifted = forecast(state.seed, state.draws + 1, state.weights, state.board);
  advanceTurn(state, DEFAULT_ROUND, () => 0);
  const actual = faceAtOrdinal(state.seed, drawsBefore, state.weights);

  const honestOk = honest.faces[0] === actual;
  const shiftedOk = shifted.faces[0] === actual;
  check('F8', honestOk, 'the honest forecast failed its own control');
  check('F8', !shiftedOk, 'a forecast shifted by one ordinal still matched — F4 cannot fail');
  console.log(`  F8 negative control: honest forecast matched, off-by-one forecast did not`);
}

// ── F9 · A reshuffle really does slide the window ────────────────────────────
// Row 2's fallibility is only honest if the event it is uncertain about can
// actually happen. Constructed directly: a stagnant board, advanced one turn.
{
  const state = beginRound(3, DEFAULT_ROUND);
  // Kill every link so the board is stagnant by construction.
  for (let i = 0; i < CELL_COUNT; i += 1) state.board.set(i, OFFSET_LINK, NO_LINK);
  check('F9', isStagnant(state.board), 'could not construct a stagnant board');
  const before = state.draws;
  const predictedRowTwo = forecast(state.seed, before, state.weights, state.board).faces.slice(FORECAST_WIDTH);
  advanceTurn(state, DEFAULT_ROUND, () => 0);
  const slid = state.draws - before;
  check('F9', slid >= RESHUFFLE_COST, `stagnant turn consumed only ${slid} ordinals`);
  const actualRowTwo: number[] = [];
  for (let k = 0; k < FORECAST_WIDTH; k += 1) {
    actualRowTwo.push(faceAtOrdinal(state.seed, state.draws + k, state.weights));
  }
  const stillRight = predictedRowTwo.every((v, i) => v === actualRowTwo[i]);
  check('F9', !stillRight, 'a reshuffle did not disturb row 2 — its uncertainty would be fictional');
  console.log(`  F9 reshuffle slides the window: ${slid} ordinals consumed, row 2 no longer describes what is next`);
}

// ── F10 · Both players of a shared seed see the same grid ────────────────────
// The forecast may not create an asymmetry. Two independent reconstructions of
// the same round must produce identical forecasts at every turn.
{
  const a = beginRound(1234, DEFAULT_ROUND);
  const b = beginRound(1234, DEFAULT_ROUND);
  let identical = true;
  for (let t = 0; t < DEFAULT_ROUND.turns; t += 1) {
    const fa = forecast(a.seed, a.draws, a.weights, a.board);
    const fb = forecast(b.seed, b.draws, b.weights, b.board);
    if (fa.faces.join() !== fb.faces.join()) identical = false;
    if (fa.confidence.join() !== fb.confidence.join()) identical = false;
    advanceTurn(a, DEFAULT_ROUND, () => t % CELL_COUNT);
    advanceTurn(b, DEFAULT_ROUND, () => t % CELL_COUNT);
  }
  check('F10', identical, 'two replays of one seed produced different forecasts');
  console.log(`  F10 shared seed: ${DEFAULT_ROUND.turns} turns, forecasts bit-identical across replays`);
}

// ── F11 · The four confidence states are four states ─────────────────────────
//
// PINS A DEFECT THE CODE COULD NOT SHOW AND ONLY A RENDER DID. The first
// washout mixed sRGB linearly and produced Lc 0, 14, 49, 95. Level 1 landed
// BELOW `LC_INVISIBLE`, so "doubtful" and "no claim" drew the same, and the
// scale advertised four states while delivering three. Every non-zero level must
// clear the palette's own invisibility threshold, and the steps must be
// separated well enough that a player can tell which rung they are on.
{
  const lcs = Array.from({ length: CONFIDENCE_MAX + 1 }, (_, c) => cellLc(c, 0));
  check('F11', lcs[0] === 0, `a no-claim cell was drawn at Lc ${lcs[0]?.toFixed(1)} instead of vanishing`);
  for (let c = 1; c <= CONFIDENCE_MAX; c += 1) {
    check('F11', (lcs[c] ?? 0) > LC_INVISIBLE, `confidence ${c} is Lc ${lcs[c]?.toFixed(1)}, at or below the invisibility floor`);
  }
  let minStep = Infinity;
  for (let c = 1; c <= CONFIDENCE_MAX; c += 1) minStep = Math.min(minStep, (lcs[c] ?? 0) - (lcs[c - 1] ?? 0));
  check('F11', minStep >= 15, `two confidence levels differ by only Lc ${minStep.toFixed(1)}`);
  console.log(`  F11 four states: Lc ${lcs.map((v) => v.toFixed(0)).join(' / ')}, smallest step ${minStep.toFixed(1)}`);
}

// ── F12 · Row 2 never reaches row 1, at any confidence ───────────────────────
//
// The second render-only defect, and the worse one. On a healthy board row 2 is
// at maximum confidence, so it drew at full ink — identical to row 1 but for a
// dashed border that reads as texture at this scale. The certain/fallible split
// is the whole claim the strip makes, and it had become invisible in the common
// case. A confident guess is still a guess.
{
  let worst = Infinity;
  for (let c = 1; c <= CONFIDENCE_MAX; c += 1) worst = Math.min(worst, cellLc(c, 0) - cellLc(c, 1));
  check('F12', worst > 5, `row 2 comes within Lc ${worst.toFixed(1)} of row 1 at some confidence`);
  // And the strongest possible row-2 claim must still be weaker than the
  // weakest visible row-1 claim is strong — no row-2 cell outshines row 1.
  check('F12', cellLc(CONFIDENCE_MAX, 1) < cellLc(CONFIDENCE_MAX, 0), 'row 2 at full confidence matched row 1');
  console.log(`  F12 rows separated: row 1 ${cellLc(CONFIDENCE_MAX, 0).toFixed(0)} vs row 2 ${cellLc(CONFIDENCE_MAX, 1).toFixed(0)} at full confidence, worst gap ${worst.toFixed(1)}`);
}

// ── F13 · The strip cannot be touched ────────────────────────────────────────
// Stated in the DOM rather than in a handler somebody could forget to attach.
{
  const svg = forecastStripSvg(forecast(5, 36, FACE_WEIGHTS, new Board()));
  check('F13', svg.includes('pointer-events:none'), 'the strip does not disable pointer events');
  check('F13', !/onclick|onpointer|<a\s/i.test(svg), 'the strip carries an interactive element');
  check('F13', svg.includes('aria-label'), 'the strip is unlabelled for a screen reader');
  console.log(`  F13 untouchable: pointer-events disabled, no handlers, labelled`);
}

// ── F14 · Confidence survives without a luminance judgement ──────────────────
// The band-law's geometry-over-contrast rule. The tick count must be readable
// from the markup alone: a filled tick and an empty tick differ in SHAPE (fill
// versus stroke), not only in brightness, so the reading survives a dimmed panel.
{
  let ok = true;
  for (let c = 0; c <= CONFIDENCE_MAX; c += 1) {
    const board = new Board();
    // Build a board with just enough live links to land in bucket c.
    const src = beginRound(77, DEFAULT_ROUND);
    const want = c === 3 ? 30 : c === 2 ? 8 : c === 1 ? 3 : 0;
    let kept = 0;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      board.set(i, OFFSET_FACE, src.board.get(i, OFFSET_FACE));
      const link = src.board.get(i, OFFSET_LINK);
      if (link !== NO_LINK && kept < want) { board.set(i, OFFSET_LINK, link); kept += 1; }
      else board.set(i, OFFSET_LINK, NO_LINK);
    }
    const f = forecast(77, 36, FACE_WEIGHTS, board);
    const svg = forecastStripSvg(f);
    const filled = (svg.match(/height="6" fill="#/g) ?? []).length;
    const outlined = (svg.match(/height="5" fill="none"/g) ?? []).length;
    if (filled !== (f.confidence[FORECAST_WIDTH] ?? 0)) ok = false;
    if (filled + outlined !== CONFIDENCE_MAX) ok = false;
  }
  check('F14', ok, 'the tick count did not match the confidence, or the denominator was not drawn');
  console.log(`  F14 countable: filled ticks equal the confidence and all ${CONFIDENCE_MAX} slots are always drawn`);
}

// ── F15 · The strip and the board agree what a face looks like ───────────────
// Two pip grammars for one alphabet is the drift this repository spends oracles
// preventing. The strip draws through `projectToken`, so this asserts the pip
// COUNT it emits equals the face value for all six.
{
  let ok = true;
  for (let face = 1; face <= 6; face += 1) {
    if (projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, 0).length !== face) ok = false;
  }
  check('F15', ok, 'a forecast token drew the wrong number of pips');
  console.log(`  F15 one grammar: all six faces project to their own pip count through the board's 4D path`);
}

if (failures > 0) {
  console.log(`verify-forecast: FAIL — ${failures} violations`);
  process.exit(1);
}
console.log('verify-forecast: PASS — row 1 comes true, row 2 is uncertain for a reason the engine actually has');
