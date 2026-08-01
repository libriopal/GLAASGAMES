-- core/store/migrations/0001_init.sqlite.user.sql
-- Dialect translation of 0001_init.postgres.user.sql. See the admin file
-- for the split rationale and the cross-boundary soft-reference list.

-- account_id: soft reference -> admin DB accounts(id)
CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  account_id     TEXT,
  branch         TEXT NOT NULL CHECK (branch IN ('A','B','C','D','E')),
  is_bot_session BOOLEAN NOT NULL DEFAULT FALSE,
  seed_commit    TEXT NOT NULL,
  seed_reveal    TEXT,
  board_seed     TEXT NOT NULL,
  player_count   INTEGER NOT NULL CHECK (player_count IN (1,2)),
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at       TEXT,
  CONSTRAINT branch_a_no_bots CHECK (NOT (branch = 'A' AND is_bot_session = 1)),
  CONSTRAINT branch_a_needs_opponent CHECK (NOT (branch = 'A' AND player_count = 1))
);

CREATE TABLE IF NOT EXISTS session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  contested_state_ref TEXT,
  decision_latency_ms INTEGER,
  chosen_move_index   INTEGER,
  reconsidered        BOOLEAN,
  at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- harvest_run_id: soft reference -> admin DB harvest_runs(id)
CREATE TABLE IF NOT EXISTS contested_states (
  id               TEXT PRIMARY KEY,
  harvest_run_id   TEXT,
  state_snapshot   TEXT NOT NULL,
  candidate_moves  TEXT NOT NULL,
  committee_margin REAL NOT NULL,
  harvested_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rater_judgments (
  rater_id           TEXT NOT NULL,
  contested_state_id TEXT NOT NULL REFERENCES contested_states(id),
  round              INTEGER NOT NULL CHECK (round IN (1,2,3)),
  chosen_move_index  INTEGER NOT NULL,
  at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (rater_id, contested_state_id, round)
);
