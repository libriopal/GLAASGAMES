# TIER1_DECISION_SHEET.md

**For:** Human Approver (Tier 1)
**From:** AI Auditor (Tier 2)
**Protocol:** v2.0.0
**Date:** 2026-07-29

Everything the automated layers can produce has been produced. Nine decisions remain, none of which I have authority to make. D0 blocks all others.

---

## D0 — Tier 1 Identity *(blocks everything)*

No Tier 1 identity, key, or signature exists anywhere in this protocol instance. Every `PENDING-HUMAN` placeholder currently references an unnamed party, which means Gates G3 and G5 are structurally unreachable regardless of how the other eight decisions go.

**Required:** name the Human Approver, and state what constitutes their signature in practice — a registered keypair, a named sign-off in a repo, or an explicit written approval in-session. The protocol assumes public-key verification; if that's not how you intend to operate, say so and I'll amend 02 § Evidence Standards to match reality rather than leaving an unenforceable requirement in place.

☐ Tier 1 is: ________________
☐ Signature mechanism: ________________

---

## D1 — Terminal status election *(CNTR-2026-07-005)*

☐ **A — `REJECTED FOR REVISION`.** v2.0.0-rc1 stays in the audit loop; findings are worked and the plan is resubmitted. Resumable.
☐ **B — `VETO — NEW PLAN REQUIRED`.** v2.0.0-rc1 is abandoned; a new plan starts at iteration 1. Non-resumable.

*Auditor recommendation: A. The defects are evidentiary, not architectural — the architecture survived audit largely intact.*

---

## D2 — Bibliography *(FND-2026-07-011, Critical)*

Nine source slots are BLOCKED in `AUDIT_RESPONSE_RECORD.md` §5. I will not populate them from recall.

☐ Supply sources for slots 001–009
☐ Supply partial list; remaining slots stay BLOCKED and their claims are struck from the plan
☐ Declare the architecture as original work with no external claims requiring citation *(this closes the finding but changes what the plan is asserting)*

---

## D3 — The 42% statistic *(FND-2026-07-012, Critical)*

☐ **A** — supply the source; claim restored
☐ **B** — formally downgrade D7 durable-orchestration justification to qualitative reasoning; claim stays struck

---

## D4 — Human seed corpus `|S₀|` *(MAJ-001)*

`C(σ)` is bound at 1.00 — zero tolerance — against a corpus that does not exist. Needed: contents, versioning method, ownership, acceptance criteria.

☐ Corpus defined: ________________
☐ Alternatively: relax `VALIDATION_CONSISTENCY_THRESHOLD` to 0.98 (still in range) to survive a single flaky seed

---

## D5 — LLM reproducibility policy *(MAJ-003 / UNK-2026-07-002)*

☐ **A — Execution-boundary determinism only.** Provider/version unpinned; the search is not reproducible, only the promoted contract is. Cheaper, and consistent with the plan's stated Research/Execution split.
☐ **B — Full search reproducibility.** Pin provider, model version, temperature, and seed; capture every interaction as Evidence. Expensive, and vulnerable to provider deprecation.

*Auditor note: the plan implicitly assumes A but never says so, which is why ASM-2026-07-002 is unverified.*

---

## D6 — Parameter ratification *(11 parameters, plan §4.3)*

The proposed values are auditor recommendations, not facts. Unratified parameters revert to unbound and fail G2.

☐ Ratify as proposed
☐ Ratify with changes: ________________

Most consequential: `MWUA_LAMBDA` = 0.15 and `DIVERSITY_THRESHOLD` = 0.70 × log₂(200) jointly determine whether the search resists monoculture. I picked defensible numbers; I have no empirical basis for them.

---

## D7 — Search Strategy rubric *(CNTR-2026-07-007)*

☐ Ratify the six-dimension rubric in `AUDIT_RESPONSE_RECORD.md` §6
☐ Amend: ________________

Ratification permits a rescore. Until then no Governance Score is gate-valid, including the 72/100.

---

## D8 — Negative search provision *(FND-2026-07-014, new Major)*

The plan optimizes fitness with no mechanism for retaining disconfirming candidates. Everything that fails is discarded, so the search cannot accumulate evidence about *why* regions of the program space fail.

☐ Add a negative-search provision to plan §6
☐ Accept as a known limitation; log to Research Debt Register

---

## What happens after

D0 + D1 unblock the lifecycle. D2 + D3 close the Criticals. D4–D8 close the Majors. Then: rescore under the ratified rubric, re-audit as iteration 2, and G3 becomes reachable.

Without D0, none of the rest can be recorded as valid evidence — they'd be unsigned entries, which is the exact defect that invalidated the VETO.
