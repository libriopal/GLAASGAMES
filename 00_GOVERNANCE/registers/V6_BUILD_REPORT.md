# V6 Build Report — §10 format

**Source:** `design_handoff_glassbox_ecosystem_v5/07_CLAUDE_CODE_HANDOFF_V6.md`
**Authorization:** `governance/DEC-2026-08-001_V6_TIER1_APPROVAL.md`
**Base commit (at report time):** `56260bd20f0890b850170bd047b263e7cc8358a1`
**Verify:** `npm run verify` → **exit 0** (143 checks, 0 failures, includes all 18 §9-named checks + W1–W9 gates)

---

## W1 — Genome schema
**Status:** COMPLETE
**Gate:** every locus typed, serializable, round-trips → PASS
**Files:** `families/genome/types.ts`, `families/genome/novelty.ts`, `families/genome/verify-genome.ts`
**Verify:** `npm run verify:genome` → exit 0
**Provenance:** n/a (schema/logic gate, not a model-run gate)
**Halt conditions triggered:** none
**Tier 1 decisions required:** none

## W2 — Expression pipeline (cyan-spectrum)
**Status:** COMPLETE
**Gate:** generates palette+motif+character+name+sound+narrative from a genome, deterministically → PASS
**Files:** `families/provenance/types.ts`, `families/expression/pipeline.ts`, `families/expression/verify-expression.ts`
**Verify:** `npm run verify:expression` → exit 0
**Provenance:** n/a (pipeline/logic gate)
**Halt conditions triggered:** none
**Tier 1 decisions required:** none

## W3 — Telemetry instrument
**Status:** COMPLETE
**Gate:** captures decision-centric signals at margin-flagged states only → PASS
**Files:** `foundry/types.ts`, `foundry/telemetry/types.ts`, `foundry/telemetry/capture.ts`, `foundry/telemetry/verify-telemetry.ts`
**Verify:** `npm run verify:telemetry` → exit 0
**Provenance:** n/a
**Halt conditions triggered:** none
**Tier 1 decisions required:** none

## W4 — Margin-based contested-state harvester
**Status:** COMPLETE
**Gate:** bot ensemble returns ranked contested states via committee-mean top-two EV margin, friction as secondary confirmation only → PASS
**Files:** `foundry/harvest/margin.ts`, `foundry/harvest/verify-harvest.ts`
**Verify:** `npm run verify:harvest` → exit 0
**Provenance:** n/a
**Halt conditions triggered:** none
**Tier 1 decisions required:** none

## W5 — Delphi corpus tooling
**Status:** COMPLETE (tooling) / **BLOCKED** (live execution)
**Gate:** anonymous → distribution → re-answer → converged seed protocol, Fleiss' κ + entropy correct on hand-derivable cases → PASS (tooling)
**Files:** `corpus/delphi/types.ts`, `corpus/delphi/protocol.ts`, `corpus/delphi/stats.ts`, `corpus/delphi/verify-corpus.ts`
**Verify:** `npm run verify:corpus` → exit 0
**Provenance:** n/a
**Halt conditions triggered:** **implicit H7** — running actual Round 1–3 Delphi sessions requires 3–5 live human raters. That is a process step this session cannot execute (no live raters available). The tooling is real and verified; the corpus itself is not yet populated. `foundry/gates/kot-calibration.ts` uses a documented fixture `JudgmentAggregate` in its place, clearly commented as a stand-in for data (not for the model/engine, which is real — see LAW 3 note in that file).
**Tier 1 decisions required:** none to proceed further in code; a live Delphi round (3–5 raters, 30 contested states) is an operational task outside this session's reach.

## W6 — Concordance fitness engine
**Status:** COMPLETE
**Gate:** `f(tel) × f(judg) × concordance`, strictly multiplicative, unit-tested → PASS
**Files:** `foundry/fitness/types.ts`, `foundry/fitness/index.ts`, `foundry/fitness/verify-fitness.ts`
**Verify:** `npm run verify:fitness` → exit 0
**Provenance:** n/a (fitness function itself; see W7 for a gate-result provenance record)
**Halt conditions triggered:** none
**Tier 1 decisions required:** none

## W7 — Gate suite + KoT calibration artifact
**Status:** COMPLETE
**Gate:** KoT must PASS all gates → **PASS** (gate-provenance, setback-frequency-in-range, expression-prohibition, experience-conformance, fitness-nonzero — all 5 checks green)
**Files:** `foundry/gates/suite.ts`, `foundry/gates/kot-calibration.ts`, `foundry/gates/verify-gates.ts`, `foundry/gates/verify-kot-calibration.ts`
**Verify:** `npm run verify:gates && npm run verify:kot` → exit 0
**Provenance:** `modelIdentity=engine-v6-kot-calibration`, `commitSha=56260bd20f0890b850170bd047b263e7cc8358a1`, `isStandIn=false`
**Halt conditions triggered:** none — KoT passed on the first calibration run, so no gate rewrite was required
**Tier 1 decisions required:** none. **W9 is now unblocked.**

## W8 — Reference baseline (Branch A determinism)
**Status:** COMPLETE
**Gate:** full-chain determinism (byte-identical) + Branch A audit log + branch_a_no_bots → PASS
**Files:** `game/determinism/fixed-point.ts`, `game/determinism/pipeline.ts`, `game/determinism/static-checks.ts`, `game/determinism/verify-determinism.ts`, `game/branch-a/constraint.ts`, `game/branch-a/message-contracts.ts`, `game/branch-a/audit-log.ts`, `game/branch-a/verify-branch-a.ts`
**Verify:** `npm run verify:determinism && npm run verify:branch-a` → exit 0
**Provenance:** n/a (infrastructure gate); each individual Branch A session's `BranchAAuditLog` carries its own seed-commit/reveal + signed timestamps (see `game/branch-a/audit-log.ts`)
**Halt conditions triggered:** none
**Tier 1 decisions required:** none

## W9 — Breeder
**Status:** COMPLETE
**Gate:** novelty gate enforced on every offspring; W7 precondition checked at runtime (`W7NotPassedError` if not) → PASS
**Files:** `foundry/breeder/index.ts`, `foundry/breeder/verify-breeder.ts`
**Verify:** `npm run verify:breeder` → exit 0
**Provenance:** breeding round itself carries no independent provenance; it consumes `runKotCalibration().gateResult.passed` directly (real integration, not a fabricated boolean — see test #2 in `verify-breeder.ts`)
**Halt conditions triggered:** none in this build; the module structurally refuses to run (throws `W7NotPassedError`) if W7 has not genuinely passed
**Tier 1 decisions required:** **before a real (non-fixture) breeding run**: the actual harvested contested-state corpus (W4, against a live deployed build) and the actual Delphi judgment corpus (W5, against live raters) are both still fixtures/pending. No code decision is needed — this is data collection, not implementation.

---

## §9 verify suite (all 18 named checks)
**Files:** `00_GOVERNANCE/verify-suite.ts`
**Verify:** `npm run verify:suite` → exit 0 (19/19 — 18 named + the W7 KoT gate)

## §6 child safety / economy
**Files:** `game/economy/types.ts`, `game/economy/rules.ts`, `game/economy/verify-economy.ts`
**Verify:** `npm run verify:economy` → exit 0 (19/19)

## DEF-01..09 register
**Files:** `00_GOVERNANCE/registers/FINDINGS.md`

---

## Overall halt/decision summary

| Item | Status |
|---|---|
| Halt conditions triggered | **None of H1–H6.** One **implicit H7-shaped gap**: W5's Delphi protocol requires live human raters this session cannot supply; documented above, does not block W6–W9 (fixture data used, clearly labeled as such). |
| Tier 1 decisions still required | None to continue implementation. Two **operational** (not code) items remain before any of this runs against real users: (1) run an actual W4 harvest against a live deployed build to get real contested states; (2) run an actual W5 Delphi round with 3–5 live human raters. Neither is something Tier 2 can substitute for. |
| Out of scope (per `DEC-2026-08-001`) | Real-money payment processing, KYC/age-verification vendor integration, live deployment of the staking/economy layer — not implemented, would need separate legal/compliance authorization. |

*End of Phase 1 (W1–W9) report.*

---

# PHASE 2 BUILD REPORT — §15 format

**Source:** `design_handoff_glassbox_v6_phase2/17_PHASE2_HANDOFF_COMPLETE.md` (v6.2.0)
**Authorization:** `DEC-2026-08-002`, Tier 1, 2026-08-01 — elections E1–E5
**Base commit (at report time):** `9cdcffdfd09e970759ddec587003172897114d4a`

## P1 — Persistence substrate + `Store`
**Status:** COMPLETE
**Gate:** Schema migrates clean; `branch_a_no_bots` a real DB CHECK; adapter parity green → **PASS**
**Files:**
`core/store/types.ts`, `core/store/sqlite.ts`, `core/store/postgres.ts`,
`core/store/migrations/0001_init.postgres.sql`, `core/store/migrations/0001_init.sqlite.sql`,
`core/store/verify-store.ts`,
`00_GOVERNANCE/verify-no-secrets.ts`, `00_GOVERNANCE/verify-no-prod-credentials-local.ts`,
`package.json` (added `pg`, `verify:store`, `verify:no-secrets`, `verify:no-prod-credentials-local`, `engines.node`),
`tsconfig.json` (added `core` to `include`)
**Verify:** `npm run verify` → exit 0 (165 checks: 143 Phase 1 + 16 store + 3 no-secrets + 3 no-prod-credentials-local, 0 failures). `npx tsc --noEmit` → exit 0.
**Provenance:** modelIdentity: `claude-sonnet-5` · commitSha: (uncommitted at report time — see note below) · isStandIn: **false** on both adapters (the Postgres arm ran against a real, disposably-provisioned `postgres:16-alpine` container, migrated and exercised for real, not a fixture standing in for one)
**Halt conditions triggered:** none of H1–H10. One thing worth recording even though it didn't halt: the ambient shell environment already carried a `DATABASE_URL` and Supabase keys (from `.env`/`setup-env.sh`) at verify time — see "Known issue" below. `verify:store` never used them; every PASS above is from the local SQLite adapter and a throwaway Docker-provisioned Postgres, never the ambient credential.
**Tier 1 decisions required:** none to continue to P2.
**Fixtures remaining:** 0 for P1's own scope. (Phase-wide "fixtures remaining" per §15 stays nonzero until P10 — P1 doesn't touch harvest/telemetry/rater fixtures.)

**Mechanical fix applied, not a spec deviation:** §3.2's schema lists `harvest_runs` (which references `organisms(id)`) before `organisms` is defined. That ordering isn't valid forward-only SQL — Postgres rejects a `REFERENCES` to a table that doesn't exist yet. `core/store/migrations/0001_init.postgres.sql` creates `organisms` before `harvest_runs`; every column, type, and constraint is otherwise verbatim from the doc. Noted per LAW 1 ("every claim is falsifiable by a machine check that exists and runs") — this fix is what makes "schema migrates clean" true rather than aspirational.

**Scoping decision:** of §14's checks tagged `core/store/`, P1 implements the ones with schema/interface support already in §3.2: `verify-store-parity`, `verify-no-vendor-leak`, `verify-branch-a-db-constraint`, `verify-branch-a-needs-opponent`, `verify-telemetry-schema-clean`, `verify-economy-columns-match`, `verify-deletion-cascade`, `verify-r1-anonymity`, `verify-rater-deletion`. `verify-cohort-disjoint` and `verify-consent-recorded` are deferred — §3.2 has no consent table or rater/playtester cohort column, and inventing one now would be schema invention ahead of the phase (P6/P11) that actually defines that data. Flagging this now rather than silently skipping it later.

**⚠ Known issue outside this build's scope — needs your attention before P9, and ideally before P2:**
The local `.env` (gitignored, never read by anything in P1's own code path except the new `verify-no-prod-credentials-local` scan) already contains `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — apparently written by `setup-env.sh`. Two problems:
1. `DATABASE_URL` is corrupted: several connection strings concatenated together, still containing the literal unresolved placeholder `[YOUR-PASSWORD]` mixed with what looks like a real password fragment. It doesn't parse to a usable connection.
2. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` look like live key values, sitting in the ambient shell environment (inherited by every process launched from this shell, not sandboxed to this repo).

Nothing in this build used or logged those values — `verify:store` explicitly falls back to a disposable Docker Postgres rather than trusting `DATABASE_URL` blindly, precisely because of this. But you should fix `setup-env.sh`'s write path (it looks like it appends instead of overwriting) and confirm whether that service-role key should be rotated, before P9 (LLM adapter layer) or any phase that actually reads these values in earnest.

---

## P1 — AMENDMENT: admin/user database split

**Status:** COMPLETE (supersedes the single-database version of P1 above)
**Trigger:** direct Tier 1 instruction, live in conversation, 2026-08-01 — not yet a numbered entry in `11_TIER1_ELECTIONS_DECISION_RECORD.md`. Recording it here per LAW 2 (provenance); recommend folding it into that record as its own entry if you want it preserved in that format.
**Decision:** two physically separate Supabase projects instead of one. `Glassbox_Labs/admin` (`tstwsszlkucmlozlttnn`, pre-existing) holds secrets/security data; `Glassbox_Labs/user` (`nimgivdwcslipgtgiann`, created this session, $0/month, free tier, org `libriopal's Org`) holds everything playtester/rater traffic reaches.
**Table split:**
- **admin:** `accounts`, `organisms`, `harvest_runs`, `gate_results`, `audit_log`, `converged_seeds`
- **user:** `sessions`, `session_events`, `telemetry_events`, `contested_states`, `rater_judgments`

**Gate:** Schema migrates clean on both physical databases; `branch_a_no_bots` a real DB CHECK; adapter parity green → **PASS**
**Files:** `core/store/migrations/0001_init.{postgres,sqlite}.{admin,user}.sql` (replaced the single-DB migration files — nothing had been committed against the old layout, so this is a clean replacement, not a live migration), `core/store/{sqlite,postgres}.ts` (rewritten for dual connections + cross-boundary soft-FK checks + explicit cascade), `core/store/verify-store.ts` (dual-container provisioning, 26 named checks), `setup-env.sh` / `start-claude.sh` / `.env.example` (rewritten for 8 persistence variables instead of 4)
**Verify:** `npm run verify` → exit 0 (175 checks: 143 Phase 1 + 26 store + 3 no-secrets + 3 no-prod-credentials-local). `npx tsc --noEmit` → exit 0.
**Provenance:** modelIdentity: `claude-sonnet-5` · isStandIn: **false** — schema applied for real to both live Supabase projects via the Supabase MCP (not just the disposable Docker parity proof, which also ran clean with two containers).

**Cost of the split, stated plainly (LAW 1 — every claim falsifiable):** four columns that were real `FOREIGN KEY` constraints in the single-DB design now cross a physical database boundary and cannot be expressed as SQL foreign keys at all — `sessions.account_id`, `contested_states.harvest_run_id`, `audit_log.session_id`, `converged_seeds.contested_state_id`. Each is now a plain column, existence-checked in application code at write time (`verify-*-soft-fk` checks, 4 of the 26), with cascade-on-delete for `deleteAccount` written explicitly rather than left to the database. There is no cross-database transaction between two separate Postgres instances, so that cascade is best-effort in program order, not atomic — documented in both adapters' source, not hidden.

**Tool issue encountered:** `apply_migration` failed twice with "socket connection closed unexpectedly" against the admin project; `execute_sql` succeeded immediately with identical SQL. Used `execute_sql` for both projects' schema application as a result — noting this in case it recurs, since `apply_migration` is the tool meant to track migration history and `execute_sql` doesn't.

**Security finding surfaced and fixed, with your explicit go-ahead:** Supabase's own advisory flagged Row Level Security disabled on all 11 new tables across both projects at creation — meaning the anon/publishable key could read or write everything, including the admin-side secrets this split exists to protect, and could read individual (non-anonymized) rater judgments directly, bypassing the §3.4 anonymity query layer entirely. Enabled RLS with zero policies on all 11 tables (confirmed via `list_tables`) — this is a deny-all posture for the anon/authenticated roles; the server's service-role key bypasses RLS and is unaffected, matching the server-mediated design already in the handoff doc.

**Credential hygiene finding — action still needed from you:** the local `.env` this session found had `DATABASE_URL` *and* `GEMINI_API_KEY` corrupted (concatenated/duplicated values, one still containing the unresolved `[YOUR-PASSWORD]` placeholder) — not an isolated glitch, a systemic issue with whatever wrote that file. `.env` was regenerated: `SUPABASE_URL_ADMIN`, `SUPABASE_ANON_KEY_ADMIN`, `SUPABASE_URL_USER`, `SUPABASE_ANON_KEY_USER` are populated with values fetched directly from the live projects via the Supabase MCP and are known-correct. `DATABASE_URL_ADMIN`, `DATABASE_URL_USER`, `SUPABASE_SERVICE_ROLE_KEY_ADMIN`, `SUPABASE_SERVICE_ROLE_KEY_USER`, and all four LLM keys were left blank rather than carried forward unverified — none of these are retrievable via the Supabase MCP (by design; the DB password and service-role key aren't exposed through it). Run the rewritten `./setup-env.sh` to enter these six values (hidden input, never echoed) directly from each project's Settings > Database / Settings > API pages. Given the corruption already found, consider rotating the service-role keys and LLM keys rather than trusting whatever was in the old file, even for the ones that looked well-formed.

**Halt conditions triggered:** none of H1–H10. H9 ("would commit a credential") is exactly what motivated leaving six values blank rather than guessing at them.
**Tier 1 decisions required:** whether to formalize this split as a numbered election in `11_TIER1_ELECTIONS_DECISION_RECORD.md`.
**Fixtures remaining:** 0 for P1's scope.

---

*End of V6_BUILD_REPORT.md.*
