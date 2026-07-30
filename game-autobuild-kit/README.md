# game-autobuild-kit

Governed solo-developer game/app automation kit, implemented **phase-gated** under the
GLASSBOX governance package v3.0.0 (`../governance/`).

## Build status

| Phase | Focus | Status |
|-------|-------|--------|
| **P1** | Governance foundation (`00_GOVERNANCE/`, `CLAUDE_CODE_ENTRYPOINT.md`, `.mcp.json`) | ✅ **Built** |
| **P3** | Deterministic core: seedable PRNG + cooperative scheduler + record/replay entropy | ✅ **Built & verified** (5/5 invariants) |
| **P4** | DSL grammar + research protocol + placeholder `\|S₀\|` + **verifier** (CETI reachability reduction: safety/liveness gate) | ✅ **Built & verified** (9/9 invariants) |
| **P2** | Static compilation engine (LogicStamp: DSL → zero-drift JSON contract + hash; dynamic constructs barred) | ✅ **Built & verified** (8/8 invariants) |
| **P5** | Evolutionary engine (islands, MWUA, crossover + LLM-channel mutation, ERC, migration, stopping; verifier-gated) | ✅ **Built & verified** (9/9; deterministic, no keys) |
| P6 | Consensus & Merkle engine | ⬜ Unlocked |
| P7 | Durable orchestration (Mastra TS) | ⬜ Unlocked |

**Verify:** `npm install && npm run verify` — runs all four suites: compilation (8) + safety (9) + determinism (5) + evolution (9) = **31 invariants, all exit 0**.

**API keys:** none are needed for P1–P4 or the verified P5 run (deterministic mock operator). Keys matter only for a **live** LLM mutation run in the offline Research Domain, routed by `02_CONTROLLER/modelRouter.ts` (`ANTHROPIC_API_KEY` / `COHERE_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY`). `RealLlmRewrite` refuses to run without its key, so nothing calls a provider by accident.

**Note on P2 scope:** the LogicStamp engine here normalizes the **evolvable DSL** (what crosses the Research→Execution boundary) into a bit-identical contract. A `ts-morph`-based adapter for arbitrary TypeScript source is a parallel follow-on; it needs the external library and API verification before it's coded (tracked in `UNKNOWNS.md`).

## Why phase-gated

Tier 1 approved implementation execution (`../governance/DEC-2026-07-026_TIER1_APPROVAL.md`), but
GLASSBOX Gate G3 requires **zero open Critical findings** and a conforming Approval Record. P1 (the
governance/audit substrate) carries no execution-lock risk and is built now; P2–P7 unlock only when
the conditions in `00_GOVERNANCE/NUCLEUS.md` §4 are met (D2 ratify · D3 elect · D4 seed corpus ·
D6 params · G3 sign). Every architectural claim the later phases will implement is already grounded
in admissible sources: `../governance/SourceMatrix.md`.

## Layout (current)

```
game-autobuild-kit/
├── CLAUDE_CODE_ENTRYPOINT.md      # operational protocol + gate check
├── .mcp.json                      # Mastra docs MCP server config
└── 00_GOVERNANCE/
    ├── NUCLEUS.md                 # core rules, determinism hierarchy, unlock conditions
    └── registers/
        ├── ASSUMPTIONS.md  DECISIONS.md   EVIDENCE.md   LINEAGE.md
        ├── RISKS.md        UNKNOWNS.md    CONTRADICTIONS.md  IMPLEMENTATION_BLOCKERS.md
```

Modules `01_RESEARCH/`, `02_CONTROLLER/`, `03_ASSET_PIPELINE/`, `04_EDI/`, `05_CREDIT_ROUTING/`
are created when their phase unlocks.
