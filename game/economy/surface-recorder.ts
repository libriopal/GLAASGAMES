// game/economy/surface-recorder.ts — R3. The witness stops being an argument.
//
// DEFECT (from design_handoff_glassbox_p3_eincol/REVISIONS.md R3):
// `verifyEconomyInvisibility(accounts, renderedEconomyFor: string[])` decides
// whether the economy leaked to a minor or a self-excluded account by reading a
// `string[]` handed to it. In verify-suite.ts that array was the literal
// `['minor']`. The oracle therefore proved "the list I wrote is consistent with
// the rule I wrote" — never "the economy was not shown". Subject as its own
// witness, in the age gate.
//
// REJECTED ALTERNATIVE — do not re-derive: render the real UI headless and
// scrape for economy DOM nodes. Rejected on two grounds: it makes a legal
// control depend on a renderer and a selector list (a vocabulary proxy one layer
// down), and it cannot run in the CPU-only deterministic lane the blueprint
// mandates for anything financial.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS DOES NOT YET DO, STATED HERE BECAUSE IT IS THE HONEST HALF.
//
// R3's design says to route "the real render path" through this recorder. THERE
// IS NO REAL RENDER PATH. Measured at this commit, `economyVisible` has exactly
// two callers in the entire repository:
//
//     game/economy/rules.ts:29        — inside verifyEconomyInvisibility itself
//     game/economy/verify-economy.ts  — a test
//
// `game/economy/` is three files: rules, types, and its own verify. Nothing in
// `web/` imports it. There is no economy UI in this tree to instrument, so
// wiring a recorder into "the render boundary" would have meant inventing that
// boundary — a parallel path whose only driver is the test that consumes it,
// which is the same vacuous-witness defect R3 exists to close, moved one layer
// down. The handoff prompt forbids exactly that: "grep first, do not create a
// parallel path."
//
// So what lands here is the SEAM, not the closure:
//   - the recorder computes its set by calling `economyVisible` itself, so the
//     set is DERIVED rather than supplied — that part is a genuine improvement
//     and is what makes the negative control diagnostic (see verify-suite);
//   - it is the only sanctioned way to record an economy surface, so when a UI
//     is built there is one obvious place to call and one oracle already
//     waiting;
//   - it is NOT yet an independent witness of rendering, and must not be
//     reported as one. Recorded as an open finding in
//     00_GOVERNANCE/registers/FINDINGS.md under R3.
// ─────────────────────────────────────────────────────────────────────────────

import { economyVisible } from './rules.ts';
import type { Account } from './types.ts';

/** One recorded decision: who asked, for what surface, and what was decided. */
export interface SurfaceGrant {
  readonly accountId: string;
  readonly surface: string;
  readonly granted: boolean;
}

/**
 * Records every economy surface an account was actually granted.
 *
 * `gate()` is both the decision and the record — a caller cannot show the
 * economy without the recorder knowing, because the boolean it needs comes back
 * from the same call that writes the entry. A recorder that only observed would
 * be bypassable by forgetting to call it; this one is bypassable only by not
 * asking whether you are allowed.
 */
export class EconomySurfaceRecorder {
  private readonly grants: SurfaceGrant[] = [];

  /**
   * The single question a surface may ask. Returns the decision and records it.
   *
   * NOTE the decision is `economyVisible(account)`, unchanged and uncopied —
   * R3 is explicit that `economyVisible` is correct and is the one code path
   * Tier 1 ratified. This adds a witness to it; it does not reimplement it.
   */
  gate(account: Account, surface: string): boolean {
    const granted = economyVisible(account);
    this.grants.push({ accountId: account.id, surface, granted });
    return granted;
  }

  /** Account ids that were actually shown an economy surface, deduplicated. */
  grantedTo(): string[] {
    return [...new Set(this.grants.filter((g) => g.granted).map((g) => g.accountId))].sort();
  }

  /** Every recorded decision, for diagnostics. */
  all(): readonly SurfaceGrant[] {
    return this.grants;
  }

  /** Surfaces seen, deduplicated — so a new surface shows up in the record. */
  surfaces(): string[] {
    return [...new Set(this.grants.map((g) => g.surface))].sort();
  }
}
