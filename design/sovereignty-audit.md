# Project-wide sovereignty audit

The imagination protocol from `design/imagination-protocol.md`, applied to the
whole repository instead of one file. Same five steps: load the cue with real
material, verbalize a distribution rather than an answer, take the tail
seriously, try to falsify it, hand the survivor to an evaluator I do not
control.

The evaluator this round was not my judgement and not the independent auditor.
It was a program that breaks the code on purpose — `engine/verify/verify-oracles.ts`
— and it disagreed with me on its first run.

---

## The classifier

From the previous round, and it did the work here:

> A truth is sovereign only if it is pinned **in time** (it existed before the
> party it constrains could have chosen it) or **against a witness** (a second
> independent thing computes it and agrees). Pinned by neither, it is a
> preference wearing a measurement's clothes.

---

## Step 1 — the corpus, measured rather than remembered

35 verification oracles, ~14,000 lines across engine, lattice, web, families,
foundry, corpus, game, core and governance.

First measurement attempted: how many oracles carry a negative control? I
grepped for the phrase and got **13 of 35 with zero signal**, including the
economy, determinism and safety suites.

**That measurement was wrong, and its wrongness is the finding.** Spot-checking
two of the thirteen showed `verify-economy` asserting `!economyVisible(under21)`
and `verify-safety` asserting a reachable error location is certified UNSOUND.
Both test negative cases properly. They simply do not use the words.

A phrase-grep measures vocabulary. It is an assertion with no witness — exactly
what the classifier condemns — and I had reached for it as an instrument while
holding the classifier that forbids it.

**Direct evidence that the gap is real, from this repo, an hour earlier:**
`verify-ruleset` shipped its first draft with two controls that perturbed "the
first digit in the file." In both files that digit sat inside a code comment,
which the system under test correctly strips. Raw text changed, the setup guard
asserted raw text changed, and the control tested nothing — while containing the
literal words NEGATIVE CONTROL and reading, to a human and to a grep, exactly
like a working one. **Running it is what caught it. Nothing else could have.**

---

## Step 2 — the distribution, generated wide

Candidates for "where is a truth in this project pinned by neither time nor
witness", with honest probabilities, generated down into the tail rather than
stopped at the mode:

| p | Candidate |
|---|---|
| 0.30 | CI config is editable by the party the oracles constrain |
| **0.22** | **The negative-control rule is enforced by convention; nothing measures whether an oracle CAN fail** |
| 0.15 | `corpus-digest.json` is a committed assertion, not reproducible without the images |
| 0.12 | Two eras of code: engine oracles carry full rationale headers, the older subsystems carry none |
| 0.10 | Postgres-dependent checks report FAIL when no DB is reachable; the suite counts them as not-passed, but nothing proves they'd pass |
| 0.06 | Frame stamps prove agreement but nothing pins *when* a peer stamped |
| 0.05 | Bond cleanliness is checked at one instant, not maintained over time |

Row two survived. Row one is true, generic, and closes nothing.

---

## Step 3 — the independent audit

The Cloudflare Workers AI critic (`@cf/google/gemma-4-26b-a4b-it`, different
model, different vendor, no sight of my reasoning) was asked for the single
strongest objection to mutation testing as a build gate, and for a cheaper
instrument that dominates it.

It exhausted its token budget on reasoning before formatting an answer — the
known failure mode documented in `tools/loop/audit.py`. The trace is legible and
converged, so the finding is extracted from it rather than paid for twice:

- **Strongest objection: the equivalent-mutant problem.** A mutation that
  changes source without changing behaviour makes a perfect score unreachable
  and the metric's ceiling arbitrary.
- **On a cheaper instrument it argued itself out of its own suggestion:**
  considered code coverage, then rejected it — *"if the defect is untested
  logic, coverage is the answer. If the defect is weak assertions, coverage is
  NOT the answer."* Weak assertions are precisely the defect class here.

A first attempt at a longer question died differently: the agent proxy relay
closed the tunnel after 200s mid-exchange. Recorded because a dropped connection
and a refused audit look identical in a log, and only one of them means
anything.

---

## Step 4 — what the evaluator found that I did not

`verify-oracles` ran six curated mutations. **Five were caught. One survived.**

> `verify-lattice` did not notice `FACE_WEIGHTS` changing from
> `[0,4,4,4,4,4,4]` to `[0,9,4,4,4,4,1]` — nine times the weight on face 1, a
> quarter on face 6.

L1x was **right** to pass. It asks whether the weights are re-derived inside the
turn loop, and a loaded constant is not re-derived; it is loaded before the loop
starts and then faithfully left alone.

So the property actually proven was *"the operator cannot change the odds
mid-round."* The property everyone assumed was proven was *"the odds are fair."*
Those are different sentences and only the first had ever been checked. Under a
principal-return bond, the second is the one the entire staking argument rests
on.

**L1y closes it**, two ways because they fail differently:

- *Static* — every rollable face carries identical weight. Catches an edited
  constant.
- *Empirical* — 60,000 draws through the real `drawFace`, chi-square **3.69**
  against a 20.515 critical value at p=0.001. Catches a bias introduced anywhere
  downstream: the RNG fold, the selection arithmetic, a lookup table. Reading
  `FACE_WEIGHTS` would reveal none of those.
- *Negative control* — the harness's own loaded die, run through the same path,
  scores **18,205**.

`drawFace` is now exported because it is the entire fairness surface. Widening
`RoundResult` to expose faces would have been the alternative, and would have
changed the game's public shape to suit a test.

---

## Step 5 — Tier 2, and what it found in the new code

Generated mutants over `ruleset.ts` and `theme.ts`: **70% and 80% caught.**
Five survivors, triaged by hand:

| Survivor | Verdict |
|---|---|
| `codeSpans` escape test inverted | **real gap** — no rule source contains an escaped quote, so the branch never executed |
| `codeSpans` scan stride | **real gap** — same untested region |
| `isString: true → false` | **real gap** — no rule source has a multi-space string literal |
| APCA below-clip branch `0 → 1` | real but minor — no tested pairing reaches the clip |
| `LC_INVISIBLE 15 → 16` | **genuinely equivalent** — adjacent grounds score 1.9; both thresholds pass |

Four of five were real coverage gaps and one was a true equivalent mutant, which
is the ratio the two-tier design predicts and the reason Tier 2 reports rather
than gates.

The first three matter more than they look. `codeSpans` decides what counts as
executable text **for the rules hash** — the mechanism binding a round to the
rules it was played under. If it mistakes a string for code, an edited message
raises a false mismatch. If it mistakes code for a comment, **a real rule change
stops moving the hash and the binding silently fails open.** That was resting on
inputs that never tested it.

R6 now tests the scanner on adversarial source directly — escaped quotes, a
`//` inside a URL string, an apostrophe inside a comment, a quote inside a block
comment, whitespace inside a literal. The two confirmed gaps are promoted into
Tier 1, where they gate. **8/8 curated mutations now caught.**

---

## The audit table, current state

| Truth | Time | Witness | Verdict |
|---|---|---|---|
| Round seed | ✅ commitment | ✅ player recomputes | sovereign |
| **Round rules** | ✅ published first | ✅ recomputed locally | **sovereign (new)** |
| **Dice fairness** | — | ✅ chi-square on the real path | **sovereign (new)** |
| **Oracle liveness** | — | ✅ mutation harness | **sovereign (new)** |
| Trajectory | ✅ recorded inputs | ✅ replay executor | sovereign |
| Frame state | ✅ per-tick chain | ✅ peer's stamp | sovereign |
| Kernel semantics | — | ✅ WGSL parity | sovereign |
| Contrast floors | — | ✅ APCA standard | sovereign |
| **Palette / digest** | ✅ committed once | ✅ reproduces byte-for-byte from a pinned corpus | **sovereign (new)** |
| CI enforcement | ❌ | ❌ | **not sovereign** |
| DB-backed checks | ❌ | ❌ unreachable here | **unproven in this environment** |

---

## Open, ranked, not yet closed

1. ~~**The corpus digest is not reproducible.**~~ **CLOSED THIS ROUND.**
   Confirmed first: `data/` is genuinely absent from this repository, so T1 was
   checking the digest against itself. The images were located in the
   `magentadice-cyancode` clone — 1115 jpeg + 13 png + 1 jpg = **1129**, exactly
   the count the theme asserts. Re-running `ingest-corpus.py` over them
   reproduced the committed digest **byte for byte** (both hash to
   `5b71e850d99aef86...`). `design/manifest-corpus.py` now pins all 1,129 images
   by SHA-256 under root `008cb900...` and records the digest they produce, and
   T5 walks the chain. Committing the JPEGs was rejected: it would bloat this
   repo and duplicate another one, and the point was never to hold the images —
   it was to make the claim about them falsifiable by anyone who does.
2. **CI can be edited by the party it constrains.** Real, and unfixable from
   inside the repo: it needs branch protection, which is an account setting, not
   a commit.
3. **Two eras of code.** The engine oracles carry full rationale; the older
   subsystems carry none. Not a correctness defect — but the mutation registry
   currently covers 4 oracles of 35, and extending it is how that gets measured
   rather than assumed.
4. **The Postgres-dependent checks cannot run here.** The suite correctly
   refuses to count them as passes. That is honest, and it also means nine
   assertions about deletion cascades and soft foreign keys are currently
   unproven in this environment.

---

## What this round actually demonstrated

The protocol produced a finding I would not have produced by reasoning, because
the instrument disagreed with me:

- My grep said 13 oracles lacked negative controls. **It was measuring
  vocabulary.**
- My curated list said all six mutations would be caught. **One survived, and it
  was the loaded die** — in the oracle named for preventing exactly that.
- My new scanner looked complete. **Three of its branches had never executed.**

Three times the evaluator was right and the author was wrong. That is the whole
argument for keeping the judge outside the generator, which is what both the
sleep-onset literature and the LLM-diversity literature said in the same
sentence, from opposite directions.
