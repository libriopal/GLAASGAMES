-- core/store/migrations/0001_init.postgres.user.sql
-- USER database — the side playtesters and raters' traffic actually reaches.
-- Owns: sessions, session_events, telemetry_events, contested_states, rater_judgments.
--
-- See 0001_init.postgres.admin.sql for the full rationale and the list of
-- FKs that no longer exist as database constraints because they cross the
-- admin/user boundary. Same-side FKs here (session_events/telemetry_events
-- -> sessions, rater_judgments -> contested_states) remain real constraints.

-- HUMAN PLAY ONLY (SA-01). account_id: soft reference into the ADMIN
-- database's `accounts` table — checked in application code, not by FK.
CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  account_id     TEXT, -- soft ref -> admin DB accounts(id)
  branch         TEXT NOT NULL CHECK (branch IN ('A','B','C','D','E')),
  is_bot_session BOOLEAN NOT NULL DEFAULT FALSE,
  seed_commit    TEXT NOT NULL,
  seed_reveal    TEXT,
  board_seed     TEXT NOT NULL,
  player_count   SMALLINT NOT NULL CHECK (player_count IN (1,2)),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  CONSTRAINT branch_a_no_bots CHECK (NOT (branch = 'A' AND is_bot_session = TRUE)),
  CONSTRAINT branch_a_needs_opponent CHECK (NOT (branch = 'A' AND player_count = 1))
);

CREATE TABLE IF NOT EXISTS session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, -- same-side, stays real
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

-- FORBIDDEN COLUMNS — verify-telemetry-schema-clean hard-fails if present:
--   session_length_ms · return_rate · streak_length · daily_active_flag
CREATE TABLE IF NOT EXISTS telemetry_events (
  id                  BIGSERIAL PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, -- same-side, stays real
  contested_state_ref TEXT,
  decision_latency_ms INTEGER,
  chosen_move_index   INTEGER,
  reconsidered        BOOLEAN,
  at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- harvest_run_id: soft reference into the ADMIN database's `harvest_runs`.
CREATE TABLE IF NOT EXISTS contested_states (
  id               TEXT PRIMARY KEY,
  harvest_run_id   TEXT, -- soft ref -> admin DB harvest_runs(id)
  state_snapshot   JSONB NOT NULL,
  candidate_moves  JSONB NOT NULL,
  committee_margin NUMERIC NOT NULL,
  harvested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rater_judgments (
  rater_id           TEXT NOT NULL,
  contested_state_id TEXT NOT NULL REFERENCES contested_states(id), -- same-side, stays real
  round              SMALLINT NOT NULL CHECK (round IN (1,2,3)),
  chosen_move_index  INTEGER NOT NULL,
  at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rater_id, contested_state_id, round)
);
