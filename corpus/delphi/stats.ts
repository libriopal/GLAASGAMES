// corpus/delphi/stats.ts — W5
// Fleiss' κ for reliability (generalizes to >2 raters, corrects for chance
// agreement, 10.1002/qaj.481) and entropy for richness.

import type { DelphiDistribution } from './types.ts';

/**
 * Fleiss' kappa across N subjects, n raters per subject (constant n), k categories.
 * subjectCategoryCounts[i][j] = number of raters who assigned subject i to category j.
 */
export function fleissKappa(subjectCategoryCounts: number[][]): number {
  const N = subjectCategoryCounts.length;
  if (N === 0) throw new Error('fleissKappa requires at least one subject');
  const n = subjectCategoryCounts[0]!.reduce((a, b) => a + b, 0);
  if (n < 2) throw new Error('fleissKappa requires at least 2 raters per subject');
  const k = subjectCategoryCounts[0]!.length;

  for (const row of subjectCategoryCounts) {
    const rowTotal = row.reduce((a, b) => a + b, 0);
    if (rowTotal !== n) throw new Error('every subject must have the same total rater count for Fleiss’ kappa');
  }

  const pI = subjectCategoryCounts.map((row) => (row.reduce((a, c) => a + c * c, 0) - n) / (n * (n - 1)));
  const pBar = pI.reduce((a, b) => a + b, 0) / N;

  const pJ = Array.from({ length: k }, (_, j) => subjectCategoryCounts.reduce((a, row) => a + row[j]!, 0) / (N * n));
  const pEBar = pJ.reduce((a, p) => a + p * p, 0);

  if (pEBar === 1) return 1; // degenerate: no possible disagreement
  return (pBar - pEBar) / (1 - pEBar);
}

export function fleissKappaFromDistributions(distributions: DelphiDistribution[]): number {
  return fleissKappa(distributions.map((d) => d.counts));
}

/** Shannon entropy in bits — richness of a distribution. 0 = unanimous, higher = more open. */
export function shannonEntropy(distribution: number[]): number {
  const total = distribution.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return -distribution
    .filter((c) => c > 0)
    .reduce((sum, c) => {
      const p = c / total;
      return sum + p * Math.log2(p);
    }, 0);
}

/**
 * κ interpretation band (Landis & Koch 1977): "genuinely contested" means fair-to-
 * moderate agreement — some signal above chance, but not so much consensus that the
 * decision wasn't actually a dilemma. Outside this band, extending the corpus either
 * wastes effort on noise (κ too low) or on states that were never really contested
 * (κ too high).
 */
const GENUINELY_CONTESTED_KAPPA_MIN = 0.2;
const GENUINELY_CONTESTED_KAPPA_MAX = 0.6;

export interface CorpusExtensionRecommendation {
  extend: boolean;
  targetSize: number;
  reason: string;
}

export function recommendCorpusExtension(currentSize: number, kappa: number): CorpusExtensionRecommendation {
  if (currentSize < 30) {
    return { extend: false, targetSize: 30, reason: 'pilot corpus has not yet reached 30 states' };
  }
  const genuinelyContested = kappa >= GENUINELY_CONTESTED_KAPPA_MIN && kappa <= GENUINELY_CONTESTED_KAPPA_MAX;
  if (!genuinelyContested) {
    return {
      extend: false,
      targetSize: currentSize,
      reason:
        kappa > GENUINELY_CONTESTED_KAPPA_MAX
          ? `κ=${kappa.toFixed(2)} — raters converge too readily; these states are not genuinely contested`
          : `κ=${kappa.toFixed(2)} — agreement is at or below chance; corpus needs re-harvesting, not extension`,
    };
  }
  return {
    extend: true,
    targetSize: 50,
    reason: `κ=${kappa.toFixed(2)} within the genuinely-contested band [${GENUINELY_CONTESTED_KAPPA_MIN}, ${GENUINELY_CONTESTED_KAPPA_MAX}]`,
  };
}
