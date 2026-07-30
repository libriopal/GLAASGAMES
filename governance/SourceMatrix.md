# SourceMatrix.md

**Deliverable:** `05_OUTPUT_SPECIFICATION.md` § 8 (Source Matrix)
**Produced by:** AUD-2026-07-005 (Scite deep research), AI Auditor (Tier 2)
**Governing Protocol:** v3.0.0 ACTIVE
**Status:** Populated — pending Tier 1 ratification (Decision D2)
**Note:** `Location` is the source DOI (persistent, resolvable immutable reference). Every source was retrieved via the Scite MCP literature index and screened for retraction/correction/concern notices (none present). No entry was written from model recall.

| Source ID | SRC-SLOT | Source Type | Location (DOI → https://doi.org/{doi}) | Evidence Tier | Last Accessed | Status |
|-----------|----------|-------------|----------------------------------------|---------------|---------------|--------|
| SRC-2026-07-001 | 001 Deterministic compilation → bit-identical output | ExternalTool/Publication | 10.1109/ms.2021.3073045 | Tier 2 | 2026-07-30 | VALID |
| SRC-2026-07-002 | 002 BFT SMR optimal resilience, partial synchrony | Publication | 10.1145/42282.42283 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-003 | 002 N ≥ 3f+1 practical BFT (< 1/3 faulty) | Publication | 10.1145/571637.571640 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-004 | 003 Deterministic scheduling eliminates nondeterminism | Publication | 10.1145/2043556.2043588 | Tier 2 | 2026-07-30 | VALID |
| SRC-2026-07-005 | 004 Two-way alternating ω-automata over trees | Publication | 10.1007/bfb0055090 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-006 | 004 Weak alternating / tree-automata emptiness | Publication | 10.1145/276698.276748 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-007 | 005 MWUA weak selection: fitness–entropy near linkage equilibrium | Publication | 10.1073/pnas.1406556111 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-008 | 006 LLM mutation + evolutionary islands > static prompting | Publication | 10.1038/s41586-023-06924-6 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-009 | 007 Merkle hash tree: root fingerprint + leaf→root path verification | Publication | 10.1007/3-540-48184-2_32 | Tier 2 | 2026-07-30 | VALID |
| SRC-2026-07-010 | 007 Merkle-tree memory-integrity (operational path traversal) | Publication | 10.1109/nca.2004.1347805 | Tier 2 | 2026-07-30 | VALID |
| SRC-2026-07-011 | 008 Reduction of repair/debugging to reachability (CETI) | Publication | 10.48550/arxiv.1903.11765 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-012 | 009 Durable checkpoint/rollback-recovery (mechanism) | Publication | 10.1145/568522.568525 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-013 | 009 Quantitative "42%" cloud-billing figure | — | — | Tier 0 (inadmissible) | 2026-07-30 | UNSOURCED — see FND-2026-07-012 |
| SRC-2026-07-014 | IMPL Actor isolation → data-race freedom (Layer-2 / Module 02) | Publication | 10.1016/j.jlamp.2018.06.007 | Tier 2 | 2026-07-30 | VALID |
| SRC-2026-07-015 | IMPL LLM + many-objective grammar-guided GP; grammar restricts callable libraries (Module 01) | Publication | 10.3390/a17070287 | Tier 1 | 2026-07-30 | VALID |
| SRC-2026-07-016 | IMPL Grammatical Evolution program synthesis (Module 01) | Publication | 10.1145/3321707.3321865 | Tier 2 | 2026-07-30 | VALID |

**Implementation grounding (AUD-2026-07-006):** SRC-2026-07-014…016 ground the buildable components of the `game-autobuild-kit`. The blueprint's own "Works cited" are Tier 3 (blog/Reddit/GitHub/vendor) and are **inadmissible** to close findings; these entries replace them.

**Citation Chaining status:** the Source Matrix now forms a continuous chain from each D2–D7 architectural claim to prior work, except the "42%" quantitative figure (SRC-2026-07-013), which has no admissible source and is dispositioned by downgrade (FND-2026-07-012, D3 Option B).
