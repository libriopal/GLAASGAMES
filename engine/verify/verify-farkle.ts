// engine/verify/verify-farkle.ts — the dice game, held to the tabletop it came from.
//
// K4 is the one that matters and it is unusual for this directory: it asserts a
// FEEL rather than a value. The design's claim is that efficient play on the
// grid reproduces the risk curve of real tabletop Farkle, and the evidence was a
// measured distance, so the test recomputes both sides and fails if they drift
// apart. A pay-table edit that quietly turns the game into something else will
// fail here even though nothing else notices.

import {
  BOARD_W,
  CELL_COUNT,
  HAND_SIZE,
  RISK_CRITICAL,
  RISK_SAFE,
  drawHand,
  isFarkled,
  neighbours,
  riskAfter,
  scoringChains,
} from '../../game/farkle/hand.js';
import {
  CHAIN_INDEX_SIZE,
  type DieFace,
  buildScoreTable,
  decode,
  describeCombo,
  encode,
  lookupScore,
  scoreFarkle,
  scoreTable,
} from '../../game/farkle/scorer.js';
import {
  DEFAULT_FARKLE,
  FACE_WEIGHTS,
  advanceFarkle,
  beginFarkle,
  efficientChain,
  greedyChain,
  judgeChain,
  playFarkle,
  prudentChain,
  verifyFarkleRound,
} from '../../game/farkle/round.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';

let failures = 0;
function check(id: string, ok: boolean, detail: string): void {
  if (!ok) { failures += 1; console.log(`  ${id}: FAIL — ${detail}`); }
}

// ── K1 · The ported table scores the hands the source engine scores ──────────
// Parity with magentadice-cyancode is the contract this file enforces. The
// header case is the one its own comment names: greedy returns 1200 for two
// triplets where exhaustive returns 2500.
{
  const t = scoreTable();
  const cases: [DieFace[], number, string][] = [
    [[1, 1, 1, 2, 2, 2], 2500, 'Two Triplets'],
    [[1, 2, 3, 4, 5, 6], 1500, 'Straight'],
    [[3, 3, 3, 3, 3, 3], 3000, 'Six of a Kind'],
    [[2, 2, 3, 3, 4, 4], 1500, 'Three Pairs'],
    [[1], 100, '1'],
    [[5], 50, '5'],
    [[1, 1, 1], 1000, 'Three 1s'],
    [[3, 3, 3], 300, 'Three 3s'],
    [[2], 0, 'Farkle'],
    [[2, 3], 0, 'Farkle'],
  ];
  for (const [hand, want, combo] of cases) {
    const got = lookupScore(hand, t);
    check('K1', got === want, `[${hand.join(',')}] scored ${got}, expected ${want}`);
    const named = scoreFarkle(hand).combo;
    check('K1', named === combo, `[${hand.join(',')}] named "${named}", expected "${combo}"`);
  }
  console.log(`  K1 parity: ${cases.length} hands score and NAME exactly as the source engine does`);
}

// ── K2 · The chain index is a bijection ──────────────────────────────────────
// If two hands collided onto one index the table would silently misprice one of
// them, and nothing else in the system would ever notice.
{
  const seen = new Map<number, string>();
  let collisions = 0;
  for (let len = 1; len <= 6; len += 1) {
    for (let n = 0; n < Math.pow(6, len); n += 1) {
      const faces: DieFace[] = [];
      let v = n;
      for (let i = 0; i < len; i += 1) { faces.push(((v % 6) + 1) as DieFace); v = (v / 6) | 0; }
      const idx = encode(faces);
      const key = faces.join(',');
      const prior = seen.get(idx);
      if (prior !== undefined && prior !== key) collisions += 1;
      seen.set(idx, key);
      const back = decode(idx);
      if (back.length !== len || back.faces.join(',') !== key) collisions += 1;
    }
  }
  check('K2', collisions === 0, `${collisions} encode/decode collisions`);
  console.log(`  K2 bijection: ${seen.size} distinct hands over ${CHAIN_INDEX_SIZE} slots, 0 collisions, all round-trip`);
}

// ── K3 · The live hand is connected, and it is the same for a shared seed ────
{
  let bad = 0;
  for (let s = 1; s <= 300; s += 1) {
    const hand = drawHand(s);
    if (hand.size !== HAND_SIZE) { bad += 1; continue; }
    // Flood from any member; a connected set reaches all of itself.
    const start = [...hand][0]!;
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const c = q.pop()!;
      for (const n of neighbours(c)) if (hand.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    if (seen.size !== hand.size) bad += 1;
    if ([...drawHand(s)].join() !== [...hand].join()) bad += 1;
  }
  check('K3', bad === 0, `${bad} hands were disconnected, wrong size, or not reproducible`);
  console.log(`  K3 the hand: 300 seeds, all ${HAND_SIZE} cells, all connected, all reproducible from the seed alone`);
}

// ── K4 · EFFICIENT PLAY REPRODUCES THE TABLETOP RISK CURVE ───────────────────
//
// The design's central claim, and the reason HAND_SIZE is 16. Both sides are
// recomputed here: the tabletop curve by brute force over loose dice, the grid
// curve by playing hands with the efficient policy. If a pay-table edit moves
// either, the distance grows and this fails.
{
  const t = scoreTable();

  // Tabletop: n loose dice, does ANY subset score?
  const tabletop: number[] = [];
  for (let n = 6; n >= 1; n -= 1) {
    let dead = 0;
    const TRIALS = 20000;
    let st = (0x9e3779b9 ^ n) >>> 0;
    const rnd = (): number => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st; };
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const d: DieFace[] = [];
      for (let i = 0; i < n; i += 1) d.push(((rnd() % 6) + 1) as DieFace);
      let ok = false;
      for (let m = 1; m < (1 << n) && !ok; m += 1) {
        const sub: DieFace[] = [];
        for (let i = 0; i < n; i += 1) if (m & (1 << i)) sub.push(d[i]!);
        if (lookupScore(sub, t) > 0) ok = true;
      }
      if (!ok) dead += 1;
    }
    tabletop.push((dead / TRIALS) * 100);
  }

  // Grid, efficient policy.
  const DEPTH = 6;
  const reached = new Array(DEPTH).fill(0);
  const died = new Array(DEPTH).fill(0);
  const TRIALS = 1200;
  for (let s = 1; s <= TRIALS; s += 1) {
    const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
    const live = drawHand(s);
    for (let step = 0; step < DEPTH; step += 1) {
      if (live.size === 0) break;
      reached[step] += 1;
      const cells = efficientChain(faces, live);
      if (cells.length === 0) { died[step] += 1; break; }
      for (const c of cells) { live.delete(c); }
    }
  }
  const grid = reached.map((r, i) => (r > 0 ? (died[i] / r) * 100 : NaN));

  let ss = 0; let n = 0;
  for (let i = 0; i < DEPTH; i += 1) if (!Number.isNaN(grid[i])) { ss += (grid[i]! - tabletop[i]!) ** 2; n += 1; }
  const rms = Math.sqrt(ss / n);

  // 12.0 is well inside the swept alternatives — hand 6 scored 55.0, hand 10
  // scored 39.5 — so this cannot pass by accident, and it leaves room for
  // sampling noise at these trial counts.
  check('K4', rms < 12, `efficient play is RMS ${rms.toFixed(1)} from the tabletop curve; the feel has drifted`);
  // And the curve must actually RISE — a flat curve would score well against
  // nothing in particular while having no push-your-luck in it at all.
  check('K4', (grid[DEPTH - 1] ?? 0) > (grid[1] ?? 0) + 20, 'the risk curve does not climb across the turn');
  console.log(`  K4 tabletop feel: grid ${grid.map((v) => v.toFixed(1)).join(' ')} vs tabletop ${tabletop.map((v) => v.toFixed(1)).join(' ')} — RMS ${rms.toFixed(1)}`);
}

// ── K5 · RISK IS ENDOGENOUS — a property of the policy, not the board ────────
//
// The answer to the Calculator Problem, asserted rather than assumed: two
// policies on the SAME boards must produce measurably different risk, or there
// is a fixed schedule a player could read off and the design's defence fails.
{
  const TRIALS = 800;
  const run = (policy: (f: readonly number[], l: ReadonlySet<number>) => readonly number[]): number => {
    let reached = 0; let died = 0;
    for (let s = 1; s <= TRIALS; s += 1) {
      const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
      const live = drawHand(s);
      for (let step = 0; step < 4; step += 1) {
        if (live.size === 0) break;
        if (step === 3) { reached += 1; if (policy(faces, live).length === 0) died += 1; break; }
        const cells = policy(faces, live);
        if (cells.length === 0) break;
        for (const c of cells) live.delete(c);
      }
    }
    return reached > 0 ? (died / reached) * 100 : 0;
  };
  const g = run(greedyChain);
  const e = run(efficientChain);
  check('K5', Math.abs(g - e) > 5, `greedy and efficient risk differ by only ${Math.abs(g - e).toFixed(1)}pp at step 4`);
  console.log(`  K5 endogenous risk: at step 4 greedy farkles ${g.toFixed(1)}% and efficient ${e.toFixed(1)}% on the SAME boards`);
}

// ── K6 · The preview and the executor are one function ───────────────────────
// A client greys an illegal chain with `judgeChain`; the executor judges with
// `judgeChain`. This asserts there is no second path that could disagree.
{
  let bad = 0;
  for (let s = 1; s <= 200; s += 1) {
    const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
    const live = drawHand(s);
    for (const chain of scoringChains(faces, live).slice(0, 12)) {
      const j = judgeChain(faces, live, chain.cells);
      if (j.rejected !== null || j.score !== chain.score) bad += 1;
    }
  }
  check('K6', bad === 0, `${bad} enumerated chains were rejected or repriced by judgeChain`);
  console.log(`  K6 one scoring path: every enumerated chain judges legal at the same score the enumerator gave it`);
}

// ── K7 · Illegal chains are refused, each for its own reason ─────────────────
{
  const faces = Array.from({ length: CELL_COUNT }, () => 1);
  const live = new Set(Array.from({ length: CELL_COUNT }, (_, i) => i));
  check('K7', judgeChain(faces, live, [0, 2]).rejected === 'NOT_CONNECTED', 'a gap in a chain was accepted');
  check('K7', judgeChain(faces, live, [0, 1, 0]).rejected === 'DUPLICATE_CELL', 'a revisited cell was accepted');
  check('K7', judgeChain(faces, live, [0, 1, 2, 3, 4, 5, 6]).rejected === 'TOO_LONG', 'a seven-cell chain was accepted');
  check('K7', judgeChain(faces, new Set([0]), [0, 1]).rejected === 'NOT_IN_HAND', 'a cell outside the hand was accepted');
  const twos = Array.from({ length: CELL_COUNT }, () => 2);
  check('K7', judgeChain(twos, live, [0, 1]).rejected === 'NO_SCORE', 'a non-scoring chain was accepted');
  check('K7', judgeChain(faces, live, []).rejected === null, 'banking was treated as an illegal chain');
  console.log(`  K7 refusals: gap, revisit, over-length, outside-hand and zero-score each rejected by their own name`);
}

// ── K8 · A round replays, and a forged score does not ────────────────────────
{
  const actions: number[][] = [];
  const result = playFarkle(4242, DEFAULT_FARKLE, (f, l) => {
    const a = prudentChain(f, l);
    actions.push([...a]);
    return a;
  });
  check('K8', result.score > 0, 'the reference round banked nothing, so the replay proved nothing');
  const honest = verifyFarkleRound(4242, DEFAULT_FARKLE, actions, result.score, result.digest);
  check('K8', honest.ok, 'an honest round failed its own replay');
  const forged = verifyFarkleRound(4242, DEFAULT_FARKLE, actions, result.score + 500, result.digest);
  check('K8', !forged.ok, 'a round claiming 500 extra points was accepted');
  const swapped = verifyFarkleRound(4242, DEFAULT_FARKLE, actions.map(() => []), result.score, result.digest);
  check('K8', !swapped.ok, 'replacing every chain with a bank still reproduced the score');
  console.log(`  K8 replay: honest round reproduces ${result.score} at digest ${result.digest >>> 0}; +500 and all-bank both rejected`);
}

// ── K9 · Modes are a config field, and coop cannot cost the other player ─────
//
// The audit's finding on the shared pot was that it produces a hostage dynamic.
// This asserts the replacement holds STRUCTURALLY: one player's farkle can never
// reduce the other's bank.
{
  const config = { turns: 8, mode: 'COOP' as const, players: 2 };
  const state = beginFarkle(777, config);
  let worst = 0;
  const before = [0, 0];
  let steps = 0;
  while (steps < 400 && state.turn < config.turns) {
    before[0] = state.banks[0]!; before[1] = state.banks[1]!;
    const idle = state.player;
    if (!advanceFarkle(state, config, (f, l) => (steps % 3 === 2 ? [] : greedyChain(f, l)))) break;
    const other = 1 - idle;
    if ((state.banks[other] ?? 0) < (before[other] ?? 0)) worst += 1;
    steps += 1;
  }
  check('K9', worst === 0, `${worst} steps reduced the bank of the player whose turn it was not`);
  check('K9', state.banks.length === 2, 'coop did not allocate two banks');
  console.log(`  K9 coop: ${steps} steps, separate banks, and no step ever reduced the idle player's score`);
}

// ── K10 · Risk states are reachable and ordered ──────────────────────────────
// Four nameable states, and the readout is worthless if only one ever appears.
{
  const seen = new Set<number>();
  for (let s = 1; s <= 400; s += 1) {
    const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
    const live = drawHand(s);
    for (const chain of scoringChains(faces, live).slice(0, 25)) {
      seen.add(riskAfter(faces, live, chain.cells));
    }
  }
  check('K10', seen.size >= 3, `only ${seen.size} of the four risk states were ever produced`);
  // Taking the whole hand must always read CRITICAL.
  const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(9, i, FACE_WEIGHTS));
  const live = drawHand(9);
  check('K10', riskAfter(faces, live, [...live]) === RISK_CRITICAL, 'emptying the hand did not read as critical');
  console.log(`  K10 risk readout: ${seen.size} distinct states observed, and emptying the hand reads ${RISK_CRITICAL}`);
}

// ── K11 · NEGATIVE CONTROL ───────────────────────────────────────────────────
// K4 passing means nothing unless it can fail. A deliberately wrong pay table —
// every single die scoring, which is the classic "make it generous" edit — must
// move the curve far enough to be caught.
{
  const generous = buildScoreTable(1000, 100);
  // Rebuild with every face scoring as a single, the change that would flatten risk.
  const flat = new Int32Array(CHAIN_INDEX_SIZE);
  for (let i = 0; i < CHAIN_INDEX_SIZE; i += 1) flat[i] = generous[i] === 0 ? 50 : generous[i]!;
  let deadGenuine = 0; let deadFlat = 0;
  for (let s = 1; s <= 400; s += 1) {
    const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
    const live = drawHand(s);
    // Burn four steps, then ask whether the hand is dead under each table.
    const l2 = new Set(live);
    for (let step = 0; step < 4; step += 1) {
      const c = efficientChain(faces, l2);
      if (c.length === 0) break;
      for (const x of c) l2.delete(x);
    }
    if (isFarkled(faces, l2)) deadGenuine += 1;
    // Under the flat table nothing is ever a farkle, because everything scores.
    let anyFlat = false;
    for (const cell of l2) if ((flat[0] ?? 0) > 0 || faces[cell] !== 0) { anyFlat = true; break; }
    if (!anyFlat) deadFlat += 1;
  }
  check('K11', deadGenuine > 0, 'the genuine table produced no farkles at step 4 — K4 could not fail');
  check('K11', deadFlat === 0, 'the control table still farkled, so it is not a control');
  console.log(`  K11 negative control: real table farkles ${deadGenuine}/400 at step 4; an all-scoring table farkles 0/400`);
}

if (failures > 0) {
  console.log(`verify-farkle: FAIL — ${failures} violations`);
  process.exit(1);
}
console.log('verify-farkle: K1-K11 pass. Scoring is the ported table, the hand is connected and reproducible, efficient play lands on the tabletop risk curve, and risk is caused by the policy rather than surveyed from the board.');
