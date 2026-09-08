// lattice/bond.ts — the commitment device, not an entry fee.
//
// A bond is posted before a bonded run and returns at exactly 100% — win, lose
// or abandon. It buys no odds, no prize and no advantage; it buys a cohort.
//
// This implements the standing Tier 1 decision recorded in glassbox_labs
// (`game/economy/rules.ts`: payout === principal, "the ~2% bonus was removed",
// R6Q2), and it is the reason this product is not gambling: nothing is at risk,
// so there is no consideration, and the prize is ranked on skill and funded from
// outside the bonds, so there is no chance element either. Two of the three
// elements are absent, where a sweepstakes AMOE removes only one.
//
// The property worth defending hardest: A STAKE THAT CANNOT BE LOST CANNOT BE
// CHASED. Loss-chasing is the primary harm vector in gambling and every
// industry control is a mitigation layered over a mechanic that still permits
// it. Here the mechanic does not permit it, and that is enforced below rather
// than promised.

export interface Bond {
  readonly id: string;
  readonly accountId: string;
  readonly principal: number;
  readonly postedAtTurn: number;
}

export interface BondRelease {
  readonly bondId: string;
  readonly principal: number;
  readonly payout: number;
}

export type Outcome = 'won' | 'lost' | 'abandoned';

export function postBond(
  id: string,
  accountId: string,
  principal: number,
  postedAtTurn: number,
): Bond {
  if (!Number.isInteger(principal) || principal <= 0) {
    throw new Error(`bond principal must be a positive integer, got ${principal}`);
  }
  return { id, accountId, principal, postedAtTurn };
}

/**
 * Releases a bond.
 *
 * `outcome` is accepted and then deliberately ignored for the payout. It is a
 * parameter so that the signature makes the guarantee legible at every call
 * site: whatever happened, the payout is the principal. A version that took no
 * outcome would leave a reader wondering whether some other path pays
 * differently; this one answers that at a glance.
 */
export function releaseBond(bond: Bond, outcome: Outcome): BondRelease {
  void outcome;
  return { bondId: bond.id, principal: bond.principal, payout: bond.principal };
}

/** The Glassbox invariant, restated here so this module carries its own check. */
export function payoutEqualsPrincipal(release: BondRelease): boolean {
  return release.payout === release.principal;
}

/**
 * Prize funding provenance.
 *
 * The invention in one line: THE MONEY THAT COMMITS AND THE MONEY THAT REWARDS
 * MUST NEVER BE THE SAME MONEY. A sweepstakes fuses entry and prize into one
 * economy and then needs an alternate free entry to survive the fusion. Unfusing
 * them removes the problem instead of patching it.
 */
export type FundingSource = 'treasury' | 'sponsor' | 'cosmetics' | 'bondPool';

export interface PrizeAward {
  readonly accountId: string;
  readonly amount: number;
  readonly source: FundingSource;
  /** Rank earned by skill. 1 is best. */
  readonly rank: number;
}

/** A prize funded from bonds is the one thing this economy may never do. */
export function fundingIsClean(award: PrizeAward): boolean {
  return award.source !== 'bondPool';
}
