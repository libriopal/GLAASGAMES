/**
 * Bounded evolvable vocabulary for the P5 demo (Research Domain).
 *
 * A genome encodes an ordered choice of rules from this pool (one index per slot);
 * materializing a genome yields a real DSL program that the P4 verifier certifies.
 * The reference policy TARGET stands in for the human-verified strategy; fitness is
 * agreement with it. The engine (islands / MWUA / migration / stopping / verification
 * gate) is identical over richer genomes and behavioral C(σ) fitness — only the
 * fitness function and genome encoding change.
 */

/** Each entry is a single sound DSL rule (verified in tests). */
export const RULE_POOL: readonly string[] = [
  "DO draw()", // 0
  "IF hasRacko(HAND) THEN show(GE,HAND)", // 1
  "IF isSmaller(SELECTED,3,HAND) THEN draw()", // 2
  "IF givesRacko(SELECTED) THEN show(EQ,HAND)", // 3
  "IF isCardBetweenNumbers(SELECTED,10,20,2,HAND) THEN draw()", // 4
  "IF sum(HAND,GT,BOARD) THEN show(LT,DISCARD)", // 5
  "IF play(DECK,LE,DISCARD) THEN draw()", // 6
  "IF NOT hasRacko(HAND) THEN show(GT,BOARD)", // 7
];

export const GENOME_LEN = 3;

/** The reference (human-verified) policy the search must recover. */
export const TARGET: readonly number[] = [2, 5, 7];

export type Genome = number[];

export function genomeToSource(g: Genome): string {
  return g.map((i) => RULE_POOL[i % RULE_POOL.length]).join("\n");
}

/** Structural agreement with the reference policy, in [0,1]. */
export function agreement(g: Genome): number {
  let m = 0;
  for (let i = 0; i < GENOME_LEN; i++) if (g[i] === TARGET[i]) m++;
  return m / GENOME_LEN;
}
