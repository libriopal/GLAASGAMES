# Darkmatter — the baseline, and the two things that must happen before it counts

The user's condition on this document, verbatim: *"the baseline plan built from
the ideas must be both proven through the montecarlo simulation and independently
audited before accepted as valid."*

**Both.** Simulation alone is a number I produced; an audit alone is an opinion
about a design nobody ran. This file states the baseline, the pre-registered bar
it has to clear, and what it is allowed to be called at each stage.

| stage | artifact | status |
|---|---|---|
| 1 · drafted from the candidates | this file | done |
| 2 · **proven** by Monte Carlo | `scripts/probe/dark-baseline.ts` | see below |
| 3 · **independently audited** | `design/briefs/dark-baseline-r1.json` | pending |
| 4 · accepted as valid | — | **not yet, and will not be until 2 and 3 both pass** |

---

## The sentence

Games one and two can be stated in one line a player acts on correctly. That is
the bar this game had never met.

> **Drop a mass, or spin the cluster, to steer the marked body into the marked
> ring before your budget runs out.**

Fourteen actions. Two verbs. One marked body, one marked place. Nothing in that
sentence requires knowing what a moment of inertia is.

---

## The eight settings, each one traceable to a measurement

| factor | baseline | the measurement that chose it |
|---|---|---|
| **D1 OBJECTIVE** | noun delivery — a named body to a named place | the inertia band is **0/9 live seeds** at twelve bodies; noun delivery is 9/9. The band was not difficult, it was *unreachable* |
| **D2 SCENE** | 5 bodies, one of them marked | liveness rises as scene size falls (0/9 → 4/9 → 7/9 at 12/6/3 bodies). Legibility does **not** — that tail row was falsified |
| **D3 LATTICE** | 12 bearings × 2 verbs = 14 named actions | rule (C): the ceiling must be able to play the player's move. A continuous dial makes that impossible, and a dial is not a decision |
| **D4 COST** | per-verb prices against a round budget | M4: REMOVE scores 0.375 free and **0.000** budgeted. Without a price the verb ranking is a different ranking |
| **D5 HORIZON** | **120 steps per shot** | the finding of round 2. Intuition is 95.4% correct within 45° at 120 steps and 67.6% at 360. The game had been scored at 360 |
| **D6 REST** | the score locks when the body crosses the ring | pool's third property: the consequence finishes arriving, so the next decision starts from a readable state |
| **D7 FORECAST** | a cone at the measured λ = 0.098, computed from the engine's own rollouts | direction is intuitive at short horizons; **magnitude is not, at any horizon**. The cone is the only channel for the half of the decision nobody can estimate |
| **D8 VERBS** | MASS + TORQUE, with REMOVE priced as the big swing | M4: 0.529 and 0.495 reach the band; impulse 0.005 and split 0.000 do not |

**D5 displaced TEMPO, which was one of the original eight.** Horizon is the
measurable half of tempo and it is also first in the pre-registered Lyapunov
remedy order — adopted from the round-one audit long before there was a reason to
reach for it. A factor set that survives contact with a measurement unchanged was
not measuring anything.

---

## What the proof had to show, written before it ran

These are in `scripts/probe/dark-baseline.ts` as executable assertions, not as
prose, so the run cannot quietly pass a bar that moved.

| gate | bar | why this number |
|---|---|---|
| **G1** | legibility at 120 steps clears its own resolution floor by 1.5× | standing rule B. The floor is the random-ranking control, and ORRERY **refuses** a floor of zero because that is the signature of a control that cannot fail |
| **G2** | legibility *rises* as the horizon falls | the corrected claim's only falsifiable prediction. Flat means round 2 produced a mechanism with no design consequence |
| **G3** | ≥ 70% of seeds served by the viability oracle | N2, and its rejection rate is reported rather than hidden |
| **G4** | ≥ 3 live moves of 14 | anti-Nim, standing instruction (D). Also guards against the artifact below |
| **G5** | ≥ 2.0 bits of move-value entropy | Chemical measured 5.23 bits and 14.2 live moves; this is a weaker bar for a smaller lattice, set deliberately low so a pass means something |
| **G6** | agency over doing nothing ≥ 0.30 | the screensaver detector, revision 4 |
| **G7** | the cost changes the best action on ≥ 30% of seeds | otherwise the price is decoration and the evaluator's cheat-code objection stands |

### The oracle no longer manufactures the answer

The falsification probe placed the target at *the landing of the action furthest
from doing nothing*. That guarantees exactly one action scores 1.000 — which is
why its `live moves` read 1.0. **That number was mine, not the game's**, and the
plan's own N2 names the failure: *"you are no longer testing the procedural
generator; you are testing the curator."*

The proof places the zone **blind to which action wins** — a bearing drawn from
the seed, at the *median* displacement distance, so roughly half the lattice
overshoots and half falls short. A seed is then served only if **at least two**
actions reach it and **doing nothing does not**: one reaching action is a
single-answer puzzle, zero is an unplayable seed, and inaction reaching is the
screensaver. That constrains difficulty without choosing the answer, and the
rejection rate is a reported number.

---

## Stage 2 · the proof ran, and the baseline is NOT PROVEN

**Three of seven pre-registered gates failed.** Recorded as measured; nothing was
re-tuned to reach a pass.

| horizon | legibility | its own floor | clears | served | live moves | entropy | agency | cost bite |
|---|---|---|---|---|---|---|---|---|
| 60 | 0.369 | 0.537 | no | 3/24 | 1.0 | 2.33 | 0.740 | 100% |
| **120** | **0.300** | 0.533 | **no** | **3/24** | 1.0 | 2.32 | 0.748 | 100% |
| 240 | 0.557 | 0.087 | YES | 1/24 | 3.0 | 2.71 | 0.582 | 100% |
| 360 | −0.079 | 0.425 | no | 4/24 | 1.3 | 2.17 | 0.832 | 50% |

| gate | verdict | detail |
|---|---|---|
| G1 legibility clears its floor by 1.5× | **FAIL** | 0.300 against a floor of 0.533 |
| G2 legibility rises as the horizon falls | PASS | 120: 0.300 · 360: −0.079 |
| G3 ≥ 70% of seeds served | **FAIL** | **3/24** |
| G4 ≥ 3 live moves | **FAIL** | 1.0 of 14 |
| G5 ≥ 2.0 bits of entropy | PASS | 2.32 |
| G6 agency ≥ 0.30 | PASS | 0.748 |
| G7 cost changes the answer ≥ 30% | PASS | 100% |

### What the failures actually say

**G2 passes and it is the round's claim.** Legibility is 0.300 at 120 steps and
−0.079 at 360. The horizon mechanism is real and it is the right lever.

**G1 fails for a reason worth stating precisely.** The floor here is the *random
ranking control*, and at three served seeds that control reads **0.533** — a
random ranking of fourteen actions over three samples is noise of exactly that
size. G1 did not fail because legibility is small; it failed because **the
experiment is too small to tell**, and the reason it is too small is G3. One gate
is failing and the other two are reporting it.

**G3 is the real failure: 3 of 24 seeds served, an 87.5% rejection rate** against
a pre-registered band of 1–20%. The plan's own rule fires here — *above 20% the
generator is declared defective and fixed rather than filtered* — and the
diagnosis is a measurement, not a guess, so `scripts/probe/dark-coverage.ts`
separates the two candidate causes:

- **the generator emits degenerate universes**, in which case the fix is in
  `seedUniverse`; or
- **one shot cannot aim.** Fourteen discrete actions reach fourteen places, and a
  target placed anywhere else is unreachable however good the universe is — in
  which case the fix is *sequences*, and the generator is innocent.

**It is cause B, and the generator is innocent.** `scripts/probe/dark-coverage.ts`
samples the target annulus at 72 bearings and asks what fraction is within
tolerance of *some* reachable landing:

| shots | distinct landings | coverage of the annulus | median nearest-miss |
|---|---|---|---|
| **1** | 10.8 | **33.7%** | 0.720 |
| **2** | 48.3 | **64.1%** | 0.388 |

Fourteen actions reach about eleven distinct places, and **two thirds of the
target space cannot be hit at all**. Two shots separated in time reach 48.3
places and 64.1%, halving the nearest-miss. The viability oracle was not being
strict; it was correctly reporting that most targets are unreachable in one move.

> **One shot cannot aim. That is a design finding, and it arrived as a failed
> gate rather than as an idea.**

And it revives, on a different metric, the thing this round's retraction killed.
The Lie-algebra import claimed composed verbs reach states neither reaches alone;
the *novel-distance* metric could not support it once its floor was measured.
**Coverage is a different estimator asking a different question** — not "is the
composed point far from the single-verb set" but "how much of the target space
can be hit at all" — and on that one, composition is worth 4.5× the distinct
landings. The import was right about the mechanism and wrong about the metric it
was tested on. *Whether that is a rescue or a second bite at the same cherry is
question (c) in the audit brief, because it is not mine to decide.*

**G7 at 100% is not the good news it looks like.** The cost changes the best
action on *every* served seed, which at three seeds is three observations, and a
price that changes the answer always is as suspect as one that never does. It is
carried as unproven rather than as a pass.

> **Stage 2 verdict: NOT PROVEN.** The baseline is not valid and is not being
> treated as valid. Stage 3 goes to the auditor **with this failure in the
> brief**, because a brief that presented the design without its failed proof
> would be asking for approval of something that does not exist.

---

## What this baseline does NOT claim

- **It is not a depth result.** Chemical's run ended by recommending it ship as a
  *tactical-efficiency* game rather than a deep-strategy one, on measurements, and
  nothing here entitles Darkmatter to a stronger claim than the one its own
  numbers support.
- **It is not a rendering claim.** A game that is only good because it looks good
  has not passed, and the renderer is gated separately.
- **Negative selection is not positive selection.** If these settings fail, the
  claim is "these settings failed" — not that a physics sandbox cannot be a
  straightforward game.

## Still open, and stated as open

1. **Multi-shot play is unmeasured.** Every number in this round is for a *single*
   intervention. D6's rest-between-shots and the whole tempo question need the
   sequential run.
2. **The magnitude problem is mitigated, not solved.** The cone shows the player
   what they cannot estimate; whether they can *act* on a cone is a persona
   question, gated on the median persona per revision 8, and unrun.
3. **No versus or co-op executor exists** for this game.
4. **The 4D level** remains a factor with a comprehension gate, unscreened.
5. **Stages 1–5 of the Monte Carlo plan** have not run. This is a baseline proof,
   which is a much smaller thing than the screening design it is meant to seed.
