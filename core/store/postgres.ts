// core/store/postgres.ts — §3.1 deploy adapter, admin/user split.
//
// Two Postgres connections back a single Store — see sqlite.ts's header for
// the full table split and soft-reference rationale, which applies
// identically here. The only file in the repo allowed to import a Postgres
// client; verify-no-vendor-leak enforces that nothing outside core/store/
// does. Connection strings are read from the environment at construction
// only (§10.1), never at call sites.
//
// Note on E3/§0.7: this adapter speaks plain Postgres wire protocol via `pg`
// against DATABASE_URL_ADMIN / DATABASE_URL_USER. It never imports a
// Supabase-branded client — Supabase is simply the hosted Postgres each
// connects to in production.

import pg from 'pg';
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

const { Pool } = pg;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const ADMIN_MIGRATION_PATH = join(MIGRATIONS_DIR, '0001_init.postgres.admin.sql');
const USER_MIGRATION_PATH = join(MIGRATIONS_DIR, '0001_init.postgres.user.sql');

function wrapConstraintError(err: unknown): never {
  const pgErr = err as { code?: string; constraint?: string; message?: string };
  if (pgErr?.code === '23514') throw new StoreConstraintError(pgErr.constraint ?? 'check', pgErr.message ?? 'check constraint failed');
  if (pgErr?.code === '23505') throw new StoreConstraintError(pgErr.constraint ?? 'primary_key', pgErr.message ?? 'unique constraint failed');
  if (pgErr?.code === '23503') throw new StoreConstraintError(pgErr.constraint ?? 'foreign_key', pgErr.message ?? 'foreign key constraint failed');
  throw err;
}

export interface PostgresStoreConnections {
  adminUrl?: string;
  userUrl?: string;
}

export class PostgresStore implements Store {
  private readonly admin: InstanceType<typeof Pool>;
  private readonly user: InstanceType<typeof Pool>;

  /**
   * Defaults to process.env.DATABASE_URL_ADMIN / DATABASE_URL_USER, read
   * here at construction — never inside a method — per §10.1's key-handling
   * rule applied to the two persistence credentials this repo holds.
   */
  constructor(connections: PostgresStoreConnections = {}) {
    const adminUrl = connections.adminUrl ?? process.env.DATABASE_URL_ADMIN ?? '';
    const userUrl = connections.userUrl ?? process.env.DATABASE_URL_USER ?? '';
    if (!adminUrl) throw new Error('PostgresStore requires DATABASE_URL_ADMIN (env) or an explicit adminUrl');
    if (!userUrl) throw new Error('PostgresStore requires DATABASE_URL_USER (env) or an explicit userUrl');
    this.admin = new Pool({ connectionString: adminUrl });
    this.user = new Pool({ connectionString: userUrl });
  }

  async migrate(): Promise<void> {
    await this.admin.query(readFileSync(ADMIN_MIGRATION_PATH, 'utf8'));
    await this.user.query(readFileSync(USER_MIGRATION_PATH, 'utf8'));
  }

  async close(): Promise<void> {
    await this.admin.end();
    await this.user.end();
  }

  private async accountExists(id: string): Promise<boolean> {
    const { rows } = await this.admin.query('SELECT 1 FROM accounts WHERE id = $1', [id]);
    return rows.length > 0;
  }

  private async harvestRunExists(id: string): Promise<boolean> {
    const { rows } = await this.admin.query('SELECT 1 FROM harvest_runs WHERE id = $1', [id]);
    return rows.length > 0;
  }

  private async sessionExists(id: string): Promise<boolean> {
    const { rows } = await this.user.query('SELECT 1 FROM sessions WHERE id = $1', [id]);
    return rows.length > 0;
  }

  private async contestedStateExists(id: string): Promise<boolean> {
    const { rows } = await this.user.query('SELECT 1 FROM contested_states WHERE id = $1', [id]);
    return rows.length > 0;
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
      await this.admin.query(
        `INSERT INTO accounts (id, age_verified_21_plus, self_excluded, self_exclusion_cooling_off_until, created_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.ageVerified21Plus, row.selfExcluded, row.selfExclusionCoolingOffUntil, row.createdAt, row.deletedAt],
      );
    } catch (err) {
      wrapConstraintError(err);
    }
    return row;
  }

  async getAccount(id: string): Promise<AccountRow | null> {
    const { rows } = await this.admin.query('SELECT * FROM accounts WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      ageVerified21Plus: r.age_verified_21_plus as boolean,
      selfExcluded: r.self_excluded as boolean,
      selfExclusionCoolingOffUntil: (r.self_exclusion_cooling_off_until as string | null) ?? null,
      createdAt: new Date(r.created_at as string).toISOString(),
      deletedAt: r.deleted_at ? new Date(r.deleted_at as string).toISOString() : null,
    };
  }

  /** Cross-database cascade — see the identical comment in sqlite.ts. No
   * cross-database transaction exists between two separate Postgres
   * instances, so this is best-effort in program order, not atomic. */
  async deleteAccount(id: string): Promise<void> {
    const { rows: sessions } = await this.user.query('SELECT id FROM sessions WHERE account_id = $1', [id]);
    for (const s of sessions as Array<{ id: string }>) {
      await this.user.query('DELETE FROM sessions WHERE id = $1', [s.id]);
    }
    await this.admin.query('DELETE FROM accounts WHERE id = $1', [id]);
  }

  async listAccountColumns(): Promise<string[]> {
    const { rows } = await this.admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts' ORDER BY ordinal_position`,
    );
    return rows.map((r: { column_name: string }) => r.column_name);
  }

  // --- sessions (USER) -------------------------------------------------------

  async createSession(input: CreateSessionInput): Promise<SessionRow> {
    if (input.accountId && !(await this.accountExists(input.accountId))) {
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
      await this.user.query(
        `INSERT INTO sessions (id, account_id, branch, is_bot_session, seed_commit, seed_reveal, board_seed, player_count, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, row.accountId, row.branch, row.isBotSession, row.seedCommit, row.seedReveal, row.boardSeed, row.playerCount, row.startedAt, row.endedAt],
      );
    } catch (err) {
      wrapConstraintError(err);
    }
    return row;
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const { rows } = await this.user.query('SELECT * FROM sessions WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      accountId: (r.account_id as string | null) ?? null,
      branch: r.branch as Branch,
      isBotSession: r.is_bot_session as boolean,
      seedCommit: r.seed_commit as string,
      seedReveal: (r.seed_reveal as string | null) ?? null,
      boardSeed: r.board_seed as string,
      playerCount: r.player_count as 1 | 2,
      startedAt: new Date(r.started_at as string).toISOString(),
      endedAt: r.ended_at ? new Date(r.ended_at as string).toISOString() : null,
    };
  }

  async appendSessionEvent(input: SessionEventInput): Promise<void> {
    await this.user.query('INSERT INTO session_events (session_id, seq, kind, payload, at) VALUES ($1, $2, $3, $4, $5)', [
      input.sessionId,
      input.seq,
      input.kind,
      JSON.stringify(input.payload),
      new Date().toISOString(),
    ]);
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
    await this.admin.query('INSERT INTO harvest_runs (id, branch, organism_id, committee, seed, started_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      row.id,
      row.branch,
      row.organismId,
      JSON.stringify(row.committee),
      row.seed,
      row.startedAt,
    ]);
    return row;
  }

  // --- telemetry (USER) -------------------------------------------------------

  async recordTelemetryEvent(input: TelemetryEventInput): Promise<void> {
    await this.user.query(
      `INSERT INTO telemetry_events (session_id, contested_state_ref, decision_latency_ms, chosen_move_index, reconsidered, at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.sessionId, input.contestedStateRef ?? null, input.decisionLatencyMs ?? null, input.chosenMoveIndex ?? null, input.reconsidered ?? null, new Date().toISOString()],
    );
  }

  async listTelemetryColumns(): Promise<string[]> {
    const { rows } = await this.user.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'telemetry_events' ORDER BY ordinal_position`,
    );
    return rows.map((r: { column_name: string }) => r.column_name);
  }

  // --- contested states / delphi (USER) ---------------------------------------

  async createContestedState(input: CreateContestedStateInput): Promise<ContestedStateRow> {
    if (input.harvestRunId && !(await this.harvestRunExists(input.harvestRunId))) {
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
    await this.user.query(
      `INSERT INTO contested_states (id, harvest_run_id, state_snapshot, candidate_moves, committee_margin, harvested_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.id, row.harvestRunId, JSON.stringify(row.stateSnapshot), JSON.stringify(row.candidateMoves), row.committeeMargin, row.harvestedAt],
    );
    return row;
  }

  /** §3.4 — see sqlite.ts. Entirely a USER-database read. */
  async getStateForRating(_raterId: string, contestedStateId: string, round: DelphiRound): Promise<RatingView> {
    const { rows } = await this.user.query('SELECT state_snapshot, candidate_moves FROM contested_states WHERE id = $1', [contestedStateId]);
    if (rows.length === 0) throw new Error(`no such contested_state: ${contestedStateId}`);
    const r = rows[0] as Record<string, unknown>;
    const candidateMoves = r.candidate_moves as string[];

    let round1Distribution: number[] | null = null;
    if (round === 2 || round === 3) {
      const { rows: counts } = await this.user.query(
        'SELECT chosen_move_index, COUNT(*)::int as cnt FROM rater_judgments WHERE contested_state_id = $1 AND round = 1 GROUP BY chosen_move_index',
        [contestedStateId],
      );
      const dist = new Array<number>(candidateMoves.length).fill(0);
      for (const c of counts as Array<{ chosen_move_index: number; cnt: number }>) {
        if (c.chosen_move_index >= 0 && c.chosen_move_index < dist.length) dist[c.chosen_move_index] = c.cnt;
      }
      round1Distribution = dist;
    }

    return {
      contestedStateId,
      stateSnapshot: r.state_snapshot,
      candidateMoves,
      round1Distribution,
    };
  }

  async submitRaterJudgment(input: SubmitRaterJudgmentInput): Promise<void> {
    try {
      await this.user.query('INSERT INTO rater_judgments (rater_id, contested_state_id, round, chosen_move_index, at) VALUES ($1, $2, $3, $4, $5)', [
        input.raterId,
        input.contestedStateId,
        input.round,
        input.chosenMoveIndex,
        new Date().toISOString(),
      ]);
    } catch (err) {
      wrapConstraintError(err);
    }
  }

  /** AR-06 — entirely a USER-database operation. converged_seeds lives in a
   * physically separate (admin) database and cannot be reached from here. */
  async deleteRaterJudgments(raterId: string): Promise<void> {
    await this.user.query('DELETE FROM rater_judgments WHERE rater_id = $1', [raterId]);
  }

  // --- converged seeds (ADMIN) -------------------------------------------------

  async upsertConvergedSeed(input: ConvergedSeedInput): Promise<void> {
    if (!(await this.contestedStateExists(input.contestedStateId))) {
      throw new StoreConstraintError('converged_seeds_contested_state_id_soft_fk', `no such contested_state: ${input.contestedStateId}`);
    }
    const computedAt = new Date().toISOString();
    await this.admin.query(
      `INSERT INTO converged_seeds (contested_state_id, distribution, rater_count, computed_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (contested_state_id) DO UPDATE SET distribution = excluded.distribution, rater_count = excluded.rater_count, computed_at = excluded.computed_at`,
      [input.contestedStateId, JSON.stringify(input.distribution), input.raterCount, computedAt],
    );
  }

  async getConvergedSeed(contestedStateId: string): Promise<ConvergedSeedRow | null> {
    const { rows } = await this.admin.query('SELECT * FROM converged_seeds WHERE contested_state_id = $1', [contestedStateId]);
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      contestedStateId: r.contested_state_id as string,
      distribution: r.distribution,
      raterCount: r.rater_count as number,
      computedAt: new Date(r.computed_at as string).toISOString(),
    };
  }

  // --- organisms / gates / audit (ADMIN) ----------------------------------------

  async createOrganism(input: CreateOrganismInput): Promise<OrganismRow> {
    const createdAt = new Date().toISOString();
    await this.admin.query('INSERT INTO organisms (id, genome, expression, lineage, provenance, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      input.id,
      JSON.stringify(input.genome),
      JSON.stringify(input.expression),
      JSON.stringify(input.lineage),
      JSON.stringify(input.provenance),
      createdAt,
    ]);
    return { ...input, createdAt };
  }

  async recordGateResult(input: GateResultInput): Promise<GateResultRow> {
    const at = new Date().toISOString();
    const { rows } = await this.admin.query(
      `INSERT INTO gate_results (gate_name, subject_id, passed, detail, model_identity, commit_sha, is_stand_in, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [input.gateName, input.subjectId, input.passed, JSON.stringify(input.detail), input.modelIdentity, input.commitSha, input.isStandIn, at],
    );
    return { ...input, id: Number((rows[0] as { id: number | string }).id), at };
  }

  async appendAuditLog(input: AuditLogEntryInput): Promise<void> {
    if (!(await this.sessionExists(input.sessionId))) {
      throw new StoreConstraintError('audit_log_session_id_soft_fk', `no such session: ${input.sessionId}`);
    }
    await this.admin.query('INSERT INTO audit_log (session_id, entry, at) VALUES ($1, $2, $3)', [
      input.sessionId,
      JSON.stringify(input.entry),
      new Date().toISOString(),
    ]);
  }
}
