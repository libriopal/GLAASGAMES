// core/store/sqlite.ts — §3.1 local dev adapter, admin/user split.
//
// Two independent SQLite connections back a single Store: `admin` holds
// accounts, organisms, harvest_runs, gate_results, audit_log,
// converged_seeds; `user` holds sessions, session_events, telemetry_events,
// contested_states, rater_judgments — the tables playtester/rater traffic
// actually reaches. See core/store/migrations/0001_init.*.admin.sql for the
// full rationale and the list of former foreign keys that now cross the
// boundary as application-checked soft references instead of DB constraints.
//
// Uses node:sqlite (stable, unflagged on the Node version this repo targets —
// see package.json "engines"). No import of this file may occur outside
// core/store/; callers depend on ./types.ts only.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  StoreConstraintError,
  type Store,
  type AccountRow,
  type CreateAccountInput,
  type SessionRow,
  type CreateSessionInput,
  type SessionEventInput,
  type HarvestRunRow,
  type CreateHarvestRunInput,
  type TelemetryEventInput,
  type ContestedStateRow,
  type CreateContestedStateInput,
  type DelphiRound,
  type RatingView,
  type SubmitRaterJudgmentInput,
  type ConvergedSeedInput,
  type ConvergedSeedRow,
  type CreateOrganismInput,
  type OrganismRow,
  type GateResultInput,
  type GateResultRow,
  type AuditLogEntryInput,
  type Branch,
} from './types.ts';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const ADMIN_MIGRATION_PATH = join(MIGRATIONS_DIR, '0001_init.sqlite.admin.sql');
const USER_MIGRATION_PATH = join(MIGRATIONS_DIR, '0001_init.sqlite.user.sql');

const b = (v: boolean | null | undefined): number | null => (v === null || v === undefined ? null : v ? 1 : 0);
const asBool = (v: unknown): boolean => v === 1 || v === true;

function wrapConstraintError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  const match = /CHECK constraint failed: (\S+)/.exec(message);
  if (match) throw new StoreConstraintError(match[1] as string, message);
  if (/UNIQUE constraint failed|PRIMARY KEY/.test(message)) throw new StoreConstraintError('primary_key', message);
  if (/FOREIGN KEY constraint failed/.test(message)) throw new StoreConstraintError('foreign_key', message);
  throw err;
}

export interface SqliteStoreLocations {
  admin?: string;
  user?: string;
}

export class SqliteStore implements Store {
  private readonly admin: DatabaseSync;
  private readonly user: DatabaseSync;

  constructor(locations: SqliteStoreLocations = {}) {
    this.admin = new DatabaseSync(locations.admin ?? ':memory:');
    this.user = new DatabaseSync(locations.user ?? ':memory:');
    this.admin.exec('PRAGMA foreign_keys = ON;');
    this.user.exec('PRAGMA foreign_keys = ON;');
  }

  async migrate(): Promise<void> {
    this.admin.exec(readFileSync(ADMIN_MIGRATION_PATH, 'utf8'));
    this.user.exec(readFileSync(USER_MIGRATION_PATH, 'utf8'));
  }

  async close(): Promise<void> {
    this.admin.close();
    this.user.close();
  }

  private accountExists(id: string): boolean {
    return this.admin.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id) !== undefined;
  }

  private harvestRunExists(id: string): boolean {
    return this.admin.prepare('SELECT 1 FROM harvest_runs WHERE id = ?').get(id) !== undefined;
  }

  private sessionExists(id: string): boolean {
    return this.user.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id) !== undefined;
  }

  private contestedStateExists(id: string): boolean {
    return this.user.prepare('SELECT 1 FROM contested_states WHERE id = ?').get(id) !== undefined;
  }

  // --- accounts (ADMIN) ----------------------------------------------------

  async createAccount(input: CreateAccountInput): Promise<AccountRow> {
    const row: AccountRow = {
      id: input.id,
      ageVerified21Plus: input.ageVerified21Plus ?? false,
      selfExcluded: input.selfExcluded ?? false,
      selfExclusionCoolingOffUntil: input.selfExclusionCoolingOffUntil ?? null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    try {
      this.admin
        .prepare(
          `INSERT INTO accounts (id, age_verified_21_plus, self_excluded, self_exclusion_cooling_off_until, created_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(row.id, b(row.ageVerified21Plus), b(row.selfExcluded), row.selfExclusionCoolingOffUntil, row.createdAt, row.deletedAt);
    } catch (err) {
      wrapConstraintError(err);
    }
    return row;
  }

  async getAccount(id: string): Promise<AccountRow | null> {
    const r = this.admin.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      ageVerified21Plus: asBool(r.age_verified_21_plus),
      selfExcluded: asBool(r.self_excluded),
      selfExclusionCoolingOffUntil: (r.self_exclusion_cooling_off_until as string | null) ?? null,
      createdAt: r.created_at as string,
      deletedAt: (r.deleted_at as string | null) ?? null,
    };
  }

  /**
   * Cross-database cascade (§3.3), done explicitly because accounts (admin)
   * and sessions (user) no longer share a database, so there is no native
   * ON DELETE CASCADE to lean on. Order: delete the user-side dependents
   * first (their own same-DB FKs cascade to session_events/telemetry_events),
   * then the admin row. converged_seeds lives in admin and is untouched by
   * construction — it was never linked to accounts at all.
   */
  async deleteAccount(id: string): Promise<void> {
    const sessions = this.user.prepare('SELECT id FROM sessions WHERE account_id = ?').all(id) as Array<{ id: string }>;
    for (const s of sessions) {
      this.user.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
    }
    this.admin.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  async listAccountColumns(): Promise<string[]> {
    const rows = this.admin.prepare('PRAGMA table_info(accounts)').all() as Array<Record<string, unknown>>;
    return rows.map((r) => r.name as string);
  }

  // --- sessions (USER) -------------------------------------------------------

  async createSession(input: CreateSessionInput): Promise<SessionRow> {
    if (input.accountId && !this.accountExists(input.accountId)) {
      throw new StoreConstraintError('sessions_account_id_soft_fk', `no such account: ${input.accountId}`);
    }
    const row: SessionRow = {
      id: input.id,
      accountId: input.accountId ?? null,
      branch: input.branch,
      isBotSession: input.isBotSession,
      seedCommit: input.seedCommit,
      seedReveal: null,
      boardSeed: input.boardSeed,
      playerCount: input.playerCount,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    try {
      this.user
        .prepare(
          `INSERT INTO sessions (id, account_id, branch, is_bot_session, seed_commit, seed_reveal, board_seed, player_count, started_at, ended_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.accountId,
          row.branch,
          b(row.isBotSession),
          row.seedCommit,
          row.seedReveal,
          row.boardSeed,
          row.playerCount,
          row.startedAt,
          row.endedAt,
        );
    } catch (err) {
      wrapConstraintError(err);
    }
    return row;
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const r = this.user.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      accountId: (r.account_id as string | null) ?? null,
      branch: r.branch as Branch,
      isBotSession: asBool(r.is_bot_session),
      seedCommit: r.seed_commit as string,
      seedReveal: (r.seed_reveal as string | null) ?? null,
      boardSeed: r.board_seed as string,
      playerCount: r.player_count as 1 | 2,
      startedAt: r.started_at as string,
      endedAt: (r.ended_at as string | null) ?? null,
    };
  }

  async appendSessionEvent(input: SessionEventInput): Promise<void> {
    this.user
      .prepare('INSERT INTO session_events (session_id, seq, kind, payload, at) VALUES (?, ?, ?, ?, ?)')
      .run(input.sessionId, input.seq, input.kind, JSON.stringify(input.payload), new Date().toISOString());
  }

  // --- harvest_runs (ADMIN) ---------------------------------------------------

  async createHarvestRun(input: CreateHarvestRunInput): Promise<HarvestRunRow> {
    const row: HarvestRunRow = {
      id: input.id,
      branch: input.branch,
      organismId: input.organismId ?? null,
      committee: input.committee,
      seed: input.seed,
      startedAt: new Date().toISOString(),
    };
    this.admin
      .prepare('INSERT INTO harvest_runs (id, branch, organism_id, committee, seed, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.branch, row.organismId, JSON.stringify(row.committee), row.seed, row.startedAt);
    return row;
  }

  // --- telemetry (USER) -------------------------------------------------------

  async recordTelemetryEvent(input: TelemetryEventInput): Promise<void> {
    this.user
      .prepare(
        `INSERT INTO telemetry_events (session_id, contested_state_ref, decision_latency_ms, chosen_move_index, reconsidered, at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.sessionId,
        input.contestedStateRef ?? null,
        input.decisionLatencyMs ?? null,
        input.chosenMoveIndex ?? null,
        b(input.reconsidered ?? null),
        new Date().toISOString(),
      );
  }

  async listTelemetryColumns(): Promise<string[]> {
    const rows = this.user.prepare('PRAGMA table_info(telemetry_events)').all() as Array<Record<string, unknown>>;
    return rows.map((r) => r.name as string);
  }

  // --- contested states / delphi (USER) ---------------------------------------

  async createContestedState(input: CreateContestedStateInput): Promise<ContestedStateRow> {
    if (input.harvestRunId && !this.harvestRunExists(input.harvestRunId)) {
      throw new StoreConstraintError('contested_states_harvest_run_id_soft_fk', `no such harvest_run: ${input.harvestRunId}`);
    }
    const row: ContestedStateRow = {
      id: input.id,
      harvestRunId: input.harvestRunId ?? null,
      stateSnapshot: input.stateSnapshot,
      candidateMoves: input.candidateMoves,
      committeeMargin: input.committeeMargin,
      harvestedAt: new Date().toISOString(),
    };
    this.user
      .prepare(
        `INSERT INTO contested_states (id, harvest_run_id, state_snapshot, candidate_moves, committee_margin, harvested_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.harvestRunId, JSON.stringify(row.stateSnapshot), JSON.stringify(row.candidateMoves), row.committeeMargin, row.harvestedAt);
    return row;
  }

  /**
   * §3.4. raterId is accepted for interface symmetry but never used to
   * filter the query: the aggregate view returned here is identical for
   * every rater at a given round, by construction. Entirely within the USER
   * database — a rater or playtester scoped to user-only credentials could
   * serve this whole method without ever touching admin.
   */
  async getStateForRating(_raterId: string, contestedStateId: string, round: DelphiRound): Promise<RatingView> {
    const r = this.user.prepare('SELECT state_snapshot, candidate_moves FROM contested_states WHERE id = ?').get(contestedStateId) as
      | Record<string, unknown>
      | undefined;
    if (!r) throw new Error(`no such contested_state: ${contestedStateId}`);
    const candidateMoves = JSON.parse(r.candidate_moves as string) as string[];

    let round1Distribution: number[] | null = null;
    if (round === 2 || round === 3) {
      const counts = this.user
        .prepare('SELECT chosen_move_index, COUNT(*) as cnt FROM rater_judgments WHERE contested_state_id = ? AND round = 1 GROUP BY chosen_move_index')
        .all(contestedStateId) as Array<Record<string, unknown>>;
      const dist = new Array<number>(candidateMoves.length).fill(0);
      for (const c of counts) {
        const idx = c.chosen_move_index as number;
        if (idx >= 0 && idx < dist.length) dist[idx] = c.cnt as number;
      }
      round1Distribution = dist;
    }

    return {
      contestedStateId,
      stateSnapshot: JSON.parse(r.state_snapshot as string),
      candidateMoves,
      round1Distribution,
    };
  }

  async submitRaterJudgment(input: SubmitRaterJudgmentInput): Promise<void> {
    try {
      this.user
        .prepare('INSERT INTO rater_judgments (rater_id, contested_state_id, round, chosen_move_index, at) VALUES (?, ?, ?, ?, ?)')
        .run(input.raterId, input.contestedStateId, input.round, input.chosenMoveIndex, new Date().toISOString());
    } catch (err) {
      wrapConstraintError(err);
    }
  }

  /**
   * AR-06. Entirely a USER-database operation — converged_seeds lives in
   * admin, a physically separate database, so this cannot touch it even by
   * accident. Stronger than the pre-split guarantee, not just equivalent.
   */
  async deleteRaterJudgments(raterId: string): Promise<void> {
    this.user.prepare('DELETE FROM rater_judgments WHERE rater_id = ?').run(raterId);
  }

  // --- converged seeds (ADMIN) -------------------------------------------------

  async upsertConvergedSeed(input: ConvergedSeedInput): Promise<void> {
    if (!this.contestedStateExists(input.contestedStateId)) {
      throw new StoreConstraintError('converged_seeds_contested_state_id_soft_fk', `no such contested_state: ${input.contestedStateId}`);
    }
    const computedAt = new Date().toISOString();
    this.admin
      .prepare(
        `INSERT INTO converged_seeds (contested_state_id, distribution, rater_count, computed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(contested_state_id) DO UPDATE SET distribution = excluded.distribution, rater_count = excluded.rater_count, computed_at = excluded.computed_at`,
      )
      .run(input.contestedStateId, JSON.stringify(input.distribution), input.raterCount, computedAt);
  }

  async getConvergedSeed(contestedStateId: string): Promise<ConvergedSeedRow | null> {
    const r = this.admin.prepare('SELECT * FROM converged_seeds WHERE contested_state_id = ?').get(contestedStateId) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      contestedStateId: r.contested_state_id as string,
      distribution: JSON.parse(r.distribution as string),
      raterCount: r.rater_count as number,
      computedAt: r.computed_at as string,
    };
  }

  // --- organisms / gates / audit (ADMIN) ----------------------------------------

  async createOrganism(input: CreateOrganismInput): Promise<OrganismRow> {
    const createdAt = new Date().toISOString();
    this.admin
      .prepare('INSERT INTO organisms (id, genome, expression, lineage, provenance, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.id, JSON.stringify(input.genome), JSON.stringify(input.expression), JSON.stringify(input.lineage), JSON.stringify(input.provenance), createdAt);
    return { ...input, createdAt };
  }

  async recordGateResult(input: GateResultInput): Promise<GateResultRow> {
    const at = new Date().toISOString();
    const result = this.admin
      .prepare(
        `INSERT INTO gate_results (gate_name, subject_id, passed, detail, model_identity, commit_sha, is_stand_in, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.gateName, input.subjectId, b(input.passed), JSON.stringify(input.detail), input.modelIdentity, input.commitSha, b(input.isStandIn), at);
    return { ...input, id: Number(result.lastInsertRowid), at };
  }

  async appendAuditLog(input: AuditLogEntryInput): Promise<void> {
    if (!this.sessionExists(input.sessionId)) {
      throw new StoreConstraintError('audit_log_session_id_soft_fk', `no such session: ${input.sessionId}`);
    }
    this.admin
      .prepare('INSERT INTO audit_log (session_id, entry, at) VALUES (?, ?, ?)')
      .run(input.sessionId, JSON.stringify(input.entry), new Date().toISOString());
  }
}
