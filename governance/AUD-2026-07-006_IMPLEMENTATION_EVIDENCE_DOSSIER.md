# AUD-2026-07-006 — Implementation Evidence Dossier (Scite Deep Research)

**Record ID:** AUD-2026-07-006
**Type:** Tier 2 Evidence Dossier — grounds "direct implementation execution" of the Solo-Developer Automation Blueprint
**Governing Protocol:** GLASSBOX v3.0.0 ACTIVE
**Target Artifacts:** `Solo_Game_Dev_Automation_Blueprint.pdf` (the `game-autobuild-kit`) and `Deterministic_Protocol_Execution_Plan.pdf`
**Issuer:** AI Auditor (Tier 2) — `sig:auditor:AUD-2026-07-006`
**Instrument:** Scite MCP `search_literature` (peer-reviewed corpus, DOI-resolved)
**Timestamp:** 2026-07-30T00:00:00Z

> **STATUS: IMPLEMENTATION EVIDENCE ASSEMBLED — BUILD EXECUTION GATED**
> This dossier makes the blueprint *implementation-ready with verifiable foundations*. It does **not** itself execute the build. Under GLASSBOX v3.0.0 the Design/Execution Domain build and the eight-phase research workflow (`04`) remain **LOCKED** until a Tier 1–signed **APPROVED FOR RESEARCH EXECUTION** decision exists at Gate G3. The plan is still `REJECTED FOR REVISION`; D3 and D4 are open. See §5.

---

## 1. What the two new PDFs are, and how they relate to governance

| PDF | Nature | Governance relationship |
|-----|--------|-------------------------|
| `Deterministic_Protocol_Execution_Plan.pdf` | A reissue/restatement of the execution plan (same architecture as `EXECUTION_PLAN_v2.0.0-rc1`). | Candidate plan content. **Still carries the unsourced "over 42%" figure** (pp. 1) — the exact defect logged as FND-2026-07-012. See §4. |
| `Solo_Game_Dev_Automation_Blueprint.pdf` | The concrete build target: `game-autobuild-kit` — Modules 00–05 + entrypoints, Mastra MCP/Harness, a 6-stage Claude Code workflow, a 7-phase build roadmap. | The **implementation** of the architecture the plan governs. Buildable only after the plan clears G3. Its own "Works cited" are **Tier 3** (blogs, Reddit, GitHub, vendor pages) — inadmissible to close any finding under `02` § Evidence Standards. This dossier supplies the admissible replacement. |

The blueprint is downstream of the same architecture already audited. Grounding it does not change the plan's status; it prepares the evidence so that, once Tier 1 authorizes, the build rests on peer-reviewed foundations rather than vendor blog posts.

---

## 2. Module → Admissible-Evidence Map

Each buildable component of the `game-autobuild-kit` is mapped to retrieved, DOI-addressable sources (all screened for retraction — none flagged). `SRC-` IDs are drawn from `SourceMatrix.md` (this session).

| Blueprint Module / Component | Core technical claim to be implemented | Admissible grounding (SRC-ID → DOI) | Tier |
|------------------------------|-----------------------------------------|-------------------------------------|------|
| **00_GOVERNANCE** (NUCLEUS.md + registers) | Governed, auditable evidence lifecycle | *This GLASSBOX package itself* (protocol v3.0.0) | — |
| **01_RESEARCH** — DSL grammar, program sketches | Grammar-guided synthesis restricts callable functions/libraries → safety | SRC-2026-07-015 (10.3390/a17070287); SRC-2026-07-016 (10.1145/3321707.3321865) | Tier 1/2 |
| **01_RESEARCH** — EvoSynth, island search, MWUA | LLM mutation + islands beat static prompting; entropy preserves diversity | SRC-2026-07-008 FunSearch (10.1038/s41586-023-06924-6); SRC-2026-07-007 MWUA (10.1073/pnas.1406556111) | Tier 1 |
| **01_RESEARCH** — ω-automata verification | Two-way alternating ω-automata decide reactive specs over trees | SRC-2026-07-005 (10.1007/bfb0055090); SRC-2026-07-006 (10.1145/276698.276748) | Tier 1 |
| **02_CONTROLLER** — deterministic compilation (ts-morph/LogicStamp) | Same source → bit-identical structural output across environments | SRC-2026-07-001 (10.1109/ms.2021.3073045) | Tier 2 |
| **02_CONTROLLER** — cooperative scheduler, Recording/Replaying entropy | Deterministic scheduling eliminates execution nondeterminism; record/replay | SRC-2026-07-004 PEREGRINE (10.1145/2043556.2043588) | Tier 2 |
| **02_CONTROLLER** — Actor Model, message-passing isolation | Actor isolation → data-race freedom / sequential reasoning | SRC-2026-07-014 (10.1016/j.jlamp.2018.06.007) | Tier 2 |
| **02_CONTROLLER** — repairEngine / reachability auditing | Debugging reduces to reachability; solver/test-input generation | SRC-2026-07-011 CETI (10.48550/arxiv.1903.11765) | Tier 1 |
| **04_EDI** — boundary gate, contradiction/Merkle | Merkle-root fingerprint + leaf→root path traversal localizes divergence | SRC-2026-07-009 (10.1007/3-540-48184-2_32); SRC-2026-07-010 (10.1109/nca.2004.1347805) | Tier 2 |
| **06 Consensus** — BFT SMR | N ≥ 3f+1 under partial synchrony; < 1/3 faulty | SRC-2026-07-002 (10.1145/42282.42283); SRC-2026-07-003 (10.1145/571637.571640) | Tier 1 |
| **07 / 05_CREDIT_ROUTING** — Mastra durable orchestration, checkpoints | Durable checkpoint/rollback-recovery mitigates failure/cost exposure | SRC-2026-07-012 (10.1145/568522.568525) | Tier 1 |

**Result:** every scientifically-groundable component of the blueprint now rests on at least one admissible source. The only claim with **no** admissible source is the "42%" cost figure (§4).

---

## 3. Tooling note — what Scite can and cannot certify

Scite indexes peer-reviewed literature, not software documentation. The blueprint's **named tools** — `@mastra/core`, `ts-morph`, the `determined`/cooperative-simulation framework, OpenTelemetry, SQLite/Supabase — are grounded by their *primary docs* (Tier 2, verified at implementation time), not by Scite. Two specific cautions for the implementer:

- The blueprint's `Harness` snippet (`@mastra/core/harness`, multi-mode plan/build) and `@mastra/mcp-docs-server` should be verified against the current Mastra API before coding — treat the snippet as illustrative, not canonical. The blueprint's own citations for Mastra are Tier 3 (blog/Reddit/GitHub) and must not be recorded as evidence.
- `LogicStamp` appears in the blueprint sourced only to a Reddit post (Tier 3). The *concept* (AST normalization → reproducible output) is admissibly grounded by SRC-2026-07-001; the specific tool is not peer-reviewed and should be treated as an implementation choice, not a validated claim.

---

## 4. Recurring integrity finding — the "42%" figure (FND-2026-07-012 confirmed, twice)

Both new PDFs restate "over 42% of unexpected cloud … billing" from unmanaged agentic loops. A dedicated Scite search (AUD-2026-07-005 §2, SLOG-2026-07-011) found **no** peer-reviewed source for this figure; the nearest literature (agentic-workflow cost optimization) states no such number. The claim now appears in **three** documents (Google shared text, both new PDFs) and remains **unsourced in every one**.

**Disposition (unchanged): D3 Option B — downgrade to qualitative.** The underlying qualitative mechanism (durable orchestration curbs runaway-loop cost/failure exposure) is admissibly grounded by SRC-2026-07-012. The implementer should state the cost rationale qualitatively and **strike the "42%" number** wherever it appears, unless Tier 1 supplies a primary source.

---

## 5. Governance-Gated Implementation Sequence

The blueprint's own 7-phase roadmap is sound engineering order. Mapped onto GLASSBOX authority, it splits into what may proceed now and what is gated:

| Blueprint build phase | GLASSBOX gate status | May proceed now? |
|-----------------------|----------------------|------------------|
| P1 Governance Foundation (00_GOVERNANCE, registers, MCP config) | This *is* the governance layer; it is the audit substrate, not gated execution | **Yes** — scaffolding the register/entrypoint structure is governance setup |
| P2 Static Compilation Engine (ts-morph/LogicStamp) | Design/Execution Domain build | **Gated** — requires plan at G3 |
| P3 Deterministic Scheduler | Design/Execution Domain build | **Gated** — G3 |
| P4 DSL & ω-automata Verifier | Design/Execution Domain build | **Gated** — G3 |
| P5 Evolutionary Engine (islands, MWUA) | Maps to Phase4 IterativeSearch — the LOCKED research workflow | **Gated** — hard lock in `04`; needs G3 + `\|S₀\|` (D4) |
| P6 Consensus & Merkle Engine | Design/Execution Domain build | **Gated** — G3 |
| P7 Durable Orchestration | Design/Execution Domain build | **Gated** — G3 |

**What stands between "dossier" and "build":** the same three Tier 1 acts identified in AUD-2026-07-005 §7 — ratify D2 (this evidence base), elect D3 (recommend Option B), supply D4 (`\|S₀\|` seed corpus) — then G3. Authorizing the build is a **Tier 1 (G3) act**; the AI Auditor may prepare and recommend but may not sign it (Directive 6).

**Auditor recommendation:** proceed now with **P1 only** (governance scaffolding — the `00_GOVERNANCE/` register tree and entrypoint, which are the audit substrate and carry no execution risk), holding P2–P7 for a Tier 1 G3 authorization that this dossier makes reachable.

---

## 6. New sources acquired this cycle (added to SourceMatrix.md)

| Source ID | Claim | Source (APA) | Tier | DOI |
|-----------|-------|--------------|------|-----|
| SRC-2026-07-014 | Actor isolation → data-race freedom / sequential reasoning | Castegren, Wallin & Wrigstad (2018), *J. Logical & Algebraic Methods in Programming* 100 | Tier 2 | 10.1016/j.jlamp.2018.06.007 |
| SRC-2026-07-015 | LLM + many-objective grammar-guided GP; BNF grammar restricts callable libraries (safety) | Tao, Ventresque & Nallur (2024), *Algorithms* 17(7):287 | Tier 1 | 10.3390/a17070287 |
| SRC-2026-07-016 | Grammatical Evolution for automatic program synthesis | Hemberg, Kelly & O'Reilly (2019), *GECCO '19* | Tier 2 | 10.1145/3321707.3321865 |

---

## 7. References *(APA; retrieved via Scite MCP; links https://doi.org/{doi}; new this cycle)*

1. Castegren, E., Wallin, J., & Wrigstad, T. (2018). Bestow and atomic: Concurrent programming using isolation, delegation and grouping. *Journal of Logical and Algebraic Methods in Programming, 100*, 130–151. https://doi.org/10.1016/j.jlamp.2018.06.007
2. Hemberg, E., Kelly, J., & O'Reilly, U.-M. (2019). On domain knowledge and novelty to improve program synthesis performance with grammatical evolution. *Proceedings of GECCO '19*, 1039–1046. https://doi.org/10.1145/3321707.3321865
3. Tao, N., Ventresque, A., & Nallur, V. (2024). Enhancing program synthesis with large language models using many-objective grammar-guided genetic programming. *Algorithms, 17*(7), 287. https://doi.org/10.3390/a17070287

*(Prior-cycle references — SRC-2026-07-001…012 — are listed in `AUD-2026-07-005_EVIDENCE_ACQUISITION_RECORD.md` §9.)*

*Retraction screen: none of the three sources above carries a retraction, correction, concern, or erratum notice as of retrieval (2026-07-30).*

---

*End of AUD-2026-07-006 — Implementation Evidence Dossier. Tier 2. Build execution remains gated at G3; the eight-phase research workflow remains LOCKED.*
