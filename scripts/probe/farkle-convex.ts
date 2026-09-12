// STEP 4: falsify the claim "the push decision is worthless because reward is
// LINEAR in chains taken, and turns are capped so points-per-turn is maximised
// by banking instantly."
//
// If that is the cause, making reward CONVEX in run length must make pushing pay.
// If it is not the cause, a multiplier will change scores but not the ranking.
import { CELL_COUNT, drawHand, riskAfter, scoringChains } from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS, judgeChain } from '../../game/farkle/round.js';

const TURNS = 10;
// Candidate escalations: multiplier applied to the WHOLE run, by chains taken.
const CURVES: Record<string, (n:number)=>number> = {
  'flat (now)':      () => 1,
  'x1.25 per chain': (n) => Math.pow(1.25, Math.max(0, n - 1)),
  'x1.5 per chain':  (n) => Math.pow(1.50, Math.max(0, n - 1)),
  'triangular':      (n) => (n * (n + 1)) / 2 / n,
};

type Pol = 'bank1'|'bank2'|'bank3'|'greedyEV';
function play(seed: number, mult: (n:number)=>number, pol: Pol): number {
  let bank = 0;
  for (let t = 0; t < TURNS; t++) {
    const faces = Array.from({length: CELL_COUNT}, (_,i) => faceAtOrdinal(seed*97+t, i, FACE_WEIGHTS));
    const live = new Set(drawHand(seed*31+t));
    let run = 0, chains = 0;
    for (;;) {
      const cs = scoringChains(faces, live);
      if (!cs.length) { run = 0; break; }          // farkle: lose the run
      const best = cs.reduce((a,b)=> (b.score/b.cells.length > a.score/a.cells.length ? b : a));
      const risk = riskAfter(faces, live, best.cells);
      // stop rule
      let stop = false;
      if (pol === 'bank1') stop = chains >= 1;
      else if (pol === 'bank2') stop = chains >= 2;
      else if (pol === 'bank3') stop = chains >= 3;
      else {
        // EV-aware given the multiplier: push if expected gain beats expected loss
        const pLoss = risk / 3;
        const gain = best.score * mult(chains + 1) - run * mult(chains);
        stop = chains > 0 && (gain * (1 - pLoss) < run * mult(chains) * pLoss);
      }
      if (stop) break;
      run += best.score; chains++;
      for (const c of best.cells) live.delete(c);
    }
    bank += Math.round(run * mult(chains));
  }
  return bank;
}

const SEEDS = 400;
console.log('curve              bank1    bank2    bank3   greedyEV | bank1 as % of best');
for (const [name, mult] of Object.entries(CURVES)) {
  const res: Record<string,number> = {};
  for (const pol of ['bank1','bank2','bank3','greedyEV'] as Pol[]) {
    let tot = 0; for (let s=1;s<=SEEDS;s++) tot += play(s, mult, pol);
    res[pol] = tot/SEEDS;
  }
  const best = Math.max(...Object.values(res));
  const pct = (res['bank1']!/best)*100;
  console.log(`${name.padEnd(18)} ${res['bank1']!.toFixed(0).padStart(6)} ${res['bank2']!.toFixed(0).padStart(8)} ${res['bank3']!.toFixed(0).padStart(8)} ${res['greedyEV']!.toFixed(0).padStart(10)} | ${pct.toFixed(1)}%`);
}
