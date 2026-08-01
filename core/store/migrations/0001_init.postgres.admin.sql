-- core/store/migrations/0001_init.postgres.admin.sql
-- ADMIN database — secrets/security side of the admin/user split.
-- Owns: accounts, organisms, harvest_runs, gate_results, audit_log, converged_seeds.
--
-- This is a live security-segregation decision (Tier 1, 2026-08-01, via direct
-- instruction — not yet folded back into 11_TIER1_ELECTIONS_DECISION_RECORD.md
-- as a numbered election; flagged in the P1 report for that record to be
-- updated).
--
-- Cost of the split, stated plainly: four foreign keys that used to be real
-- database constraints now cross a physical database boundary and cannot be
-- expressed as SQL FOREIGN KEYs at all:
--   sessions.account_id          -> accounts.id            (user DB -> admin DB)
--   contested_states.harvest_run_id -> harvest_runs.id     (user DB -> admin DB)
--   audit_log.session_id         -> sessions.id            (admin DB -> user DB)
--   converged_seeds.contested_state_id -> contested_states.id (admin DB -> user DB)
-- Each becomes a plain TEXT column (still named identically), with existence
-- checked in application code (core/store/postgres.ts / sqlite.ts) at write
-- time, and cascade-on-delete implemented explicitly in Store.deleteAccount
-- rather than left to the database. This is a real loss of a DB-enforced
-- guarantee — recorded here rather than left implicit.

CREATE TABLE IF NOT EXISTS accounts (
  id                                TEXT PRIMARY KEY,
  age_verified_21_plus              BOOLEAN NOT NULL DEFAULT FALSE,
  self_excluded                     BOOLEAN NOT NULL DEFAULT FALSE,
  self_exclusion_cooling_off_until  TIMESTAMPTZ,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organisms (
  id         TEXT PRIMARY KEY,
  genome     JSONB NOT NULL,
  expression JSONB NOT NULL,
  lineage    JSONB NOT NULL,
  provenance JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS harvest_runs (
  id          TEXT PRIMARY KEY,
  branch      TEXT NOT NULL CHECK (branch IN ('A','B','C','D','E')),
  organism_id TEXT REFERENCES organisms(id), -- same-side FK, stays real
  committee   JSONB NOT NULL,
  seed        TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- gate_results — LAW 2: every gate result carries provenance
CREATE TABLE IF NOT EXISTS gate_results (
  id             BIGSERIAL PRIMARY KEY,
  gate_name      TEXT NOT NULL,
  subject_id     TEXT NOT NULL,
  passed         BOOLEAN NOT NULL,
  detail         JSONB NOT NULL,
  model_identity TEXT NOT NULL,
  commit_sha     TEXT NOT NULL,
  is_stand_in    BOOLEAN NOT NULL,
  at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- audit_log.session_id: soft reference into the USER database's `sessions`
-- table. No FOREIGN KEY — enforced at the application layer instead
-- (Store.appendAuditLog checks existence against the user connection first).
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL, -- soft ref -> user DB sessions(id)
  entry      JSONB NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE SEED CORPUS. Aggregate + de-identified by construction, and now
-- physically isolated from rater_judgments (user DB) as well — a rater's
-- deletion request can never touch this table even by accident, because
-- it lives in a different database entirely.
-- contested_state_id: soft reference into the USER database's `contested_states`.
CREATE TABLE IF NOT EXISTS converged_seeds (
  contested_state_id TEXT PRIMARY KEY, -- soft ref -> user DB contested_states(id)
  distribution        JSONB NOT NULL,
  rater_count          SMALLINT NOT NULL,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
