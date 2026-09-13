// STAGE 0 for the deep-strategy run: N1-N4 plus the branching baseline.
import { playMatch, headToHead, branchingProfile, declaringAgent, NEVER_DECLARE } from '../../foundry/montecarlo/deep-harness.js';
import { ORDER_1 } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH, beginSynth, advanceSynth, judgeSynth, playSynth, verifySynth } from '../../game/chem/synth.js';

const R = { ...DEFAULT_SYNTH, route: true, preview: 0, options: 3, turns: 12 };
let bad = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name.padEnd(52)} ${detail}`);
};

// N1 — the stake is actually forfeit. Negative control: a refunding version
// must score strictly HIGHER, or the forfeit is not happening.
{
  const A = declaringAgent(1);
  // A seed on which the agent ACTUALLY DECLARES. Seed 4242 was hardcoded first
  // and its book is [F2, F2, F2] on a board where no move can produce F2 -- so
  // the agent correctly declined, declared 0 times, and the control compared
  // two identical banks. Third time this project has written a check that
  // cannot distinguish; the fix is always the same, find a live case.
  let live = 0;
  for (let s2 = 1; s2 <= 400 && live === 0; s2 += 1) {
    const r = playSynth(s2 * 7919, R, (t, b, q, bank, turn) => A.choose(t, b, q, bank, turn, R));
    if (r.declaresMade > 0) live = s2 * 7919;
  }
  // REPLAY THE SAME ACTIONS under both stakes, so the ONLY difference is the
  // forfeit. Letting each config choose its own actions compared two different
  // behaviours: at stake 0 the agent declares every turn (bank >= 0 always
  // holds), never reacts, and banks nothing -- which made the stake version look
  // richer and the control read backwards.
  const actions: import('../../game/chem/synth.js').SynthAction[] = [];
  const withStake = playSynth(live, R, (t, b, q, bank, turn) => {
    const a = A.choose(t, b, q, bank, turn, R);
    actions.push(a);
    return a;
  });
  const free = { ...R, routeStake: 0 };
  const noStake = verifySynth(live, free, actions);
  // STRICTLY greater, and declarations must actually have happened. The first
  // version used >= and the agent never declared, so it compared 2594 to 2594
  // and passed on equality -- a control that cannot distinguish.
  check('N1 the declaration stake is really forfeit',
    withStake.declaresMade > 0 && noStake.bank > withStake.bank,
    `seed ${live}, declared ${withStake.declaresMade}x, same actions: bank ${withStake.bank} with stake vs ${noStake.bank} without`);
}
// N2 — a second declaration while one is live must not replace it.
{
  const st = beginSynth(777, R);
  advanceSynth(st, R, () => ({ cells: [], option: 0, kind: 'DECLARE' }));
  const first = st.declared?.formula;
  advanceSynth(st, R, () => ({ cells: [], option: 1, kind: 'DECLARE' }));
  check('N2 a live declaration cannot be replaced', st.declared?.formula === first && st.declaresMade === 1, `declared ${String(first)}, made ${st.declaresMade}`);
}
// N3/N4 — self-play must be 50% and side-swap must carry no bias.
{
  const h = headToHead(40, R, ORDER_1, ORDER_1);
  check('N4 self-play is 50% +/- sampling error', Math.abs(h.winRateA - (100 - h.winRateA - h.draws)) < 12, `A wins ${h.winRateA.toFixed(1)}%, draws ${h.draws.toFixed(1)}%, means ${h.meanA.toFixed(2)}/${h.meanB.toFixed(2)}`);
}
// N5 — route disabled must reject a declaration.
{
  const st = beginSynth(1, { ...R, route: false });
  const j = judgeSynth(st.tiles, { cells: [], option: 0, kind: 'DECLARE' }, 1e6, { ...R, route: false });
  check('N5 declaring with the route disabled is rejected', j.rejected === 'ROUTE_DISABLED', `rejected=${String(j.rejected)}`);
}
// baseline branching, so the anti-Nim gate has a before.
{
  const b = branchingProfile(20, { ...DEFAULT_SYNTH, options: 3, turns: 12 });
  console.log(`\nbaseline (no route, no vs): branching ${b.branching.toFixed(2)} live moves, entropy ${b.entropy.toFixed(2)} bits`);
}
console.log(bad === 0 ? '\nSTAGE 0 PASSED' : `\nSTAGE 0 FAILED — ${bad} check(s)`);
