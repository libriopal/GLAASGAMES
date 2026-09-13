# EINCOL round 1 — Darkmatter

Run against `EINCOL.md` read fresh, not recalled. Five steps, in order.

---

## Step 1 · The cue, loaded with measured material

**The question, stated once and specifically:**

> Which intervention in a running gravitational system **expands the set of
> reachable futures**, and can a player **steer** that expansion or only trigger it?

The second clause is the difficulty. The approving audit gave the lead — *"Energy
Injection and Mass Injection can expand the reachable phase space"* — and in the
same breath named the trap: *"the screening must distinguish between expanding
the space and creating chaos."*

**What I measured, before generating anything:**

| | |
|---|---|
| Lyapunov λ | **0.098** per sim-second → 10.2 s prediction horizon vs a ~30 s round |
| spatial extent | z is **19–30% of x** — a genuine thick disc, not a plane |
| energy drift | **non-directional**: 12 up / 17 down, 17% skew over 1500 steps |
| do-nothing motion | mean \|dx\| **7.09** over 400 steps — the system has momentum |
| render | camera had **no elevation**, so a plane projected to a line |

**And the verb sweep, 6 seeds × 9 parameter levels × 600 steps:**

| verb | expansion (sd of outcome) | steerability (rank corr) | mean bound |
|---|---|---|---|
| NONE | 0.0000 | 1.000 | 0.764 |
| IMPULSE | 0.0526 | 0.653 | 0.764 |
| MASS | 0.0632 | **0.983** | 0.936 |
| DRAG | **0.0838** | 0.958 | 0.927 |
| PIN | 0.0414 | 1.000 | 0.801 |

**Two things in that table are wrong, and both matter more than the ranking.**

*NONE scores steerability 1.000.* With no intervention every parameter level
produces an identical outcome, so the variance is zero and the rank correlation
is computed over tied ranks. It is the **vacuous-measurement signature** — a
statistic that cannot vary with the thing it tests — for the fifth time in this
project. The row is a control working correctly and a statistic reporting
nonsense, simultaneously.

*DRAG scores the HIGHEST expansion.* Drag is the textbook stabiliser: it removes
energy and shrinks the reachable space. It tops the table because **my expansion
metric measures lever strength, not state-space volume.** A strong monotone dial
with a wide range scores high on "spread of outcome across parameter settings"
while doing the opposite of what the metric is named for.

So the cue is loaded and the instrument is already suspect. Good.

---

## Step 2 · A distribution, not an answer

Honest priors on *what actually expands the reachable state space and stays
steerable*. The last rows are meant to feel unlikely.

| p | Candidate |
|---|---|
| **0.26** | **Mass injection.** Adds degrees of freedom rather than energy; measured steerability 0.983, the best pairing in the table. Row one, and it is the audit's own lead. |
| **0.19** | **Nothing does.** Gravity is dissipative-looking at every scale a player can act on; every verb is a convergence engine and the measured "expansion" is lever strength. Darkmatter is Chemical again with prettier graphics. |
| **0.15** | **The expansion is in the OBJECTIVE, not the verb.** A single scalar outcome (bound fraction) has a one-dimensional reachable set by construction. Any verb looks convergent when you measure it through a scalar. |
| **0.13** | **Resonance, not force.** A small periodic nudge at an orbital frequency moves a system further than a large impulse — the reachable set expands with *timing precision*, not magnitude. Steerable because resonance is a skill. |
| **0.10** | **Expansion requires TWO interventions that interact.** One verb in a Hamiltonian system mostly rotates you within a shell; two separated in time compose non-commutatively and reach genuinely new states. |
| **0.08** | **The player should expand the space by SUBTRACTING.** Removing a body opens configurations that the removed body's gravity was forbidding. Deletion as a creative act. |
| **0.05** | **Tidal disruption is the only real expander.** Bring two masses close enough that a third is torn between them, and the system visits a region no smooth trajectory reaches — the expansion lives entirely in the near-singular encounters the softening length exists to bound. |
| **0.04** | **There is no "state space" to expand; there is only the OBSERVER's uncertainty.** What a player expands is their own set of *distinguishable* futures, so the readout IS the mechanic and the physics is scenery. |

---

## Step 3 · Working the tail

Row one closes nothing: mass injection is already the plan's G5 level and would
have been screened anyway. The tail is where the work is.

**p=0.05, tidal disruption.** What would have to be true: the reachable set
should grow sharply as the softening length ε falls, because ε is exactly the dial
that bounds near-singular encounters. That is *testable and cheap* — ε is already
a declared constant and the approving audit named it the first-choice Lyapunov
remedy. If expansion rises as ε falls while λ stays bounded, there is a window
where the game is rich and still fair. **If expansion and λ rise together, the
window does not exist and this candidate dies.** That single sweep discriminates
between two of the eight rows.

**p=0.10, non-commuting interventions.** Structural analogy imported from a
distant field: **quantum control theory**. The reachable set of a bilinear
control system is generated by the *Lie algebra* of its control fields — one
field reaches a submanifold, two fields whose bracket is non-zero reach the whole
space. That is a precise, borrowed reason to expect a *pair* of verbs to do what
no single verb can, and it predicts something specific: interventions that
COMMUTE (two impulses on the same body along the same axis) should add nothing,
while non-commuting ones (an impulse and a mass drop at different points) should
compound. Testable directly.

**p=0.15, the objective is the bottleneck.** This one reframes the measurement
defect I already found. If the outcome is a scalar, the reachable set is an
interval and every verb is "convergent" by construction. The fix is a
**vector-valued outcome** — bound fraction, angular momentum, radial spread,
clustering count — and expansion measured as the *volume* of the reachable set in
that space, not the spread of one coordinate.

**p=0.04, the observer.** The honest version is not "physics is scenery" but a
warning: the run must not measure expansion in coordinates no player can
perceive. A reachable set that is large in a basis the readout does not show is
not a game, it is a dataset.

---

## Step 4 · Falsifying my own finding, in writing

**The claim, stated generally:** *Mass injection is the intervention that expands
the reachable state space while remaining steerable, so it should be the primary
verb.*

**A case it predicts, checked:** mass injection scored 0.0632 expansion and 0.983
steerability, the best pairing measured. ✅

**A case it gets wrong — and I looked for this hardest.** DRAG scored HIGHER
expansion (0.0838) and drag is unambiguously a stabiliser. Under my own metric,
the textbook energy sink out-expands the thing I am calling an expander. Either
drag really does expand the reachable set — physically false — or **the metric is
measuring something else.** It is: sd-of-outcome across a parameter sweep is
*lever strength*.

**Corrected claim, and I am keeping both versions:**

> ~~Mass injection expands the reachable state space.~~
>
> **Mass injection is the only verb measured that is both a strong lever
> (0.0632) and reliably aimable (0.983). Whether it EXPANDS the reachable set is
> not yet established, because the expansion metric conflates lever strength with
> state-space volume, and a vector-valued outcome with a volume measure is
> required before the word "expansion" is used again.**

Also recorded: **mass injection and drag both RAISE mean boundness** (0.936 and
0.927 against 0.764 for no intervention). Both make the cluster *more* stable. If
the objective is "hold it together", the player's verbs push in the same
direction as doing nothing well — which is the shape of a game with no tension,
and is a stronger warning than anything in the ranking.

---

## Step 5 · Hand it to an evaluator I do not control

Rung 3 — the independent model, shown the claims without my reasoning. Rung 2
(execution against reality) has already run and is what produced the correction
above; rung 1 is the next stage's job.

**Negative control, mandatory:** the NONE row demonstrates the instrument
*can* return a degenerate answer, and I caught it. A steerability statistic that
reports 1.000 on a system with zero variance is the check failing visibly, which
is the only reason to trust the rows where it did not.

→ `design/briefs/dark-eincol-1.json`

---

## What this round changed before any factor was screened

1. **Expansion is not yet measurable.** The metric must become a reachable-set
   *volume* over a vector outcome. Until then the word is not used.
2. **ε becomes a screened factor, not a constant** — it is the dial the tidal
   candidate turns, and the audit already named it the cheapest λ remedy.
3. **Verb PAIRS get screened, not just verbs**, on a borrowed structural
   argument from quantum control: non-commuting fields reach states neither
   reaches alone.
4. **"Hold it together" is probably the wrong objective**, because the verbs and
   doing-nothing-well push the same way.
