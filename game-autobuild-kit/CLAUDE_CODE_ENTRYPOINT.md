# CLAUDE_CODE_ENTRYPOINT.md — Operational Protocol for the game-autobuild-kit

**Kit Version:** 0.1.0 (P1)
**Read order:** this file → `00_GOVERNANCE/NUCLEUS.md` → `00_GOVERNANCE/registers/` → `../../governance/` (GLASSBOX authority).

## Role
Claude Code operates this kit as a governed systems engineer: parse a request, plan structurally, compile deterministically, validate by simulation, persist durably, and update registers — **within the phase gates in `NUCLEUS.md` §0/§4**.

## Gate check (run before any build action)
1. Read `NUCLEUS.md` §0 phase table and §4 unlock conditions.
2. If the request targets **P1** artifacts (governance/registers/entrypoint/MCP): proceed.
3. If the request targets **P2–P7** artifacts: **STOP.** Verify a Tier 1 G3 Approval Record exists in `../../governance/` meeting `NUCLEUS.md` §4. If absent, refuse and append a row to `00_GOVERNANCE/registers/IMPLEMENTATION_BLOCKERS.md`. Do not write the approval yourself (GLASSBOX Immutable Directive 6).

## Six-stage execution workflow (applies once a phase is unlocked)
1. **State Audit** — read `NUCLEUS.md` and `registers/`; confirm boundaries and open blockers.
2. **Structural AST Planning** — express changes as DSL program sketches, not imperative additions.
3. **LogicStamp Context Compilation** — normalize via ts-morph into a JSON context bundle (P2).
4. **Simulation Validation** — cooperative-scheduler + seeded-PRNG playtest for state stability (P3–P5).
5. **Durable Persistence** — commit step results (Mastra TS / SQLite/Postgres); emit OpenTelemetry traces (P7).
6. **Register Update** — update `LINEAGE.md`, `DECISIONS.md`, `EVIDENCE.md` with AST hashes, metrics, versions.

## Evidence discipline
Every empirical or architectural claim entering a register must cite an admissible source (Tier 1 peer-reviewed / Tier 2 primary tooling). The current admissible base is `../../governance/SourceMatrix.md` (SRC-2026-07-001…016). **Never** cite model recall (Tier 0) or blog/Reddit/GitHub/vendor pages (Tier 3) as evidence — this is why the source blueprint's own "Works cited" are not used here.

## MCP
`.mcp.json` configures the Mastra docs MCP server. Verify the `@mastra/*` API against current docs before writing P7 orchestration code; treat any code snippet from the source blueprint as illustrative, not canonical.
