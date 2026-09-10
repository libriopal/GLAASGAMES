# FINDINGS.md — DEF-01..09 Register (§0.7)

Per `07_CLAUDE_CODE_HANDOFF_V6.md` §0.7: "DEF-01..09 land here as Findings." This
register maps each Ecosystem6 defect to its structural counter-measure and the
file(s) that implement/enforce it in this build.

| ID | Ecosystem6 defect | Counter-measure | Implemented in |
|---|---|---|---|
| DEF-01 | Match-3 scored incorrectly (×35 fudge; "pair" gate) | Per-engine correctness tests from source rules before any gate run; an engine needing an arbitrary normalizer to resemble its siblings is presumed wrong | `game/determinism/fixed-point.ts`, `game/determinism/pipeline.ts` (fixed-point scoring, no ad-hoc fudge factors) |
| DEF-02 | King of Tokyo was the wrong game (no opponent, no contested centre) | Experience Conformance Criterion (§6.4) | `foundry/gates/suite.ts` (`checkExperienceConformance`) |
| DEF-02-GEN | All 5 engines shared one interaction loop | Structural loci + novelty gate (§2) | `families/genome/types.ts`, `families/genome/novelty.ts` |
| DEF-03 | Governance was prose (15 invariants, 0 checks) | Everything is a verify-suite check | `00_GOVERNANCE/verify-suite.ts` + 12 per-work-item `verify:*` scripts, all wired into `npm run verify` |
| DEF-04 | Determinism tested in isolation only | Full-chain byte-identical test | `game/determinism/pipeline.ts` (`runFullChain`) — exercises seed→board→render→submit→score→validate as one chain, not an isolated PRNG harness |
| DEF-05 | Monte Carlo ran a simplified model (FR 0.038 vs 0.85 target) | LAW 3 — no gate/MC run without valid, non-stand-in provenance | `foundry/fitness/types.ts` (`GateProvenance`), enforced at runtime in `foundry/fitness/index.ts` and `foundry/gates/suite.ts` |
| DEF-06 | Client/server contract drift (`SUBMIT_CHAIN_FACES`) | Contract test per message type | `game/branch-a/message-contracts.ts` |
| DEF-07 | Two contradictory compliance truths in one package | Gate provenance records | `foundry/gates/suite.ts` (`isValidProvenance`) |
| DEF-08 | Platform lock-in made defects unfixable | Substrate Sovereignty (§0.6) | No vendor SDK dependency introduced anywhere in `families/`, `foundry/`, `corpus/`, `game/` — all engine logic is plain TypeScript + Node built-ins (`node:crypto`) |
| DEF-09 | Identity churn across 3 workspace names | One repo: `Glassbox_Labs` | This build lives in `libriopal/Glassbox_Labs`, additively alongside `game-autobuild-kit/` per §0.7 |

---

*Population per §0.7. Cross-references `governance/FINDINGS_REGISTER.md` (a
separate, earlier audit lineage over the governance protocol package itself —
not to be confused with this DEF-01..09 register).*

---

# EINCOL P3 handoff — R1..R6 execution record

Source: `design_handoff_glassbox_p3_eincol/`, produced by a Claude Design agent
running EINCOL against `libriopal/GLAASGAMES@25b31485f208`. Per
`MENTAL_STATE_TRANSFER.md` §1 that package is a **hypothesis with a test
attached**; the run below owns the verdict. Six fields per revision, per §4.

Executed on branch `claude/mcp-http-transport-ekgq6g`, which is
`main@25b3148` (the merge of PR #1) plus the Stage 2 commit. See DISAGREEMENT-0.

## DISAGREEMENT-0 — `handoff_p2/` does not exist at the cited commit

`EINCOL_RUN_01.md` §1 reports, as measured counts at `25b31485f208`:
`handoff_p2/08_VERIFY_CHECKLIST.md` `[BUILD]` checks = 16; of those with a named
negative control = 0; `handoff_p2` files = 10 spec / 0 executable.
`MENTAL_STATE_TRANSFER.md` §2 lists `handoff_p2/{00_START_HERE,
08_VERIFY_CHECKLIST, CLAUDE_CODE_PROMPT}` among files "read at full fidelity".

Checked against the real tree:

    git ls-tree -r --name-only origin/main | grep -c handoff_p2   -> 0
    git ls-tree -r --name-only origin/main | grep -iE "checklist|handoff|START_HERE"  -> (empty)
    .gitmodules -> core, dream, devos.  No handoff_p2 submodule.
    file count on main -> 306, not the 285 reported.

`handoff_p2/` is absent from `main@25b3148` under that name, under any
checklist-like name, and as a submodule. The other five files the package cites
as read ARE present and, where checked, its claims about them are accurate.

Consequence: **R6's subject does not exist.** R6 is not implementable as
written. See the R6 block for what was done instead. The five other revisions
are unaffected — they target files that are really there.

Per §1: the run is right. Recorded rather than worked around.

## R1  §9 coverage claim is a string literal
  landed:            yes
  negative control:  (a) delete the `// 12. verify-anti-manipulation` block from
                     `00_GOVERNANCE/verify-suite.ts`; (b) restore it and add
                     `check('verify-not-in-the-spec', true, 'probe');`
  seen to fail:      (a) exit 1 — `COVERAGE FAIL: verify-anti-manipulation
                     declared in §9 manifest, never exercised` /
                     `18 checks exercised · 18 declared in §9 · 1 coverage failure(s)`
                     (b) exit 1 — `COVERAGE FAIL: verify-not-in-the-spec
                     exercised but never declared in the §9 manifest` /
                     `20 checks exercised · 18 declared in §9 · 1 coverage failure(s)`
  seen to pass:      exit 0 after each revert —
                     `19 checks exercised · 18 declared in §9 · coverage closed`
  vacuous check:     not vacuous. The perturbation removes a member from
                     `checkNames`, which is the array `coverage()` consumes; the
                     exercised count moved 19->18 and 19->20 in the two
                     directions, so the perturbation demonstrably reached the
                     value the assertion reads.
  disagreement:      none on the finding — CONFIRMED at rung 1, and more visibly
                     than the package claimed. The pre-fix suite printed
                     `19 named checks exercised.` and then
                     `all 18 named checks correctly distinguish PASS from FAIL`
                     on the very next line: two different numbers, adjacent, exit 0.
                     The package described this as a latent risk; it was an
                     observable contradiction in the shipped output.
                     Both patch anchors matched verbatim, and the 18 manifest
                     names matched the 18 real `check()` names exactly, in order,
                     with the 19th correctly listed as the NON_SECTION_9 exempt.

## R2  "any throw" is not "refused"
  landed:            yes
  negative control:  NC-A replace the guard body with
                     `throw new TypeError("Cannot read properties of undefined
                     (reading 'breakdown')")` — an incidental fault, not a
                     refusal. NC-B delete the guard entirely.
  seen to fail:      NC-A exit 1 — `FAIL verify-no-standin-models — stand-in
                     refused with StandInProvenanceError(field=wrong error:
                     TypeError); real provenance accepted`
                     NC-B exit 1 — `...StandInProvenanceError(field=none);
                     real provenance accepted`
  seen to pass:      exit 0 after revert — `PASS verify-no-standin-models —
                     stand-in refused with StandInProvenanceError(field=isStandIn);
                     real provenance accepted`
  vacuous check:     not vacuous, and the proof is a DELTA rather than an
                     assertion. Under NC-A the code is byte-identical for both
                     versions of the check; the OLD bare-catch check printed
                     `PASS` and the suite exited 0, the NEW check printed the
                     wrong class and exited 1. The perturbation therefore reached
                     something the new check reads and the old one could not see.
                     (A secondary probe — calling computeFitness directly with
                     the guard deleted — returned a value rather than throwing,
                     confirming the guard is the only thing refusing; the value
                     printed NaN because the ad-hoc fixture did not match the
                     real telemetry shape, so that probe is reported as weak and
                     the NC-A delta is the load-bearing evidence.)
  disagreement:      YES — the package's stated negative control is WRONG, and
                     the finding survives anyway.

                     REVISIONS.md R2 and the patch header both assert: "Remove
                     the isStandIn guard from computeFitness. verify-no-standin-models
                     must exit non-zero. BEFORE the fix it passes — that delta is
                     the proof the fix is load-bearing."

                     Run: with the guard removed and the OLD bare-catch check in
                     place, the check FAILED (exit 1, `FAIL verify-no-standin-models
                     — stand-in provenance refused by computeFitness`). It did not
                     pass. The predicted delta does not exist for that perturbation.

                     Why the package was wrong: it assumed the malformed
                     `isStandIn: true as unknown as false` cast would raise an
                     incidental TypeError downstream. It does not. At runtime the
                     value is an ordinary boolean, nothing after the guard reads
                     it, and `computeFitness` runs to completion — so removing the
                     guard removes the ONLY throw, and the bare catch correctly
                     observes that nothing threw.

                     The finding itself is still CONFIRMED, by a control the
                     package did not name: the bare catch cannot distinguish the
                     provenance refusal from ANY OTHER throw. Substituting an
                     incidental TypeError for the refusal leaves the old check
                     printing PASS at exit 0 (NC-A above). That is EINCOL §4's
                     "dropped connection mistaken for a refusal", demonstrated at
                     rung 1 — the defect is real, the stated instrument for it was
                     not.
  scope note:        `GateProvenance.isStandIn` was widened from the literal
                     `false` to `boolean`, as the patch directed. The literal type
                     was never enforcing LAW 3 — the runtime guard is — and it was
                     the reason every caller testing the refusal had to write
                     `true as unknown as false`, an ill-typed cast that was itself
                     part of the defect. The second occurrence of that cast, in
                     `foundry/fitness/verify-fitness.ts:83`, was dropped in the
                     same pass: same defect, same revision, not scope widening.

## R3  the render witness is a function argument
  landed:            PARTIAL — the seam landed, the closure did not. See below.
  negative control:  `economyVisible` -> `return true`, with the recorder's
                     granted set printed in both runs.
  seen to fail:      exit 1 — `economy surfaces granted to: [adult, ex1, minor]`
                     / `FAIL verify-economy-invisibility — economy granted to
                     [adult, ex1, minor] — no minor, no self-excluded account`
  seen to pass:      exit 0 — `economy surfaces granted to: [adult]` /
                     `PASS verify-economy-invisibility`
  vacuous check:     not vacuous. The printed sets differ between the two runs
                     ([adult] vs [adult, ex1, minor]), which is the test the
                     handoff prompt names: if both runs printed the same set the
                     perturbation reached nothing the system reads. The set is
                     COMPUTED by `recorder.gate()` calling `economyVisible`, not
                     supplied by the caller, so inverting the rule moves it.
  disagreement:      YES, twice, and the second one blocks the revision as specified.

                     (1) THE STATED CONTROL DOES NOT ISOLATE THE FIX. R3 says
                     inverting `economyVisible` must make `verify-economy-invisibility`
                     exit non-zero. Run against the UNFIXED code, it already did:
                     exit 1, `FAIL verify-economy-invisibility — economy rendered
                     for an under-21 account is caught`. The old oracle was not
                     blind to that perturbation, so passing it is not evidence the
                     revision changed anything. What the old oracle could not see
                     is a broken RENDERER, because no renderer was in the loop —
                     which is the real finding and is narrower than the control
                     tests for.

                     (2) THERE IS NO RENDER PATH TO INSTRUMENT. The prompt
                     instructs: "Locate every existing caller of economyVisible
                     outside game/economy/rules.ts before writing anything — grep
                     first, do not create a parallel path." The grep returns two
                     callers in the whole repository:
                         game/economy/rules.ts:29        (inside the oracle itself)
                         game/economy/verify-economy.ts  (a test)
                     `game/economy/` is three files — rules, types, verify. No
                     file under `web/` imports it. There is no economy UI in this
                     tree. Routing "each caller" through `recorder.gate()` would
                     have meant routing a TEST through it, making the recorder's
                     witness the test that consumes it — the same subject-as-its-
                     own-witness defect R3 exists to close, moved one layer down,
                     and the parallel path the prompt forbids.

                     WHAT LANDED INSTEAD, and why it is not the closure:
                       - `game/economy/surface-recorder.ts` — the seam. `gate()`
                         is decision and record in one call, so a surface cannot
                         show the economy without the recorder knowing.
                       - `verifyEconomyInvisibilityFromRecorder(accounts, recorder)`
                         in rules.ts, typed structurally so rules.ts takes no
                         dependency on the recorder module. `economyVisible` is
                         UNCHANGED, as R3 requires.
                       - check 10 now drives three accounts through the recorder
                         instead of asserting the literal `['minor']`. That is a
                         real improvement — the witness is derived rather than
                         written — but it is a witness to the RULE, not to
                         RENDERING, and must not be reported as the latter.

  OPEN (carried):    R3's gap is not closed and cannot be closed at this commit.
                     The oracle will not become a witness to rendering until an
                     economy render surface exists to drive the recorder. When one
                     is built it must call `EconomySurfaceRecorder.gate()` and
                     nothing else; the seam and the oracle are in place waiting for
                     it. Until then `verify-economy-invisibility` proves the rule
                     is correct and proves nothing about what a user saw.
                     `verify-economy-gate-sole-path` (the closure check named in
                     the prompt) is NOT built: with zero render surfaces it would
                     assert over an empty set and pass trivially, which is the
                     vacuous control this revision is about.

## R5  the thing verified and the thing hashed are different objects
  WRITTEN ANSWER TO THE REQUIRED QUESTION (prompt STEP 4):
                     "Do compile() and parseProgram() already share a normalizer
                     internally?"  --> YES. THIS IS CASE B.
                     `02_CONTROLLER/logicStamp.ts:62-63`:
                         export function compile(source: string): CompileResult {
                           const program = parseProgram(source);
                     `compile()` calls the SAME parser stage 1 calls, on the SAME
                     string. There are not two independent derivations; there is
                     one pure function invoked twice. Per the prompt, the
                     double-derivation fix is therefore unnecessary and the
                     correct revision is a one-line assertion plus a comment.
                     `compileFromProgram` was NOT implemented.
  landed:            yes — as the Case-B assertion, not as the specified patch.
  negative control:  make stage 3 compile different text than stage 2 verified:
                     `compile(source.replace(" AND ", " OR "))`. This models the
                     real residual risk (a refactor handing stage 3 a variant
                     string), which the double-derivation patch would not have.
  seen to fail:      `{"ok":false,"stage":"reconcile","reason":"the program that
                     was verified is not the program that was hashed — stage 2
                     and stage 3 derived different contracts from the same input"}`
  seen to pass:      restored -> `{"ok":true,"contractJson":"{\"schema\":
                     \"glassbox/dsl-contract/v1\",...}"}`; and the pre-existing
                     `04_EDI/verify-boundary.ts` still exits 0,
                     `ALL BOUNDARY/BUDGET INVARIANTS HELD.`
  vacuous check:     not vacuous. The perturbation changes the token stream stage
                     3 parses, so `compiledProgram` genuinely differs from the
                     verified `program`, and the gate's return value changes from
                     ok:true to stage:"reconcile". A control that merely appended
                     a byte to a normalized form (as the patch proposed) would
                     have perturbed a function this codebase does not have.
  disagreement:      YES — R5's premise is wrong, and MENTAL_STATE_TRANSFER §5
                     predicted this exact outcome.

                     The package asserts gate.ts holds "two independent
                     derivations from the same text, with no assertion that they
                     agree", and proposed a rival `compileFromProgram()` so the
                     two could be compared. But `compile()` IS `parseProgram()`
                     plus canonicalisation — the package read `04_EDI/gate.ts`
                     (which it lists as read at full fidelity) and did not read
                     `02_CONTROLLER/logicStamp.ts` (which is not in its read
                     list). §2's rule applies: the file it did not read wins.

                     Implementing the patch as written would have MANUFACTURED
                     the divergence it claimed to guard against — a second
                     normalisation path that could drift from the first, added to
                     a system that had exactly one.

                     The residual defect is real but far smaller, and it is
                     precisely the one §5 named for Case B: nothing in the code
                     said the invariant held. It held by accident of both call
                     sites closing over the same `source` binding. The assertion
                     makes it explicit and costs nothing, because `compile()`
                     already returns the program it parsed.

                     SECONDARY DISAGREEMENT: the patch warns "Exclude source
                     positions (loc/start/end/raw) from the canonical form or the
                     reconciliation will fail on every input." This grammar's
                     `Program` carries no position fields at all, so plain
                     structural equality is sound and no exclusion was needed.

  OPEN (not done):   `verify-edi-contract-reconciles` was NOT added as a
                     standalone §9 check. Adding it would require a new name in
                     the SECTION_9_CHECKS manifest, and §9 is a governance
                     document this pass has no mandate to extend — R1 closed the
                     manifest precisely so names cannot be added casually. The
                     reconcile branch is exercised by the probe recorded above;
                     wiring it into the suite is proposed, not done.

────────────────────────────────────────────────────────────────────────────────
MC-RETRACTION — the Monte Carlo balance result, withdrawn and replaced
────────────────────────────────────────────────────────────────────────────────

  LANDED:            `foundry/montecarlo/harness.ts` rebuilt (7-rung ladder,
                     degeneracy gate, scrambled-belief control);
                     `foundry/montecarlo/variants.ts` rebuilt (69 candidates over
                     axes that measurably move the game);
                     `engine/verify/verify-montecarlo.ts` gained M4a, M7, M8, M9;
                     `lattice/round.ts` gained optional `deviation` + `chargeMax`;
                     `lattice/lattice-gen.ts` gained the `deviation` parameter and
                     exports `REGION`.

  WHAT WAS CLAIMED:  Commit 333553e reported skill depth 0.432, dominance 0.406,
                     headroom 0.042, and the headline "a one-line heuristic
                     captures 40.6% of achievable value, and knowing the hidden
                     lattice adds only ~1.4 points on top." That headline is
                     RETRACTED. On the shipped board the hidden lattice is worth
                     20.2 points over the best trivial policy.

  HOW IT FAILED:     Nine probes, each run against the executing code.

                     X-MC1  The "learnable" rung learned almost nothing. Charge
                            travels two hops, so two cells rise per bank, and the
                            rung recorded a link only when EXACTLY ONE rose —
                            discarding 443 of 994 observations (44.6%). At
                            decision time only 1.52% of open cells had a usable
                            learned target. It was charge-chasing 98.5% of the
                            time, so `headroom` measured the policy's ignorance.

                     X-MC3  `clairvoyant` was not the ceiling of what a player can
                            infer. Handed only the true region flows, an agent
                            scores 88.1 against clairvoyant's 97.7 — the ~9.6
                            point remainder is the 25% of links that deviate from
                            their region, learnable one cell at a time and never
                            in aggregate. Normalising skill against 97.7 charged
                            the player for information the generator deliberately
                            made un-inferable.

                     X-MC4  Only SIX distinct chi-square values existed across all
                            69 candidates. Faces were sampled from the opening
                            deal, which `turns` and `refill` never touch, so the
                            24 fair variants produced ONE identical number and
                            each loaded distribution produced one, nine times
                            over. "45/45 caught, 0/24 false positives" was five
                            tests and one test, reported as 45 and 24.

                     X-MC6  `refill` IS INERT. Across refill 1/2/4/6 at 6, 12 and
                            20 turns the round DIGEST was identical every time —
                            after banking one cell exactly one cell is empty, so
                            `refill > 1` has nothing to fill. The 69 candidates
                            were 20 distinct games.

                     X-MC7  The REPLACEMENT rung was falsified too, by a
                            scrambled-belief control. A third arm — a policy that
                            never learns and always believes "every cell feeds
                            north" — scored 70.8, beating the real learner's 66.7.
                            A zero-information constant cannot beat inference
                            unless the SCORING SHAPE is doing the work, and it
                            was: `expectedFace x (1 + charge)` rewards banking
                            next to big numbers whatever you believe, because the
                            link IS one of the neighbours.

                     X-MC8  So the missing rung was the strongest TRIVIAL policy:
                            "bank the cell surrounded by the biggest numbers",
                            69.9 with no memory at all. The original 40.6% was
                            measured against a weaker trivial baseline than the
                            game admits.

  NEGATIVE CONTROL:  The scrambled-belief arm, which is now M7. Same board, same
                     policy shape, same learning — belief rotated 180 degrees.
                     Shipped board: learner 70.3, scrambled 60.8, so the belief is
                     worth 9.5 points. This isolates inference from the scoring
                     shape, which no earlier version of the ladder did.

  SEEN TO FAIL:      Every new check was watched failing before it was trusted.
                     M8 fired twice on the author's OWN catalogue — first on three
                     Block D duplicates of Block A points, then on a fourth
                     (`{turns:20, deviation:1, chargeMax:1}` hashes identically to
                     `A-t20-d1`, because on a lattice whose links ignore their
                     region so few links are live that charge never reaches even
                     the default cap). M4 fired on dominance 189.9%. M8's probe
                     policy was itself caught being too weak: banking cell 0
                     forever never lets charge reach its cap, so `chargeMax`
                     looked as inert as `refill`.

  SEEN TO PASS:      verify-montecarlo M0-M9 exit 0; `verify:suite` 19 checks,
                     coverage closed; tsc --noEmit clean. M5 holds the shipped
                     game at score 32 / digest 3740550746 across all three new
                     config fields.

  VACUOUS CHECK:     Found and fixed, in this suite's own fairness gate. The five
                     loaded distributions scored chi-square 69, 451, 494, 1537 and
                     7200 against a critical value of 20.515 — the mildest was
                     3.4x over the line, so "caught" proved only that the gate
                     detects the obvious. The catalogue now carries `marginal-6`,
                     a 10% single-face bias that the gate DOES NOT CATCH, and M9
                     publishes the power curve: 0% at +5%, 5% at +10%, 78% at
                     +25%, 100% at +50%. The gate's sensitivity is now a measured
                     number with a stated floor.

  DISAGREEMENT:      With the previous commit, which is the author's own. 333553e
                     flagged the exploitability finding as "deserving
                     investigation, not a conclusion" and that hedge was correct —
                     the investigation overturned it. The direction matters: the
                     retracted claim made the game look WORSE than it is, so the
                     error was not self-flattering, but it was still wrong and was
                     published as a headline.

  NOT DONE:          The independent EINCOL step-5 audit. An evaluator was
                     dispatched and terminated on a session rate limit before
                     returning a verdict. Everything above is the author's own
                     falsification (EINCOL step 4), which is NOT a substitute —
                     a parser cannot witness itself, and this file has now twice
                     recorded the author's own instrument deceiving the author.
                     The audit is owed and is the next action on this work.

  OPEN QUESTION:     The ranking now favours `chargeMax: 1` variants (best:
                     C-flat1-t6-d2 at depth 0.744 against the shipped 0.596).
                     Capping charge at 1 removes a multiplier that MEASUREMENT
                     SHOWS NEVER BINDS ANYWAY — charge never exceeds 2 under real
                     play, so the shipped CHARGE_MAX of 3 is unreachable. Whether
                     that ranking is a real design finding or another artifact is
                     NOT resolved here and must not be acted on before the audit.

────────────────────────────────────────────────────────────────────────────────
BOOT-001 — master execution prompt, synthesized and independently audited
────────────────────────────────────────────────────────────────────────────────

  LANDED:            `original_prompt_baseline.md` (pristine, 98 lines, never
                     edited); `MASTER_EXECUTION_PROMPT.md` v1.2.0 LOCKED.

  RESEARCH WITNESS:  Tavily API, 2 advanced queries, 12 results. Four findings
                     were load-bearing and each is cited at the clause it
                     hardened:
                       - arXiv 2509.18970 (hallucination survey): self-verification
                         is "model-internal... without relying on external
                         validators". Independently corroborates EINCOL rung 3.
                       - Parallel.ai: per-step error rates compound
                         multiplicatively across a 5-step chain -> §2.
                       - Arthur.ai: a self-correction loop retries "until the
                         response passes OR HITS A RETRY LIMIT" -> §5.1.
                       - ReDeEP via mem0: hallucination arises when internal
                         knowledge overpowers prompt-attention -> §1.

  INDEPENDENT AUDIT: `@cf/google/gemma-4-26b-a4b-it` on Cloudflare Workers AI.
                     Different vendor, different weights, no stake. This is a
                     STRONGER witness than a subagent, which shares weights and
                     priors with the executing model.

  SEEN TO FAIL:      v1.0.0 was VETOED. The audit was not a formality and its two
                     sharpest findings were ones the author had not considered:

                     HOLLOWING — "An agent could 'optimize' §1 by refining the
                     DEFINITION of a witness... to accept 'high-confidence
                     internal reasoning' as a proxy for a 'measured number'. This
                     is not 'removing a gate', but it is 'hollowing it out'."
                     A redefinition leaves every gate textually intact while
                     draining it, so a diff review sees nothing missing. Fixed by
                     freezing the definitions (A6).

                     SEMANTIC DRIFT — the v1.0.0 no-progress detector defined
                     progress as "a file changed", which is satisfiable by
                     "rephrasing documentation... changing variable names",
                     producing "a zombie agent that consumes massive tokens while
                     claiming to work." Progress is now defined by the WITNESS,
                     not the diff (A2).

                     Then v1.1.0 was found to contain a NEW defect v1.0.0 lacked:
                     the five-phase pipeline had no post-Code execution of the
                     harness, so nothing in the sequence ever checked the
                     implementation. Fixed as A7.

  SEEN TO PASS:      v1.2.0 — A1..A7 all OK, "NEW DEFECTS: none", "INFINITE LOOP
                     POSSIBLE: no", VERDICT: APPROVED.

  VACUOUS CHECK:     Guarded against directly. The auditor was NOT asked "is this
                     good"; it was asked six adversarial questions with a forced
                     APPROVED/VETOED line, and the first round returned VETOED —
                     so the check demonstrably can fail. An audit that had
                     approved v1.0.0 would have been the vacuous one.

  DISAGREEMENT:      Two auditor revisions were adopted WITH DEVIATION, recorded
                     at the clause rather than silently:

                     A3 specified halting at "80% of allocated budget". No token
                     meter is exposed to this core, so an 80% figure would be a
                     number invented to look precise — which §1 forbids.
                     Substituted: halt on the first hard rate-limit or
                     session-limit response, or on exhausting the cycle budget
                     agreed at the last HITL gate. All three are observable.

                     A5 specified `git reset --hard <checkpoint>` on a failed
                     verify. Adopted only where the checkpoint is a COMMIT already
                     containing every piece of work in the tree; an unrelated
                     uncommitted change is stashed first. A blind `--hard` against
                     a dirty tree destroys work the loop never owned, and no audit
                     finding licenses that.

  CONSEQUENCE FOR    §3 as approved (A1) would have HALTED the previous cycle.
  THE PRIOR CYCLE:   That cycle dispatched an evaluator, the evaluator terminated
                     on a session rate limit, and execution CONTINUED to publish a
                     headline that a later self-falsification retracted (see
                     MC-RETRACTION above). Under A1 an unreachable witness is a
                     missing phase artifact and the pipeline stops. The rule was
                     derived from the research, then found to indict a specific
                     failure already in this register.

  STILL OPEN:        The MC-RETRACTION independent audit remains OWED. A second
                     evaluator is running at the time of writing and has not
                     returned. Under §3 that claim is not closed.

────────────────────────────────────────────────────────────────────────────────
MC-VETO — the retraction is itself VETOED by the independent audit
────────────────────────────────────────────────────────────────────────────────

  STATUS:            The MC-RETRACTION headline above ("the hidden lattice is
                     worth 20.2 points over the best trivial policy") is
                     WITHDRAWN PENDING REVISION. It is a 60-seed maximum for a
                     quantity that converges 3.8 points lower, and it is ~52%
                     overstated once the trivial ladder is corrected. Do not cite
                     it. The corrected converged figure the auditor measured is
                     ~7.5 points; it is recorded here as the auditor's number, NOT
                     yet reproduced by this author, and is therefore itself open.

  WITNESS:           Independent adversarial audit, EINCOL rung 3, dispatched
                     under §3 of MASTER_EXECUTION_PROMPT.md. It ran its own
                     probes against the executing code, reported paired means with
                     95% CIs, and left `git status` clean.

  VERDICT:           VETOED. Twelve required revisions. Six of seven questions put
                     to it resolved against the author.

  THE CRITICAL ONE   S1. `neighbourMean` divides the neighbour faces by the count
  (S1):              of LIVE neighbours, discarding the most important trivial
                     fact on the board — how many of the four directions have a
                     live target at all, i.e. the probability of getting the
                     multiplier rather than the consolation payout. Removing the
                     division gives `neighbourSum`, describable in the same one
                     sentence the file demands: "bank the cell with the biggest
                     total of numbers around it."

                     Shipped config, 400 paired seeds:
                       chargeAware      62.65
                       neighbourAware   70.90   (this author's "strongest trivial")
                       neighbourMax     66.72
                       secondHop        78.71   (+7.81 +-2.23)
                       expectedPayout   78.89   (+7.99 +-2.10)
                       interiorBias     79.79   (+8.89 +-1.85)
                       neighbourSum     79.87   (+8.97 +-2.36)

                     Four one-liners beat it, all outside the 95% CI. Adding only
                     `neighbourSum` to this author's own suite, changing nothing
                     else, at MC_SEEDS=120:
                       span      17.9 -> 9.8
                       dominance 0.596 -> 0.780
                       headroom  0.318 -> 0.000
                       degenerate 5/39 -> 18/39
                       M7 FAILS: learner 74.7 does not beat best trivial 77.1

  S2:                M7 measures the COST OF BEING WRONG, not the value of being
                     right, and is 2.74x overstated. Inverting a belief is
                     strictly worse than holding none, because the inverted
                     direction is guaranteed not to be the link more often than
                     chance. Paired, 800 seeds:
                       learner - inverted        +10.37 +-1.38  (published as
                                                                "value of inference")
                       learner - random belief    +7.92 +-1.29
                       learner - NO belief        +3.79 +-1.12  (the true figure)
                       inverted - no belief       -7.23 +-1.54  (self-inflicted)
                     "The belief is worth 9.5 points" should read ~3.8.

                     Worse: on the UNLEARNABLE board the learner scores 1.91
                     BELOW no-belief. It tallies a modal direction out of pure
                     noise and acts on it. That is the apophenia failure
                     `lattice-gen.ts` names as the safety rationale for the entire
                     design, occurring inside this author's own instrument,
                     uncaught.

  S3:                `regionOracle` is not a ceiling. `learnerPlus` — charge trail
                     only, NO privileged information — reaches 88.08 against the
                     "ceiling" of 87.58. A denominator an unprivileged policy
                     already attains is not a bound, and `skillDepth` has no
                     interpretation. It is also badly played: pricing the same
                     four directions against the real payout rule gains 2.3
                     points with no extra information.

  S4:                The degeneracy gate is UNPOWERED, not fitted. On seeds
                     1001-1120 instead of 1-120, ALL FIVE published top-five
                     survivors flip to degenerate. The threshold (2 points) is
                     smaller than the 95% CI of the statistic it gates (+-2.5 to
                     +-8.3). The M4a positive control passes at every threshold
                     from 0.5 to 8 and therefore constrains nothing.

  S5, AND THE        The `chargeMax: 1` ranking is an ARTIFACT, by exactly the
  CLAIM THAT WAS     denominator mechanic M4a was built to stop. Every one of the
  SIMPLY WRONG:      top ten survivors has skillDepth BIT-IDENTICAL to dominance,
                     which happens only when the learner adds nothing — the suite
                     was silently ranking by exploitability. Capping charge drops
                     the denominator 45.9 -> 31.3 and starves the learner
                     (observations per round 9.23 -> 6.67).

                     AND: "charge never exceeds 2 under real play, so the shipped
                     CHARGE_MAX of 3 NEVER BINDS" IS FALSE. Charge histogram, 300
                     seeds, shipped config — the cap binds under FIVE OF SIX
                     rungs including the learner. It reaches 3 under blind,
                     greedy, neighbourAware, neighbourSum and regionFlow. It was
                     measured under `chargeAware`, the ONE policy that banks
                     charge away and structurally cannot reach the cap. Same class
                     of error as S6: a property measured through an instrument
                     that cannot exhibit it.

  S6:                M8's probe MANUFACTURES distinctness. Under `leastCharged`,
                     chargeMax 3/4/5/8 produce four different digests; under a
                     policy resembling play they are one game, byte for byte. A
                     check that certifies four identical games as distinct is not
                     a distinctness check. Also: digest-distinct is not
                     hypothesis-distinct — `A-t12-d8` vs `A-t12-d64` differ by
                     -0.71 +-2.07, inside the noise, while variants.ts cites those
                     very gaps as proof deviation "measurably moves the game".

  S7:                THREE different numbers are published for one quantity: 20.2
                     (this register), ~16.8 (harness header), 17.9 (what the
                     suite prints today). Seed sweep: 30->14.0, 60->20.2,
                     120->17.9, 240->16.7, 960->16.4 +-1.7. The published headline
                     is the single highest point in the sweep. Nothing in M0-M9
                     asserts it, so the suite prints a new number over a green run.

  VACUOUS CHECK:     This audit is the opposite of vacuous: it VETOED, with
                     reproduced measurements and deleted probe files. The author's
                     own suite still exits 0 on the unmodified tree — which is the
                     finding, not a defence.

  DISAGREEMENT:      None recorded. The author has not yet reproduced these
                     numbers independently. Every figure above is attributed to
                     the auditor and must be re-derived locally before it is
                     itself treated as established — the same standard that
                     produced this veto.

  THE PROCESS NOTE   Quoted because it is the most useful sentence in the audit:
  THAT MATTERS:      "The pattern across all three is identical: a rung of the
                     ladder the author did not think of, discovered only by an
                     adversarial arm. The structural fix is not a better rung — it
                     is that NO LADDER RUNG MAY BE PUBLISHED WITHOUT A SEARCH FOR
                     A STRONGER SIBLING THAT THE SUITE ITSELF RUNS."

                     That is a check, not a resolution, and it is the one revision
                     that would have caught all three failures. It is proposed for
                     the next cycle.

  NOT DONE:          All twelve required revisions. This entry RECORDS the veto;
                     it resolves nothing. Under §0 of MASTER_EXECUTION_PROMPT.md a
                     Tier 2 core may not mark a governance finding resolved, and
                     under §5.4 it may not widen scope to a twelve-item
                     remediation without a Tier 1 instruction. Both await the
                     human at the HITL gate.

────────────────────────────────────────────────────────────────────────────────
MC-C2 — cycle 2: the suite now searches for the rung the author missed
────────────────────────────────────────────────────────────────────────────────

  LANDED:            `foundry/montecarlo/siblings.ts` (NEW — generated grammar of
                     memoryless trivial policies); `searchSiblings()` in
                     harness.ts; M10 SIBLING SEARCH and M11 LEARNER FLOOR in
                     verify-montecarlo.ts; corrected ladder and inference control.

  REPRODUCED FIRST:  The veto's numbers were re-derived locally before being acted
                     on, per §1 of MASTER_EXECUTION_PROMPT.md. 400 paired seeds:
                       S1 CONFIRMED to the decimal — nbrSum 79.87 vs the declared
                          best trivial 70.90 (+8.97 +-2.37).
                       S2 CONFIRMED — learner-minus-inverted +11.54, but
                          learner-minus-NO-BELIEF only +4.30 +-1.59.
                       S5 CONFIRMED, and it falsifies a claim this register made.
                       S3 NOT REPRODUCED — the auditor's `learnerPlus` reached the
                          oracle (+0.49); mine scores -10.74 below it. No code was
                          supplied. Disposition per the phase-2 audit: REJECT as
                          unverifiable, burden of proof on the auditor. OPEN.

  THE STRUCTURAL FIX The auditor's own conclusion was that a better rung is not
  AND WHAT IT IS     the fix: "no ladder rung may be published without a search
  NOT:               for a stronger sibling THAT THE SUITE ITSELF RUNS."
                     `siblings.ts` enumerates a grammar (7 base terms x 3
                     multipliers = 21 memoryless one-liners) and M10 asserts none
                     beats the declared best trivial by more than its own 95%
                     interval.

                     ON ITS FIRST RUN IT FOUND A RUNG BETTER THAN EITHER HUMAN
                     PASS HAD: `expPayout` at 77.52, ahead of the auditor's
                     hand-found `nbrSum` at 76.10 and the author's declared rung
                     at 68.1.

                     The phase-2 audit was asked whether this closes the failure
                     mode and said NO, and that answer is kept in the file rather
                     than softened: "It is a relabelling... it cannot catch errors
                     in functional form (e.g. non-linearities like sqrt or log),
                     temporal dependencies, or complex conditional logic. You have
                     moved from 'missing a rung' to MISSING A LADDER TYPE." The
                     claim M10 supports is therefore narrow and exact: no policy
                     IN THE DECLARED GRAMMAR beats the declared rung.

  SEEN TO FAIL:      Both new checks were written and observed RED before any fix:
                       M10: "3 machine-generated TRIVIAL policies beat the
                            ladder's declared best trivial rung" — expPayout
                            +9.45 +-4.91, nbrSum x(1+charge) +8.03, expPayout
                            x(1+charge) +7.32.
                       M11: "the learner scores 70.25 but the strongest
                            MACHINE-GENERATED trivial policy scores 77.52."
                     M10 then failed a SECOND time for the right reason: its first
                     draft re-implemented the declared rung inline, so it audited
                     a COPY the ladder no longer used and stayed red after the fix
                     landed. `declaredBestTrivial` is now exported from the
                     harness so the check cannot drift from the thing it audits.

  SEEN TO PASS:      verify-montecarlo M0-M11 exit 0 at 60 and at 240 seeds;
                     `verify:suite` 19 checks, coverage closed; tsc clean.

  HEADLINE, THIRD    blind 41.6 / greedy 45.4 / charge 63.7 / nbr 70.2 /
  REVISION (240      EXP-PAYOUT 78.0 / LEARNER 84.4 / region-oracle 86.9 /
  seeds):            omniscient 97.9.
                     The hidden lattice is worth 8.9 points over the best trivial
                     policy. Previously published: ~1.4 (round 1), 20.2 (round 2).
                     At 60 seeds this same figure reads 10.8, so it is still
                     drifting down with sample size exactly as the auditor said —
                     revision 12 (pin it with a CI) is NOT yet done and the number
                     must not be treated as settled.

  INFERENCE VALUE    6.4 points at 240 seeds (learner minus the SAME learner with
  RE-SPECIFIED:      its belief switched off). The retracted figure, 9.5, used
                     learner-minus-INVERTED, which reads 16.4 here and is kept
                     only as a labelled upper bound. Inverting is strictly worse
                     than not knowing, because the inverted direction is the one
                     guaranteed not to be the link more often than chance.

  THE FINDING KEPT   On an unlearnable board the belief is worth -3.0 points. The
  RATHER THAN FIXED: learner tallies a modal direction out of pure noise and acts
                     on it, LOSING against not believing. The phase-2 audit was
                     asked whether to fix this and said: "Keep and report. S2b is
                     a critical diagnostic of the learner's propensity to overfit
                     noise. Changing the learner to 'fix' this would mask a
                     fundamental architectural weakness." It is the apophenia
                     hazard `lattice-gen.ts` gives as the safety rationale for the
                     whole design, measured inside the instrument built to find it.

                     M7's negative control was re-specified because of it. It used
                     to demand |value| ~ 0 and FAILED at -4.47; the failure was
                     correct information and the assertion was wrong. The property
                     is MUST NOT PAY, not must be zero.

  A CLAIM RETRACTED  "charge never exceeds 2 under real play, so CHARGE_MAX of 3
  IN SOURCE:         NEVER BINDS" was false and is corrected in variants.ts with
                     the histogram. It binds under every policy EXCEPT
                     `chargeAware`, the one it was measured under — which banks
                     the most-charged cell every turn and structurally cannot
                     reach the cap. Same error shape as measuring `refill` with a
                     policy that never empties a second cell.

  VACUOUS CHECK:     Guarded by the audit, not by the author. The phase-2 auditor
                     VETOED the proposed fix and named the Winner's Curse: "the
                     maximum of N noisy estimates is biased upward, leading to
                     frequent non-deterministic build failures." M10 therefore
                     requires a sibling to beat the declared rung by more than its
                     own 95% paired interval, rather than by any margin at all.
                     It also named TRIVIAL INFLATION — the check is satisfiable by
                     declaring an absurdly strong policy "trivial". Guarded
                     structurally: `TrivialScore` takes `(observable, cell)` and
                     has NO memory parameter, so every member of the space is
                     memoryless BY TYPE and the compiler refuses anything else.

  DISAGREEMENT:      With the auditor on S3 (see above) — not reproduced, not
                     adopted, recorded open.

  NOT DONE — 7 of    Revisions 2 (CI on the headline), 6 (rename regionOracle /
  the 12 REQUIRED    stop calling it a ceiling), 7 (interval test for the
  REVISIONS REMAIN:  degeneracy gate), 8 (never rank by skillDepth when it equals
                     dominance), 10 (M8 probe under two policies), 11 (stop
                     claiming 69 distinct GAMES on digest evidence alone), and 12
                     (publish CIs, pin the headline so drift fails the build).

                     Five are done, plus the two checks the audit called the
                     highest-severity missing items. The remaining seven are
                     carried, not closed. Nothing here marks a governance finding
                     resolved — that is Tier 1.

────────────────────────────────────────────────────────────────────────────────
PM-001 — pari-mutuel settlement, built and proven fair, money still off
────────────────────────────────────────────────────────────────────────────────

  LANDED:            `game/economy/fixed-bigint.ts` (NEW — exact BigInt fixed
                     point, single-rounding rational powers);
                     `game/economy/pari-mutuel.ts` (NEW — Spec 36 / E25delta
                     settlement); `engine/verify/verify-parimutuel.ts` (NEW —
                     P0..P14); wired as `npm run verify:parimutuel`.

  THE GATE, STATED   FEATURE_RM_SETTLEMENT is FALSE and P0 asserts it. Election
  NOT ASSUMED:       E29 (counsel) gates real money and only Tier 1 may resolve
                     it. Spec 36 says this of ITSELF, in its own red box:
                     "Adopting pari-mutuel mathematics does not confer
                     pari-mutuel legal status... E29 remains the gate, and this
                     document raises rather than lowers its urgency."

                     The independent audit was asked directly whether building
                     the engine behind a flag stays on the correct side of E29
                     and answered that it is a SOFT boundary: "in many
                     jurisdictions, providing the software used for gambling is a
                     regulated activity regardless of the FEATURE_RM_SETTLEMENT
                     flag... The line is the functionality of the settlement
                     logic itself. It is a risk." That answer is recorded in the
                     module header and here. It is NOT resolved by this work and
                     it is a Tier 1 matter.

  DESIGN AUDITED     The solution vector was VETOED before a line was written.
  BEFORE CODE:       Four fixes required, all applied:
                       (2) remainder tie-breaking must be order-invariant
                       (3) remainder distributed, not handed to one entry
                       (4) integer/rational powers, no double rounding
                       (5) enforce a minimum heat size
                     Four MISSING properties named, all now verified as P10-P13:
                     public verifiability, entropy independence, front-running
                     resistance, non-malleability of commit->settlement.

  SEEN TO FAIL —     THE SPEC AS WRITTEN CONTAINS A BUG, AND THE CHECK CAUGHT IT.
  THE SPEC'S OWN     Spec 36 section 2.4 awards the rounding remainder to "the
  DEFECT:            single top-ranked entry". The auditor predicted, from the
                     prose alone, that ties make this ambiguous and that a
                     find-first-max implementation would make payouts depend on
                     ARRAY POSITION.

                     That exact implementation was planted and run. P3 fired:
                       three tied entries settled as alpha:307 mike:307 zeta:309
                       reversed, the same three settled  alpha:307 mike:309 zeta:307
                     Five failures across n=4, 9 and 17. The remainder moved with
                     input order, destroying the order invariance that is the
                     entire reason heats are scored on a CLOSED cohort — the
                     property that makes entering at minute 1 identical to
                     entering at minute 11.

                     Fix: the remainder is split across ALL tied top entries, and
                     leftover units are assigned by SORTED ENTRY ID, an intrinsic
                     key. Array position is never consulted.

  A SECOND DEFECT    The planted run also exposed a flaw in the HARNESS: the P3
  THE PLANT FOUND,   summary line "reversal and rotation leave every payout
  IN MY OWN          byte-identical" printed IMMEDIATELY ABOVE its own three
  HARNESS:           failures, because the log was unconditional. A green
                     sentence next to a red one is how a suite talks somebody out
                     of reading its output. Every summary is now guarded by
                     `summarise(mark, ...)` and prints "[suppressed: N failures]"
                     instead.

  A CHECK THAT WAS   P4 originally asserted that Neuberg maps the BOTTOM of a
  WRONG, AND WHAT    small heat and a large heat to the same percentile. It
  ITS FAILURE        FAILED — 9-heat last place 0.097, 40-heat last place 0.0095
  TAUGHT:            — and the failure was correct. At m=0 the formula gives
                     m' = N/n - 1, which depends on n by construction: beating
                     nobody out of 8 is a weaker statement than beating nobody out
                     of 39, so short cohorts compress toward the middle.

                     What Neuberg actually equalises is WEIGHT, not span. The two
                     properties that hold and that the payout curve depends on are
                     now asserted instead: a TOP maps to exactly p=1 at every heat
                     size (n=2,9,17,40,64), and a heat's TOTAL contribution is
                     size-invariant. The compression is asserted as a property in
                     its own right rather than asserted away.

  THE DOUBLE-        The audit warned that computing p^(12/5) as nth-root-then-
  ROUNDING TRAP,     power rounds twice and can invert two adjacent percentiles,
  AVOIDED RATHER     letting a higher score pay less. Rather than bound the error,
  THAN BOUNDED:      the intermediate rounding was removed entirely: R is defined
                     as the largest integer with R^5 * S^7 <= X^12, found by
                     binary search on EXACT BigInt comparisons. There is exactly
                     one floor and it is the definition of the answer.
                     Monotonicity is then structural: X1 < X2 implies R1 <= R2,
                     because there is no second rounding to invert it. P6 checks
                     it anyway, over 20 heats of 24 and 65 sample points.

  SEEN TO PASS:      verify-parimutuel P0-P14 exit 0. Selected measurements:
                       P1  pool closes EXACTLY over n=2..40 x 12 seeds, worst
                           discrepancy 0 minor units
                       P7  at 0/100/600/1000 bps the operator retains the declared
                           commission and NOTHING else — no breakage, no second
                           margin (a deliberate divergence from racing practice,
                           which keeps the remainder)
                       P8  last place still receives 197 minor units — FLOOR_W is
                           real, the product is not a total-loss machine
                       P9  distributed === handle - takeout at every rate tested;
                           system RTP is identically 1-t with no pay table
                       P12 a late entrant changes 10/10 existing payouts, so the
                           pool is genuinely mutual
                     `verify:suite` 19 checks coverage closed; tsc clean.

  VACUOUS CHECK:     Guarded three ways. P3 was watched failing on the real
                     defect. P5's float scan was watched firing on a planted
                     decimal literal. P4's original form failed and was replaced
                     rather than relaxed.

  NOT DONE:          The seven carried Monte Carlo revisions from MC-C2. The
                     shared-board MULTIPLAYER transport (this is the settlement
                     mathematics, not a netcode). Visual/audio polish, the
                     production audit and the APK. Nothing here resolves E29 or
                     any other election.
