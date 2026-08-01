/**
 * W1 gate: every locus typed, serializable, round-trips; novelty gate rejects
 * scalar-only recombination and admits genuinely novel offspring.
 *
 * Run: npm run verify:genome   ·   Exit 0 = gate held.
 */

import { evaluateNovelty } from './novelty.ts';
import type { ContestedState, Genome } from './types.ts';
import { roundTripsThroughJson } from './types.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

function baseGenome(overrides: Partial<Genome> = {}): Genome {
  return {
    id: 'g-parent-a',
    lineage: [],
    structural: {
      topology: 'contested-centre',
      interactionVerb: 'keep-reroll',
      targeting: 'asymmetric-by-position',
      winCondition: 'plural',
      dilemmaShape: 'stay-or-yield',
      inSessionMutation: 'power-cards',
    },
    economy: { hasDraftEconomy: false, hasStaking: false },
    branch: 'D',
    expression: {
      palette: ['#00FFEE', '#123456'],
      motifKeywords: ['sentinel', 'ember'],
      characterArchetype: 'watcher',
      namingGrammar: 'cv-cvc',
      soundscape: {
        tonalCentre: 220,
        bandVoicing: { matter: 'pluck', ir: 'pad', uv: 'glass', cyan: 'click', voidshard: 'null' },
        emotionalContour: 'rising',
      },
      narrativeFrame: 'a contested watch-post',
    },
    scalars: { boardWidth: 5, boardHeight: 5, chainLengthMin: 3, hazardDensity: 0.2, targetScore: 20 },
    family: 'strike-or-hold',
    ...overrides,
  };
}

function state(id: string, moves: string[]): ContestedState {
  return { sessionId: 's1', turnIndex: 1, boardStateHash: id, topTwoEvGap: 0.05, candidateMoves: moves };
}

// 1. Round-trip.
const parent = baseGenome();
ok(roundTripsThroughJson(parent), 'genome round-trips through JSON unchanged');

// 2. Scalar-only offspring — same structural loci, different scalars only.
const scalarOnlyChild = baseGenome({
  id: 'g-child-scalar',
  lineage: [parent.id],
  scalars: { ...parent.scalars, targetScore: 40 },
});
const scalarOnlyResult = evaluateNovelty(
  scalarOnlyChild,
  [parent],
  [state('s-new', ['a', 'b'])],
  [state('s-old', ['a', 'b'])],
);
ok(!scalarOnlyResult.passed, 'scalar-only recombination is REJECTED by the novelty gate');
ok(!scalarOnlyResult.structuralNovelty, '  ...structuralNovelty is false');

// 3. Structurally different but no new contested states.
const noNewStatesChild = baseGenome({
  id: 'g-child-nostates',
  lineage: [parent.id],
  structural: { ...parent.structural, topology: 'open-grid' },
});
const sharedState = state('s-shared', ['a', 'b']);
const noNewStatesResult = evaluateNovelty(noNewStatesChild, [parent], [sharedState], [sharedState]);
ok(!noNewStatesResult.passed, 'structural change with zero novel contested states is REJECTED');
ok(noNewStatesResult.structuralNovelty && !noNewStatesResult.judgmentNovelty, '  ...judgmentNovelty is false');

// 4. Genuinely novel offspring — differs structurally AND produces new contested states.
const novelChild = baseGenome({
  id: 'g-child-novel',
  lineage: [parent.id],
  structural: { ...parent.structural, topology: 'lanes', targeting: 'single-opponent' },
});
const novelResult = evaluateNovelty(
  novelChild,
  [parent],
  [state('s-new-1', ['a', 'c']), state('s-new-2', ['b', 'd'])],
  [state('s-old', ['a', 'b'])],
);
ok(novelResult.passed, 'structurally-novel offspring with new contested states PASSES');
ok(novelResult.differingLoci.includes('topology'), '  ...topology recorded as a differing locus');
ok(novelResult.novelContestedStates === 2, '  ...both contested states counted as novel');

// 5. Must differ from EVERY parent (two-parent case), not just one.
const twoParentChild = baseGenome({
  id: 'g-child-two-parent',
  lineage: [parent.id, 'g-parent-b'],
  structural: { ...parent.structural, topology: 'open-grid' },
});
const parentB = baseGenome({ id: 'g-parent-b', structural: { ...parent.structural, topology: 'open-grid' } });
const twoParentResult = evaluateNovelty(
  twoParentChild,
  [parent, parentB],
  [state('s-new', ['x'])],
  [state('s-old', ['y'])],
);
ok(
  !twoParentResult.differingLoci.includes('topology'),
  'offspring matching ONE parent on a locus does not count that locus as differing',
);

console.log('');
if (failures === 0) {
  console.log('W1 GATE HELD: genome schema round-trips; novelty gate correctly admits/rejects.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
