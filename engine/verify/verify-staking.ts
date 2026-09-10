// engine/verify/verify-staking.ts — a staked heat rewards skill and resists
// collusion, or the build fails.
//
// S1  SKILL PAYS — a better rung earns a better return, in rank order
// S2  the premium is REAL, not noise
// S3  every simulated pool closes exactly
// S4  the SYBIL ATTACK does not pay             (the measured boundary, pinned)
//
// ─────────────────────────────────────────────────────────────────────────────
// S4 EXISTS BECAUSE AN AUDIT ANSWERED THIS QUESTION BY ASSERTION AND WAS WRONG.
//
// Asked whether stake-weighted settlement revives the sybil attack, the design
// audit replied: "No, sybils are neutralized by the requirement of minimum stake
// per account." Measured, that was FALSE — a colluder at a 62% share of the pool
// running eight MIN_STAKE throwaways earned +1.38 percentage points over playing
// honestly. The fix was a concentration limit, and S4 is what stops it eroding.

import { evaluateStaking, sybilProbe } from '../../foundry/montecarlo/staking.js';
import { BASELINE } from '../../foundry/montecarlo/variants.js';
import { MAX_POOL_SHARE_BPS, MIN_STAKE } from '../../game/economy/heat.js';
import { DEFAULT_ROUND } from '../../lattice/round.js';

const failures: string[] = [];
const ok = (c: boolean, d: string): void => { if (!c) failures.push(d); };
const HEATS = Number(process.env['STAKE_HEATS'] ?? 120);

const m = evaluateStaking(BASELINE, HEATS, 15, 100n);

// ── S1 / S2: skill pays ────────────────────────────────────────────────────
{
  const byScore = [...m.rungs].sort((a, b) => a.score - b.score);
  ok(m.skillPaysRank,
    'S1: return does not rise with skill across the ladder. Ranked by mean score the ROIs are ' +
      byScore.map((r) => `${r.rung} ${(r.roiBps / 100).toFixed(1)}%`).join(', ') +
      '. If a worse player earns more, the pool is redistributing on something other than merit.');
  ok(m.skillPremiumBps > 2000,
    `S2: the gap between the best and worst rung is only ${(m.skillPremiumBps / 100).toFixed(1)} ` +
      'percentage points. A staked game where skill barely moves the return is a lottery with extra ' +
      'steps.');
  console.log(`  S1/S2 skill pays: ` +
    byScore.map((r) => `${r.rung} ${(r.roiBps / 100).toFixed(0)}%`).join(' < ') +
    ` — premium ${(m.skillPremiumBps / 100).toFixed(0)}pp`);
}

// ── S3: the pool closes, every time, under simulation ──────────────────────
{
  ok(m.allPoolsClosed,
    'S3: at least one simulated heat failed to distribute its whole net pool. verify-parimutuel P1 ' +
      'proves closure on synthetic heats; this proves it on heats produced by the actual ladder.');
  console.log(`  S3 closure under simulation: all ${HEATS} heats distributed their net pool exactly`);
}

// ── S4: the sybil attack does not pay ──────────────────────────────────────
{
  const edge = (m.sybilRoiBps - m.honestRoiBps) / 100;
  ok(m.sybilRoiBps <= m.honestRoiBps,
    `S4: running sybils earns ${(m.sybilRoiBps / 100).toFixed(2)}% against ${(m.honestRoiBps / 100).toFixed(2)}% ` +
      `for playing honestly — a +${edge.toFixed(2)}pp edge. In a pool game ANY repeatable positive ` +
      'edge from collusion is fatal, because it scales. The concentration limit ' +
      `(${MAX_POOL_SHARE_BPS} bps) is what holds this down; if it has been raised or removed, this ` +
      'is where it shows.');
  console.log(`  S4 sybil resistance: honest ${(m.honestRoiBps / 100).toFixed(1)}%, with sybils ` +
    `${(m.sybilRoiBps / 100).toFixed(1)}% — collusion costs ${(-edge).toFixed(1)}pp`);

  // THE POSITIVE CONTROL. The limit must be the thing doing the work: with a
  // dominant attacker the attack IS profitable, which is what was measured and
  // what MAX_POOL_SHARE_BPS exists to prevent. If this stops firing, the
  // mechanism has changed and the limit may no longer be load-bearing.
  const dominant = sybilProbe(DEFAULT_ROUND, 150, 15, 100n, 8, false);
  const dominantEdge = (dominant.sybilRoiBps - dominant.honestRoiBps) / 100;
  ok(dominantEdge > 0,
    `S4 POSITIVE CONTROL FAILED: with an attacker allowed to dominate the pool, sybils earn ` +
      `${dominantEdge.toFixed(2)}pp — i.e. the attack no longer pays even UNCONSTRAINED. That would ` +
      'be good news, but it means the concentration limit is no longer the thing protecting the ' +
      'pool and the protection has moved somewhere unrecorded.');
  console.log(`  S4 control: an UNCONSTRAINED dominant attacker gains +${dominantEdge.toFixed(1)}pp ` +
    'from sybils — the attack is real, and the concentration limit is what removes it');
}

if (failures.length > 0) {
  console.error(`verify-staking: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-staking: S1-S4 pass over ${HEATS} heats. Skill pays in rank order, every pool ` +
  'closes, and collusion is a losing strategy.');
