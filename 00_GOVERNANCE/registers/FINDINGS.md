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
