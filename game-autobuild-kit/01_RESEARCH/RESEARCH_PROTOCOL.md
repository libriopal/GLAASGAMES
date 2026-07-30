# RESEARCH_PROTOCOL.md — Research Domain (01_RESEARCH)

**Status:** UNLOCKED (Gate G3 APPROVED, `../../governance/DEC-2026-07-027…`). Out-of-band; never modifies live node state.

## Search space
Programs are derivations of `DSL_GRAMMAR.bnf` (grammar-restricted synthesis — the grammar *is* the safety boundary; no arbitrary code, `eval`, or imports). Program **sketches** wrap fixed structure around evolvable holes.

## Population & selection (parameters ratified D6, `../../governance/DEC-2026-07-027…` §2)
- Islands: 8 × 200 genomes; migration every 25 generations.
- Selection: tournament (size 3) under **MWUA**, weak-selection regime, `U(σ) = Σ pᵢGᵢ + λ·H(P)`, **λ = 0.15**. *Grounded: Chastain et al. 2014 (10.1073/pnas.1406556111).*
- Mutation: (1) structural subtree crossover; (2) LLM program rewrite `mutate(g)=g⊕Δg`. *Grounded: FunSearch, Romera‑Paredes et al. 2023 (10.1038/s41586-023-06924-6).*
- Bounds: max tree depth 10; mutation attempts 2; MAX_GENERATIONS 500; FITNESS_PLATEAU_WINDOW 40.

## Verification (P4)
Every candidate is model-checked by a two-way alternating ω-automaton over its control-flow tree before it may cross the EDI boundary. *Grounded: Vardi 1998 (10.1007/bfb0055090); Kupferman & Vardi 1998 (10.1145/276698.276748).* Debugging reduces to reachability (CETI, 10.48550/arxiv.1903.11765).

## Evaluation (P5) — consistency at 0.98
Candidates are scored against `seed-corpus.placeholder.json` (`|S₀|`). Acceptance: `C(σ) ≥ 0.98` (D4 relaxation) — one flaky seed tolerated. **Replace the placeholder corpus with the authoritative human-verified set before G5.**

## Boundary
Only statically-verified, normalized JSON/AST contracts cross into the Execution Domain (`04_EDI/`). The LLM interaction that produced a contract never crosses; each promoted artifact must reproduce bit-identically from its contract alone.

Authoritative evidence for all claims above: `../../governance/SourceMatrix.md`.
