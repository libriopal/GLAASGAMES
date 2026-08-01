// core/store/types.ts — §3.1 (17_PHASE2_HANDOFF_COMPLETE.md)
//
// The Store interface is the ONLY persistence surface the rest of the repo
// may depend on. No vendor, provider, or adapter name may appear here or in
// any caller — verify-no-vendor-leak enforces that structurally (DEF-08).

export type Branch = 'A' | 'B' | 'C' | 'D' | 'E';
export type DelphiRound = 1 | 2 | 3;
export type PlayerCount = 1 | 2;

/** Raised when a database-level constraint (CHECK, PK, FK) rejects a write. */
export class StoreConstraintError extends Error {
  constructor(
    public readonly constraint: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreConstraintError';
  }
}

// --- accounts ----------------------------------------------------------------

export interface AccountRow {
  id: string;
  ageVerified21Plus: boolean;
  selfExcluded: boolean;
  selfExclusionCoolingOffUntil: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface CreateAccountInput {
  id: string;
  ageVerified21Plus?: boolean;
  selfExcluded?: boolean;
  selfExclusionCoolingOffUntil?: string | null;
}

// --- sessions (HUMAN PLAY ONLY — SA-01) ---------------------------------------

export interface SessionRow {
  id: string;
  accountId: string | null;
  branch: Branch;
  isBotSession: boolean;
  seedCommit: string;
  seedReveal: string | null;
  boardSeed: string;
  playerCount: PlayerCount;
  startedAt: string;
  endedAt: string | null;
}

export interface CreateSessionInput {
  id: string;
  accountId?: string | null;
  branch: Branch;
  isBotSession: boolean;
  seedCommit: string;
  boardSeed: string;
  playerCount: PlayerCount;
}

export interface SessionEventInput {
  sessionId: string;
  seq: number;
  kind: string;
  payload: unknown;
}

// --- harvest_runs (BOT ONLY — structurally cannot be a match) ----------------

export interface HarvestRunRow {
  id: string;
  branch: Branch;
  organismId: string | null;
  committee: unknown;
  seed: string;
  startedAt: string;
}

export interface CreateHarvestRunInput {
  id: string;
  branch: Branch;
  organismId?: string | null;
  committee: unknown;
  seed: string;
}

// --- telemetry_events (TelemetrySignal shape — forbidden columns checked) ----

export interface TelemetryEventInput {
  sessionId: string;
  contestedStateRef?: string | null;
  decisionLatencyMs?: number | null;
  chosenMoveIndex?: number | null;
  reconsidered?: boolean | null;
}

// --- contested_states ----------------------------------------------------------

export interface ContestedStateRow {
  id: string;
  harvestRunId: string | null;
  stateSnapshot: unknown;
  candidateMoves: string[];
  committeeMargin: number;
  harvestedAt: string;
}

export interface CreateContestedStateInput {
  id: string;
  harvestRunId?: string | null;
  stateSnapshot: unknown;
  candidateMoves: string[];
  committeeMargin: number;
}

// --- rater_judgments / converged_seeds (§3.4 — Round-1 anonymity) ------------

export interface SubmitRaterJudgmentInput {
  raterId: string;
  contestedStateId: string;
  round: DelphiRound;
  chosenMoveIndex: number;
}

/**
 * §3.4 — the only view of a contested state a rater may receive.
 * round 1: state + candidate moves ONLY — round1Distribution is null.
 * round 2/3: state + moves + the round-1 AGGREGATE distribution (counts only,
 * indexed by candidate move index). Never another rater's individual row.
 */
export interface RatingView {
  contestedStateId: string;
  stateSnapshot: unknown;
  candidateMoves: string[];
  round1Distribution: number[] | null;
}

export interface ConvergedSeedInput {
  contestedStateId: string;
  distribution: unknown;
  raterCount: number;
}

export interface ConvergedSeedRow extends ConvergedSeedInput {
  computedAt: string;
}

// --- organisms -----------------------------------------------------------------

export interface CreateOrganismInput {
  id: string;
  genome: unknown;
  expression: unknown;
  lineage: unknown;
  provenance: unknown;
}

export interface OrganismRow extends CreateOrganismInput {
  createdAt: string;
}

// --- gate_results (LAW 2 — every gate result carries provenance) -------------

export interface GateResultInput {
  gateName: string;
  subjectId: string;
  passed: boolean;
  detail: unknown;
  modelIdentity: string;
  commitSha: string;
  isStandIn: boolean;
}

export interface GateResultRow extends GateResultInput {
  id: number;
  at: string;
}

// --- audit_log -------------------------------------------------------------------

export interface AuditLogEntryInput {
  sessionId: string;
  entry: unknown;
}

/**
 * Vendor-neutral persistence boundary (§3.1). Every adapter (SQLite, Postgres)
 * implements this identically — verify-store-parity proves it. Callers outside
 * core/store/ may only import this file, never an adapter.
 */
export interface Store {
  migrate(): Promise<void>;
  close(): Promise<void>;

  createAccount(input: CreateAccountInput): Promise<AccountRow>;
  getAccount(id: string): Promise<AccountRow | null>;
  /** Cascades sessions/events/telemetry (§3.3). converged_seeds is aggregate/de-identified and survives. */
  deleteAccount(id: string): Promise<void>;
  /** Introspects the live `accounts` table — backs verify-economy-columns-match. */
  listAccountColumns(): Promise<string[]>;

  /** Throws StoreConstraintError (or the adapter's native constraint error) on branch_a_no_bots / branch_a_needs_opponent violation. */
  createSession(input: CreateSessionInput): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow | null>;
  appendSessionEvent(input: SessionEventInput): Promise<void>;

  /** Never writes to `sessions` — verify-harvest-not-sessions (P5) depends on this remaining true. */
  createHarvestRun(input: CreateHarvestRunInput): Promise<HarvestRunRow>;

  recordTelemetryEvent(input: TelemetryEventInput): Promise<void>;
  /** Introspects the live `telemetry_events` table — backs verify-telemetry-schema-clean. */
  listTelemetryColumns(): Promise<string[]>;

  createContestedState(input: CreateContestedStateInput): Promise<ContestedStateRow>;

  /** §3.4 — the ONLY method through which a rater may read a contested state. */
  getStateForRating(raterId: string, contestedStateId: string, round: DelphiRound): Promise<RatingView>;
  submitRaterJudgment(input: SubmitRaterJudgmentInput): Promise<void>;
  /** AR-06 — removes every row for raterId; converged_seeds is untouched. */
  deleteRaterJudgments(raterId: string): Promise<void>;

  upsertConvergedSeed(input: ConvergedSeedInput): Promise<void>;
  getConvergedSeed(contestedStateId: string): Promise<ConvergedSeedRow | null>;

  createOrganism(input: CreateOrganismInput): Promise<OrganismRow>;

  recordGateResult(input: GateResultInput): Promise<GateResultRow>;

  appendAuditLog(input: AuditLogEntryInput): Promise<void>;
}
