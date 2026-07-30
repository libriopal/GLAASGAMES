# ASSUMPTIONS.md

| ID | Assumption | Source | Verification | Status |
|----|-----------|--------|--------------|--------|
| KIT-ASM-001 | Confining LLM mutation to the Research Domain keeps the Execution Domain deterministic. | Core paradigm | Contract-only reproduction test (P6) | UNVERIFIED |
| KIT-ASM-002 | ts-morph AST traversal is stable across compiler minor versions. | P2 design | Pin version; hash-compare across 3 envs | UNVERIFIED |
| KIT-ASM-003 | A BNF DSL restricting callable libraries yields safe evolved logic. | Tao et al. 2024 (10.3390/a17070287) | ω-automata verification (P4) | SUPPORTED (source), UNVERIFIED (impl) |
