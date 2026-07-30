# RISKS.md

| ID | Risk | Category | Impact | Mitigation | Status |
|----|------|----------|--------|------------|--------|
| KIT-RSK-001 | `VALIDATION_CONSISTENCY_THRESHOLD`=1.00 leaves zero tolerance against a nonexistent corpus. | Governance | High | Define D4 or relax to 0.98. | OPEN |
| KIT-RSK-002 | Building P2–P7 on an unscoped approval reproduces the voided-VETO defect. | Governance | High | Gate enforced in NUCLEUS.md §4 + entrypoint gate check. | MITIGATED |
| KIT-RSK-003 | Unsourced "42%" cost claim propagates into design. | Governance | Medium | D3 Option B; claim struck pending primary source. | MITIGATING |
| KIT-RSK-004 | Static AST analysis misses runtime-resolved constructs. | Technical | High | Bar eval/dynamic import/template-literal codegen (NUCLEUS §1.2). | PLANNED |
