// families/genome/novelty.ts — W1 (07_CLAUDE_CODE_HANDOFF_V6.md §2.2)
// The novelty gate — direct counter-measure to DEF-02-GEN: five score formulas
// wearing five names, all playing the same game.

import type { ContestedState, Genome, StructuralLoci } from './types.ts';
import { stateSignature } from './types.ts';

export interface NoveltyResult {
  passed: boolean;
  structuralNovelty: boolean;
  judgmentNovelty: boolean;
  differingLoci: (keyof StructuralLoci)[];
  novelContestedStates: number;
  reason: string;
}

/**
 * An offspring is admitted ONLY if BOTH hold:
 *   1. It differs from EVERY parent on ≥1 STRUCTURAL locus
 *   2. It produces contested states its parents did NOT produce
 *
 * It FAILS if it only recombines scalars.
 */
export function evaluateNovelty(
  offspring: Genome,
  parents: Genome[],
  offspringStates: ContestedState[],
  parentStates: ContestedState[],
): NoveltyResult {
  const differingLoci = (Object.keys(offspring.structural) as (keyof StructuralLoci)[]).filter(
    (locus) => parents.every((p) => p.structural[locus] !== offspring.structural[locus]),
  );

  const structuralNovelty = differingLoci.length >= 1;

  const parentSignatures = new Set(parentStates.map(stateSignature));
  const novel = offspringStates.filter((s) => !parentSignatures.has(stateSignature(s)));
  const judgmentNovelty = novel.length > 0;

  const passed = structuralNovelty && judgmentNovelty;

  return {
    passed,
    structuralNovelty,
    judgmentNovelty,
    differingLoci,
    novelContestedStates: novel.length,
    reason: passed
      ? `Novel on [${differingLoci.join(', ')}] with ${novel.length} unseen contested states`
      : !structuralNovelty
        ? 'REJECTED: scalar-only recombination — no structural locus differs from all parents'
        : 'REJECTED: produces no contested state its parents did not produce',
  };
}
