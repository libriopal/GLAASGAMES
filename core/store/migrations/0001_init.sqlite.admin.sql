-- core/store/migrations/0001_init.sqlite.admin.sql
-- Dialect translation of 0001_init.postgres.admin.sql. See that file for
-- the admin/user split rationale and the cross-boundary soft-reference list.

CREATE TABLE IF NOT EXISTS accounts (
  id                                TEXT PRIMARY KEY,
  age_verified_21_plus              BOOLEAN NOT NULL DEFAULT FALSE,
  self_excluded                     BOOLEAN NOT NULL DEFAULT FALSE,
  self_exclusion_cooling_off_until  TEXT,
  created_at                        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at                        TEXT
);

CREATE TABLE IF NOT EXISTS organisms (
  id         TEXT PRIMARY KEY,
  genome     TEXT NOT NULL,
  expression TEXT NOT NULL,
  lineage    TEXT NOT NULL,
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS harvest_runs (
  id          TEXT PRIMARY KEY,
  branch      TEXT NOT NULL CHECK (branch IN ('A','B','C','D','E')),
  organism_id TEXT REFERENCES organisms(id),
  committee   TEXT NOT NULL,
  seed        TEXT NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gate_results (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  gate_name      TEXT NOT NULL,
  subject_id     TEXT NOT NULL,
  passed         BOOLEAN NOT NULL,
  detail         TEXT NOT NULL,
  model_identity TEXT NOT NULL,
  commit_sha     TEXT NOT NULL,
  is_stand_in    BOOLEAN NOT NULL,
  at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- session_id: soft reference -> user DB sessions(id)
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  entry      TEXT NOT NULL,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- contested_state_id: soft reference -> user DB contested_states(id)
CREATE TABLE IF NOT EXISTS converged_seeds (
  contested_state_id TEXT PRIMARY KEY,
  distribution        TEXT NOT NULL,
  rater_count          INTEGER NOT NULL,
  computed_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
