# The build pattern — run this for every game

Extracted from Farkle, which went through it start to end. Games 2 and 3 run the
same sequence. It is written as a checklist because the value came from the
*order*: measuring before generating, and handing every claim to something I
don't control.

---

## Phase 0 · Read the material, don't recall it

Survey the actual corpus — files, counts, headers. Never generate from a summary.

> Farkle: read `magentadice-cyancode@8db018e` directly, which is how the ported
> scorer got a provenance header naming exactly what changed (one type import).

---

## Phase 1 · Draft, then audit — and expect to lose

Write 50+ changes. Send to the independent auditor. **Revise until APPROVE.**

Farkle took **three rounds**:

| round | verdict | what it cost |
|---|---|---|
| r1 | REVISE | "the dice are a resource, not a constraint — this isn't Farkle" |
| r2 | REVISE | "the first four steps are a loading bar that turns into a game" |
| r3 | **APPROVE** | with one directive: the Live Hand must be a mechanic, not an overlay |

**Do not accept an auditor finding on authority — measure it.** Round 1's finding
turned out *stronger* than its own wording: 0/400 fresh boards had no scoring
path. Not "negligible". Zero.

---

## Phase 2 · Build the harness BEFORE the game is balanced

The order matters. A harness built afterward measures what you already decided.

Every game gets, in `foundry/montecarlo/<game>-harness.ts`:

1. **An agent ladder** — floor, reference rungs, ceiling.
2. **The persona population** (`foundry/sim/personas.ts`) — 15 profiles from 8,000
   real conversations. Not a skill slider: traits pull in different directions,
   so a cautious expert and a reckless expert both exist.
3. **A degenerate-strategy probe** — fixed, thoughtless rules. A wide skill ladder
   does not rule out one mindless heuristic sitting above all of it.
4. **Seed-vs-policy variance** — does the player decide, or the draw?
5. **The dual constraint** — Signal Utility ≥50% *and* Agency Floor ≥25%.

### The shipping gates

| gate | meaning | Farkle |
|---|---|---|
| SKILL DELTA | spread across the **population**, not the reference rungs | 19.7% |
| SOLVER MARGIN | unbounded over bounded search | 4.1% |
| SEED SHARE | variance from the draw rather than the player | 3.3% |
| SIGNAL UTILITY | the instrument is worth reading | 74.6% ✅ |
| AGENCY FLOOR | the instrument is not a command | 40.4% ✅ |
| DOMINATED | a trivial rule beats thought | false |

**Signal Utility and Agency Floor pull opposite ways on purpose.** My first gate
was headroom alone, and the auditor killed it: *a better UI would be penalised by
your own gate.* Two constraints can't be satisfied by degrading either.

---

## Phase 3 · Run EINCOL on the result

1. One specific question, against material you measured.
2. A **distribution** of 5–8 candidates with honest priors. Go into the tail.
3. Work the tail. Row one closes nothing.
4. **Falsify your own finding in writing.** Keep both versions.
5. Hand it to the auditor.

> Farkle's tail row at p=0.05 — *"nothing makes a long turn worth more than many
> short ones"* — produced the run multiplier. Row one ("the turn cap binds") was
> true and closed nothing.

---

## Phase 4 · Build the screen, then look at it

**Every visual defect this project has found was found by rendering, not review.**

Farkle's, in order: bounding-box hand ground that re-created the fence · bank
button clipped 8px · "BANK 0" offering to make zero safe · near-monochrome
against a colourful brief · pips at **APCA Lc 29** on their own body · die bodies
at **Lc 0** against the deck · brightening them made them compete with the hand.

**Measure, don't eyeball.** Every fix above came from a sweep.

---

## Phase 5 · Pin findings in an oracle

`engine/verify/verify-<game>.ts`. Every fixed defect gets a check that fails if
it returns. **Build the negative control and watch it fail first** — a check only
ever seen to pass is decoration.

---

## Phase 6 · Visual gate — stop and get sign-off

Screenshots from the **shipping renderer**, not mockups. Plus an auditable
description, and the open list. Then wait.

---

## The failure modes this project actually hit

Each of these happened. Watch for them.

**The vacuous measurement.** Twice.
- `verify-forecast` F6 reported **r = 1.000** — every sampled board sat in one
  bucket, so the series had no variance and a `syy === 0` escape turned an
  undefined correlation into a perfect score.
- A dispersion probe returned the **identical distribution for three different
  multipliers**. The tell was the invariance: hindsight-optimal depth is always
  "as deep as the hand survives", so it measured hand depth, not judgement.

> **The signature: a statistic that cannot vary with the thing it tests.**

**The invented constant that sets the ceiling.** `HUMAN-CAL*`'s 18% error rate
was mine, and it beat every other agent — so a number I made up was the top of
the scale every balance claim was measured against.

**The broken evaluator blamed on the design.** `bank-after-1` at 99.1% of "best"
looked like a dead decision. The real defect was my search agent. I nearly
redesigned a game around a bug in my own instrument.

**The world model that doesn't match the world.** The solver assigned 33% and 67%
ruin to positions that are *perfectly safe*, because it read risk states as
probabilities. Calibration: states 0/1/2 farkle **0.0%**, state 3 farkles
**100%**.

**A band whose colour lies about its content.** The readout wore IR — *what might
go wrong* — while reporting something already decided. The corpus names the
inverse as a defect; this was the first direction.

**The circular gate.** A shipping criterion that would have penalised improving
the thing it measured.

---

## Deterministic simulation — why no real-user testing is needed first

Per the execution plan's domain split:

- **Research Domain** — offline, non-deterministic. Evolution, LLM mutation,
  playtesting. Emits *statically verified JSON contracts*, never raw code.
- **Execution Domain** — online, replicated, bitwise-identical. No `eval`, no
  dynamic import, no JIT.

`foundry/sim/prng.ts` gives the recording/replaying entropy source: same seed and
persona ⇒ same play, with a Merkle root over every draw and a `replayFrom` that
reports the **first divergence with its index and tag**. A per-persona stream
derived from `(runSeed, name)` means adding a persona does not change how the
existing ones play — without that, every measurement shifts when the population
changes and no two runs are comparable.

---

## Still open on Farkle

1. Persona **trait → game decision mapping is mine** and unvalidated. The traits
   are external; the mapping is not.
2. **Nothing in juice/sound exists** — no audio, haptics, or animation.
3. **Coop pair-ranking never simulated.**
4. **Perceptual calibration** needs playtest data that does not exist.
