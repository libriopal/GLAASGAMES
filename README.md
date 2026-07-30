# Glassbox Labs — GLASSBOX Governance Package & Scite Deep-Research Deliverables

This repository holds the **GLASSBOX governance package (v3.0.0)** and the Tier 2 **Scite deep-research** evidence artifacts produced against it.

## What this is

The GLASSBOX protocol governs the audit and execution of a deterministic, genetically-evolvable
TypeScript game architecture. Under it, an **AI Auditor (Tier 2)** may audit and generate evidence,
but the eight-phase research workflow stays **LOCKED** until a **Human Approver (Tier 1)** records
`APPROVED FOR RESEARCH EXECUTION` at Gate **G3**. The session was halted `INCOMPLETE` on 2026-07-29
with two open Critical findings that "require evidence, not review":

- **FND-2026-07-011** — the D2 bibliography (nine blocked source slots) + the `|S₀|` seed corpus (D4).
- **FND-2026-07-012** — the unsourced "over 42%" cloud-billing statistic (D3).

Both were blocked by the **anti-fabrication rule** (model recall is inadmissible). Scite MCP deep
research resolves exactly that: it returns **real, DOI-addressable, retraction-screened** sources.

## Deep-research deliverables (all Tier 2; research remains LOCKED)

| File | Purpose |
|------|---------|
| `governance/AUD-2026-07-005_EVIDENCE_ACQUISITION_RECORD.md` | Populates the 9 source slots with 12 admissible sources; dispositions FND-011 (bibliography) and FND-012 (42% → downgrade). |
| `governance/AUD-2026-07-006_IMPLEMENTATION_EVIDENCE_DOSSIER.md` | Grounds the `game-autobuild-kit` blueprint in admissible sources; module→evidence map; governance-gated build sequence. |
| `governance/SourceMatrix.md` | Populated Source Matrix, `SRC-2026-07-001…016` (DOIs). |
| `governance/EvidenceRegister.md` | Evidence entries `EVT-2026-07-004…008`. |
| `governance/SESSION_STATE_2026-07-30.md` | Resumption state: evidence supplied for D2/D3; research still LOCKED; G3 PENDING-HUMAN. |
| `governance/00_…`–`08_…`, `MASTER_PROMPT.md`, audit/decision records | The v3.0.0 governance package (baseline context, unchanged). |

## What remains for Tier 1 (the Human Approver)

1. **Ratify D2** — the bibliography in `SourceMatrix.md`.
2. **Elect D3** — Option B (downgrade the "42%" claim to qualitative) is recommended; the figure has no admissible source.
3. **Supply D4** — the `|S₀|` human-verified seed corpus (or relax `VALIDATION_CONSISTENCY_THRESHOLD` to 0.98).
4. **Gate G3** — only a Tier 1 signature unlocks research execution / the Design-Execution build.

Nothing here writes `APPROVED FOR RESEARCH EXECUTION` or signs a Tier 1 gate — by design (Immutable Directive 6).
