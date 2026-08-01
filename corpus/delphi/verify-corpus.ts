/**
 * W5 gate: Delphi tooling tallies rounds correctly, the converged seed is a
 * normalized distribution, Fleiss' κ matches hand-derivable values, and the
 * corpus-extension recommendation only fires in the genuinely-contested band.
 *
 * Run: npm run verify:corpus   ·   Exit 0 = gate held.
 */

import type { RaterJudgment, StakeRecord } from './types.ts';
import { computeConvergedSeed, computeRound1Distribution, computeRound3Distribution, formatDistributionForDisplay } from './protocol.ts';
import { fleissKappa, recommendCorpusExtension, shannonEntropy } from './stats.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const stake: StakeRecord = {
  whatIRisked: 'my lead',
  whatIWanted: 'to lock in points',
  whatIReadOnTheBoard: 'opponent one turn from the centre',
  confidence: 4,
  whatWouldHaveChangedMyMind: 'if I could see their hand',
};

function judgment(raterId: string, round: 1 | 3, chosenMoveIndex: number): RaterJudgment {
  return { contestedStateId: 'cs-1', raterId, round, chosenMoveIndex, stake };
}

// 1. Round 1 tally.
const round1Judgments = [judgment('r1', 1, 0), judgment('r2', 1, 0), judgment('r3', 1, 1)];
const round1 = computeRound1Distribution(round1Judgments, 'cs-1', 2);
ok(round1.counts[0] === 2 && round1.counts[1] === 1, 'round-1 distribution tallies votes per candidate move');
ok(formatDistributionForDisplay(round1).includes('move[0]: 2/3'), 'display format surfaces the distribution for round 2');

// 2. Round 3 tally + converged seed is a normalized distribution, not a single answer.
const round3Judgments = [judgment('r1', 3, 0), judgment('r2', 3, 0), judgment('r3', 3, 0)];
const round3 = computeRound3Distribution(round3Judgments, 'cs-1', 2);
const seed = computeConvergedSeed(round3);
ok(seed.distribution[0] === 1 && seed.distribution[1] === 0, 'converged seed normalizes round-3 votes to a distribution');
ok(Math.abs(seed.distribution.reduce((a, b) => a + b, 0) - 1) < 1e-9, '  ...distribution sums to 1');

// 3. Fleiss' kappa — deterministic hand-derivable cases.
const perfectAgreement = [[4, 0], [4, 0], [4, 0]];
ok(fleissKappa(perfectAgreement) === 1, 'perfect agreement across subjects yields κ=1');

const maxDisagreement = [
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
];
const kappaWorseThanChance = fleissKappa(maxDisagreement);
ok(Math.abs(kappaWorseThanChance - -1 / 3) < 1e-9, `even-split-every-subject case yields κ=-1/3 (got ${kappaWorseThanChance.toFixed(4)})`);

// 4. Entropy — richness measure.
ok(shannonEntropy([10, 0]) === 0, 'unanimous distribution has zero entropy');
ok(Math.abs(shannonEntropy([5, 5]) - 1) < 1e-9, 'even 2-way split has 1 bit of entropy');

// 5. Corpus extension recommendation — only fires within the genuinely-contested band.
ok(!recommendCorpusExtension(20, 0.4).extend, 'below pilot size (30): never recommend extension');
ok(recommendCorpusExtension(30, 0.4).extend, 'moderate κ at pilot size: recommend extension to 50+');
ok(recommendCorpusExtension(30, 0.4).targetSize === 50, '  ...target size is 50');
ok(!recommendCorpusExtension(30, 0.9).extend, 'κ too high (trivial agreement): do not extend — states are not contested');
ok(!recommendCorpusExtension(30, 0.05).extend, 'κ too low (near-chance): do not extend — re-harvest instead');

console.log('');
console.log('NOTE: this verifies the Delphi TOOLING only. Actual round 1-3 execution against');
console.log('live human raters is a process step outside code execution — see §10 report / halt H7.');

console.log('');
if (failures === 0) {
  console.log('W5 GATE HELD: Delphi tooling correct on all hand-derivable statistics.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
