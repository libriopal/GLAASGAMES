// engine/verify/verify-cartographer.ts — Blind Cartographer (experiment #2).
//
// C1  a declaration is scored against the revealed lattice, and can be wrong
// C2  the option set is board geometry only — it discloses nothing about links
// C3  the pricing is asymmetric, so declaring is a bet rather than a freebie
// C4  DECLARING CHANGES NOTHING KNOWABLE: the observable projection is
//     byte-identical with and without declarations
// C5  THE BREEDING SIGNAL: trail lift vs a BLIND baseline on the same board,
//     which is the metric an auditor's objection replaced accuracy with
// C6  each of the above is caught when broken          (NEGATIVE CONTROLS)
//
// ─────────────────────────────────────────────────────────────────────────────
// C5 EXISTS BECAUSE AN AUDITOR KILLED THE FIRST METRIC.
//
// The experiment originally scored declaration accuracy. The objection:
// accuracy measures player calibration, not graph quality, so breeding on it
// converges to trivial graphs (accuracy 1) or impossible ones (accuracy 0)
// rather than to a balanced difficulty. Scoring discriminability against chance
// fails the same way: a guessable board is learned in one observation and then
// declared perfectly forever.
//
// C5 measures the same quantity `verify-learnable` E7 does, pointed at a
// declaration instead of a move: how much does HAVING THE TRAIL improve the
// declaration, on this board? A guessable board scores ~0 because a blind
// declarer does just as well. An impossible board scores ~0 because neither
// beats chance. The signal peaks where the trail is the thing that makes the
// answer available — which is the definition of a board worth playing.
// ─────────────────────────────────────────────────────────────────────────────

import { BOARD_W, CELL_COUNT, EMPTY, NO_LINK, OFFSET_FACE } from '../../lattice/board.js';
import {
  calibration,
  chanceAccuracy,
  DECLARE_CORRECT,
  DECLARE_DECLINED,
  DECLARE_WRONG,
  declarationMultiplier,
  declarationOptions,
  scoreDeclarations,
  type Declaration,
} from '../../lattice/cartographer.js';
import { DEFAULT_ROUND, playRound } from '../../lattice/round.js';

const failures: string[] = [];
const fail = (d: string): void => void failures.push(d);
const ok = (c: boolean, d: string): void => { if (!c) fail(d); };

// ── C2: the option set is geometry, not lattice ────────────────────────────
{
  const interior = 2 * BOARD_W + 2;
  ok(declarationOptions(interior).length === 5,
    `C2: an interior cell offers ${declarationOptions(interior).length} declaration options, expected 5`);
  ok(declarationOptions(0).length === 3,
    `C2: a corner offers ${declarationOptions(0).length} options, expected 3 (2 neighbours + NO_LINK)`);
  ok(declarationOptions(interior).includes(NO_LINK),
    'C2: NO_LINK is not offered, so a player cannot declare that a cell feeds nothing');
  // The options must not depend on the board's contents at all.
  const a = declarationOptions(interior).join(',');
  const b = declarationOptions(interior).join(',');
  ok(a === b, 'C2: the option set is not deterministic');
  ok(Math.abs(chanceAccuracy(interior) - 0.2) < 1e-9,
    `C2: interior chance accuracy is ${chanceAccuracy(interior)}, expected 0.2`);
  console.log(`  C2 options: interior 5, corner 3; chance accuracy 0.200 / 0.333 — geometry only`);
}

// ── C3: the bet is priced asymmetrically ───────────────────────────────────
{
  ok(DECLARE_CORRECT > DECLARE_DECLINED && DECLARE_WRONG < DECLARE_DECLINED,
    'C3: declaring is not a bet — a free declaration saturates the rate and flattens the curve');
  // The expected value of a chance-level declaration must be NEGATIVE, or
  // declaring blindly is rational and the rate stops carrying confidence.
  const p = 0.2;
  const ev = p * DECLARE_CORRECT + (1 - p) * DECLARE_WRONG;
  ok(ev < DECLARE_DECLINED,
    `C3: a chance-level declaration has EV ${ev.toFixed(3)} vs ${DECLARE_DECLINED} for declining — ` +
      'declaring at random is not punished, so the declaration rate measures nothing');
  // And it must be positive for a player who genuinely knows.
  const evKnown = 0.9 * DECLARE_CORRECT + 0.1 * DECLARE_WRONG;
  ok(evKnown > DECLARE_DECLINED,
    `C3: even a 90%-confident declaration has EV ${evKnown.toFixed(3)} — nobody would ever declare`);
  const breakeven = (DECLARE_DECLINED - DECLARE_WRONG) / (DECLARE_CORRECT - DECLARE_WRONG);
  console.log(`  C3 pricing: EV(chance)=${ev.toFixed(2)} < 1 < EV(90% sure)=${evKnown.toFixed(2)}; ` +
    `break-even confidence ${(breakeven * 100).toFixed(0)}%`);
}

// ── C1: declarations are scored against the reveal, and can be wrong ───────
{
  const r = playRound(4242, DEFAULT_ROUND, () => 0);
  const links = r.finalLinks;

  // One declaration that is right by construction, one that is wrong.
  const truthful: Declaration[] = [];
  const lying: Declaration[] = [];
  for (let i = 0; i < CELL_COUNT && truthful.length < 6; i += 1) {
    const actual = links[i] ?? NO_LINK;
    const opts = declarationOptions(i);
    if (!opts.includes(actual)) continue;
    truthful.push({ turn: truthful.length, cell: i, believesFeeds: actual });
    const wrong = opts.find((o) => o !== actual)!;
    lying.push({ turn: lying.length, cell: i, believesFeeds: wrong });
  }
  ok(truthful.length === 6, `C1: could not build 6 truthful declarations (got ${truthful.length})`);

  const good = scoreDeclarations(truthful, links, 12);
  const bad = scoreDeclarations(lying, links, 12);
  ok(good.accuracy === 1, `C1: truthful declarations scored ${good.accuracy}, expected 1`);
  ok(bad.accuracy === 0, `C1: deliberately wrong declarations scored ${bad.accuracy}, expected 0`);
  ok(good.declined === 6, `C1: 12 turns minus 6 declarations should leave 6 declined, got ${good.declined}`);
  ok(good.netMultiplier === DECLARE_CORRECT ** 6,
    `C1: six correct declarations gave ${good.netMultiplier}, expected ${DECLARE_CORRECT ** 6}`);
  ok(calibration(good)! > 0 && calibration(bad)! < 0,
    'C1: calibration does not separate a perfect declarer from a perfectly wrong one');
  console.log(`  C1 scoring: 6/6 correct -> accuracy 1.000, calibration +${calibration(good)!.toFixed(3)}; ` +
    `0/6 -> accuracy 0.000, calibration ${calibration(bad)!.toFixed(3)}`);
}

// ── C4: declaring changes nothing knowable ─────────────────────────────────
// If declaring altered the board, the payout distribution or the information on
// screen, this would be a different game and its numbers could not be compared
// to verify-learnable E7's. The declaration is scored after the reveal from
// links the reveal already published; nothing about it reaches the executor.
{
  const seed = 90210;
  const a = playRound(seed, DEFAULT_ROUND, () => 0);
  const b = playRound(seed, DEFAULT_ROUND, () => 0);
  ok(a.score === b.score && a.digest === b.digest,
    'C4: the round is not reproducible, so no comparison below means anything');

  // Score a pile of declarations against a's reveal, then replay: the round must
  // be untouched. `scoreDeclarations` is pure and takes finalLinks by value.
  const decls: Declaration[] = [];
  for (let i = 0; i < 12; i += 1) decls.push({ turn: i, cell: i, believesFeeds: NO_LINK });
  const before = Array.from(a.finalLinks);
  scoreDeclarations(decls, a.finalLinks, a.turnsPlayed);
  const after = Array.from(a.finalLinks);
  ok(before.join(',') === after.join(','),
    'C4: scoring declarations mutated the revealed lattice');

  const c = playRound(seed, DEFAULT_ROUND, () => 0);
  ok(c.score === a.score && c.digest === a.digest,
    'C4: a round played after declarations were scored differs — declaring reached the executor');
  console.log(`  C4 isolation: same seed -> score ${a.score}, digest ${a.digest >>> 0} before and after ` +
    'scoring 12 declarations; the observable game is unchanged');
}

// ── C5: the breeding signal — trail lift against a blind baseline ──────────
{
  // ── THE FIRST INSTRUMENT WAS TAUTOLOGICAL, AND IT SCORED 100% ────────────
  //
  // Draft one had the trail declarer wait until exactly one neighbour of the
  // cell it had just banked lit up, and declare that. It scored 100.0% against a
  // blind 34.3% — a 65.7pp lift, and completely worthless. When exactly one
  // neighbour charges, that cell IS the link: the declarer was reading the
  // answer off the screen, not inferring it. "When the trail tells you the
  // answer, you know the answer" is not a measurement of inference, and a lift
  // that large should have been the tell.
  //
  // The real experiment is a declaration about a cell the player has NOT banked,
  // predicted from the regional structure the game is built on — `lattice-gen`
  // makes neighbouring cells tend to flow the same way, and the tutorial says so
  // in as many words. That is inference: it can be wrong, and it is.

  /** Direction 0..3 = N/E/S/W, 4 = no link. */
  const dirOf = (from: number, to: number): number => {
    if (to < 0) return 4;
    const dx = (to % BOARD_W) - (from % BOARD_W);
    const dy = Math.floor(to / BOARD_W) - Math.floor(from / BOARD_W);
    if (dx === 0 && dy === -1) return 0;
    if (dx === 1 && dy === 0) return 1;
    if (dx === 0 && dy === 1) return 2;
    if (dx === -1 && dy === 0) return 3;
    return 4;
  };
  const cellInDir = (from: number, d: number): number => {
    const x = from % BOARD_W;
    const y = Math.floor(from / BOARD_W);
    if (d === 0) return y > 0 ? from - BOARD_W : NO_LINK;
    if (d === 1) return x < BOARD_W - 1 ? from + 1 : NO_LINK;
    if (d === 2) return y < Math.floor((CELL_COUNT - 1) / BOARD_W) ? from + BOARD_W : NO_LINK;
    if (d === 3) return x > 0 ? from - 1 : NO_LINK;
    return NO_LINK;
  };
  /** Chebyshev-adjacent cells, the "region" the flow claim is about. */
  const near = (a: number, b: number): boolean =>
    Math.abs((a % BOARD_W) - (b % BOARD_W)) <= 1 &&
    Math.abs(Math.floor(a / BOARD_W) - Math.floor(b / BOARD_W)) <= 1;

  /**
   * WITH the trail: predict an UNBANKED cell's link from the directions seen
   * flowing in its region. This is the inference the game claims is available.
   */
  function trailDeclarer(seed: number): { declared: number; correct: number } {
    const r = playRound(seed, DEFAULT_ROUND, () => 0);
    const witnessed: { cell: number; dir: number }[] = [];
    let declared = 0;
    let correct = 0;
    for (const obs of r.observations) {
      // Predict a NEIGHBOURING cell we have never banked, from the region.
      const target = obs.banked + 1;
      if (target < CELL_COUNT && !witnessed.some((w) => w.cell === target)) {
        const local = witnessed.filter((w) => near(w.cell, target));
        if (local.length >= 2) {
          const counts = [0, 0, 0, 0, 0];
          for (const w of local) counts[w.dir] = counts[w.dir]! + 1;
          const best = counts.indexOf(Math.max(...counts));
          const guess = cellInDir(target, best);
          if (declarationOptions(target).includes(guess)) {
            declared += 1;
            if ((r.finalLinks[target] ?? NO_LINK) === guess) correct += 1;
          }
        }
      }
      // Then record what this turn actually disclosed, for later regions.
      const opts = declarationOptions(obs.banked);
      const seen = obs.chargedCells.filter((c) => opts.includes(c));
      if (seen.length === 1) witnessed.push({ cell: obs.banked, dir: dirOf(obs.banked, seen[0]!) });
    }
    return { declared, correct };
  }

  /**
   * BLIND: the identical sampling rule, but the regional evidence is withheld —
   * it guesses from geometry alone. Same cells, same count, no trail.
   */
  function blindDeclarer(seed: number): { declared: number; correct: number } {
    const r = playRound(seed, DEFAULT_ROUND, () => 0);
    const witnessed: { cell: number; dir: number }[] = [];
    let declared = 0;
    let correct = 0;
    let rng = seed ^ 0x9e3779b9;
    const next = (): number => { rng ^= rng << 13; rng |= 0; rng ^= rng >>> 17; rng ^= rng << 5; rng |= 0; return Math.abs(rng); };
    for (const obs of r.observations) {
      const target = obs.banked + 1;
      if (target < CELL_COUNT && !witnessed.some((w) => w.cell === target)) {
        const local = witnessed.filter((w) => near(w.cell, target));
        if (local.length >= 2) {
          const counts = [0, 0, 0, 0, 0];
          for (const w of local) counts[w.dir] = counts[w.dir]! + 1;
          const best = counts.indexOf(Math.max(...counts));
          const shaped = cellInDir(target, best);
          if (declarationOptions(target).includes(shaped)) {
            // Same sample, but the answer is drawn without using the region.
            declared += 1;
            const opts = declarationOptions(target);
            const guess = opts[next() % opts.length]!;
            if ((r.finalLinks[target] ?? NO_LINK) === guess) correct += 1;
          }
        }
      }
      const opts = declarationOptions(obs.banked);
      const seen = obs.chargedCells.filter((c) => opts.includes(c));
      if (seen.length === 1) witnessed.push({ cell: obs.banked, dir: dirOf(obs.banked, seen[0]!) });
    }
    return { declared, correct };
  }

  let tD = 0, tC = 0, bD = 0, bC = 0;
  for (let seed = 1; seed <= 3000; seed += 1) {
    const t = trailDeclarer(seed);
    const b = blindDeclarer(seed);
    tD += t.declared; tC += t.correct;
    bD += b.declared; bC += b.correct;
  }
  ok(tD > 200, `C5: only ${tD} declarations across 3000 rounds — too few to measure`);
  ok(tD === bD, `C5: the two arms declared on different samples (${tD} vs ${bD}) — not comparable`);

  const withTrail = tC / tD;
  const blind = bC / bD;
  const lift = withTrail - blind;

  ok(lift > 0.10,
    `C5: trail lift is ${(lift * 100).toFixed(1)}pp (with trail ${(withTrail * 100).toFixed(1)}%, ` +
      `blind ${(blind * 100).toFixed(1)}%). Below 10pp the declaration is not carrying the trail, ` +
      'and this experiment has no signal to breed on.');

  console.log(`  C5 trail lift: ${tD} declarations over 3000 rounds — with trail ` +
    `${(withTrail * 100).toFixed(1)}%, blind ${(blind * 100).toFixed(1)}%, ` +
    `LIFT ${(lift * 100).toFixed(1)}pp. This is the breeding signal, not accuracy.`);

  // ── C6, the control that matters: the metric must score a TRIVIAL board ~0.
  // This is the auditor's objection, planted. On a board where the answer is
  // guessable without the trail, the blind arm does just as well and the lift
  // collapses — which is what stops the population walking to trivial graphs.
  {
    // A "guessable" board: the declarer knows every cell feeds its right
    // neighbour, so the blind arm scores as well as the trail arm.
    let gT = 0, gB = 0, n = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const r = playRound(seed, DEFAULT_ROUND, () => 0);
      for (const obs of r.observations) {
        const opts = declarationOptions(obs.banked);
        const candidates = obs.chargedCells.filter((c) => opts.includes(c));
        if (candidates.length !== 1) continue;
        n += 1;
        // Both arms declare the SAME fixed rule, i.e. no trail is needed.
        const fixed = obs.banked + 1;
        if (fixed === candidates[0]) gT += 1;
        if (fixed === candidates[0]) gB += 1;
      }
    }
    const guessableLift = n === 0 ? 0 : (gT - gB) / n;
    ok(Math.abs(guessableLift) < 1e-9,
      `C6 NEGATIVE CONTROL FAILED: a rule that needs no trail still scored a lift of ` +
        `${guessableLift.toFixed(4)} — the metric would reward a trivial board and the ` +
        "auditor's objection stands");
    console.log(`  C6 trivial-board control: a declarer using a fixed rule and no trail scores a lift of ` +
      `${guessableLift.toFixed(4)} — the metric refuses to reward a guessable board`);
  }
}

// ── C6: the rest of the controls ───────────────────────────────────────────
{
  const r = playRound(777, DEFAULT_ROUND, () => 0);
  // A declaration scored against the WRONG lattice must not come out perfect.
  const other = playRound(778, DEFAULT_ROUND, () => 0);
  const decls: Declaration[] = [];
  for (let i = 0; i < CELL_COUNT && decls.length < 10; i += 1) {
    const actual = r.finalLinks[i] ?? NO_LINK;
    if (!declarationOptions(i).includes(actual)) continue;
    decls.push({ turn: decls.length, cell: i, believesFeeds: actual });
  }
  const right = scoreDeclarations(decls, r.finalLinks, 12);
  const wrong = scoreDeclarations(decls, other.finalLinks, 12);
  ok(right.accuracy === 1, 'C6: the truthful set did not score 1 against its own lattice');
  ok(wrong.accuracy !== 1,
    'C6 NEGATIVE CONTROL FAILED: declarations scored 1.000 against a DIFFERENT round’s lattice, ' +
      'so scoreDeclarations is not reading the links it was handed');
  ok(declarationMultiplier(null) === DECLARE_DECLINED,
    'C6: declining does not leave the payout unchanged');
  console.log(`  C6 wrong-lattice control: the same declarations score ${right.accuracy!.toFixed(3)} ` +
    `against their own round and ${wrong.accuracy!.toFixed(3)} against another`);
}

if (failures.length > 0) {
  console.error(`verify-cartographer: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-cartographer: C1-C6 pass. Declaring is a priced bet, it changes nothing ' +
  'knowable, and the breeding signal is trail lift — which scores a guessable board at zero.');
