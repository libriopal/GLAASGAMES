# DECISIONS.md

Architectural decisions for the game-autobuild-kit. Authoritative Decision Register: `../../../governance/`.

| ID | Decision | Rationale | Tier | Status |
|----|----------|-----------|------|--------|
| KIT-DEC-001 | Build P1 governance foundation only; keep P2–P7 locked. | Tier 1 approval (DEC-2026-07-026) scoped to P1; G3 preconditions unmet. | Tier 2 (records Tier 1 auth) | SUPERSEDED by KIT-DEC-004 |
| KIT-DEC-004 | Unlock P2–P7; build deterministic core (P3) + DSL/corpus substrate (P4). | Gate G3 APPROVED (`../../../governance/DEC-2026-07-027…`): D2/D3/D4/D6 closed, zero open Criticals. | Tier 2 (records Tier 1 G3) | ACTIVE |
| KIT-DEC-002 | Adopt GLASSBOX v3.0.0 as governing authority; kit registers defer to `../../../governance/`. | Single source of truth; avoid divergent governance. | Tier 2 | ACTIVE |
| KIT-DEC-003 | Use only admissible sources (Tier 1/2) from `SourceMatrix.md`; reject the source blueprint's Tier-3 works-cited. | `02` § Evidence Standards. | Tier 2 | ACTIVE |
