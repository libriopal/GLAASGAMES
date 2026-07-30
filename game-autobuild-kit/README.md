# game-autobuild-kit

Governed solo-developer game/app automation kit, implemented **phase-gated** under the
GLASSBOX governance package v3.0.0 (`../governance/`).

## Build status

| Phase | Focus | Status |
|-------|-------|--------|
| **P1** | Governance foundation (`00_GOVERNANCE/`, `CLAUDE_CODE_ENTRYPOINT.md`, `.mcp.json`) | ✅ **Built** |
| **P3** | Deterministic core: seedable PRNG + cooperative scheduler + record/replay entropy | ✅ **Built & verified** (5/5 invariants) |
| **P4** | DSL grammar (`01_RESEARCH/DSL_GRAMMAR.bnf`) + research protocol + placeholder `\|S₀\|` | ✅ **Substrate built** (ω-automata verifier pending) |
| P2 | Static compilation engine (ts-morph / LogicStamp) | ⬜ Unlocked — next |
| P5 | Evolutionary engine (islands, MWUA) | ⬜ Unlocked — runs at C(σ)≥0.98, placeholder corpus |
| P6 | Consensus & Merkle engine | ⬜ Unlocked |
| P7 | Durable orchestration (Mastra TS) | ⬜ Unlocked |

**Verify the determinism core:** `npm run verify:determinism` (or `npx tsx 02_CONTROLLER/verify-determinism.ts`).

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
