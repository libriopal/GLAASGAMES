# Visual gate — Chemical (game two)

**Stop here for approval or revision input before game three.**

Screenshots: `design/synth-sheet.png` — three states, all rendered from the
**shipping executor** via `beginSynth`/`advanceSynth`. Nothing here is a mockup.

---

## What the game is, in one paragraph

You run a **synthesis line**. A board of molecules, a standing book of three
orders, and conservation of mass as a law: to make what is ordered you must find
the atoms already on the board and route them there. A move is a selection of
adjacent molecules **and a choice of what to make from them** — three
conservation-legal rearrangements, ranked by energy, and taking a cheaper one to
make what is ordered is the decision the whole game is built on. Energy is a
resource, not the score. Fill an order and it ships, banks, and the next arrives.

**It is a tactical-efficiency game, not a deep-strategy game, and that name is
the run's primary finding rather than a retreat.**

---

## The three screenshots

| panel | state | what it demonstrates |
|---|---|---|
| 1 | opening, nothing selected | the board; **CH₃Cl and H₂O₂ read MAKEABLE** and their UV lines have migrated toward the matter band, C₂H₂ has not |
| 2 | mid-round, a path drawn | selection as a traced path; the three real equations that path offers |
| 3 | a declared route live | the commitment banner in UV, with turns remaining |

## The visual system, and why each band means what it means

The corpus rule is load-bearing: *a band whose colour lies about its content is a
defect, not a style preference.*

- **matter** — what IS: molecules, the bank, shipped count, the selection outline.
- **UV** — what is HIDDEN: open orders and the incoming queue. An order is an
  *intention*, which is exactly what UV is licensed to mean.
- **IR** — what MIGHT go wrong: thermodynamic sinks, an expiring declaration.
- **cyan** — what the ENGINE READS: the readout frame, read-only.

**The IR/UV spectral readout replaces the 2-row forecast grid.** Orders emit UV
lines on the left, sinks emit IR lines on the right, and a line **migrates toward
the matter band** as its order becomes makeable — so "you can make this now" is a
*position*, not a number. Position carries the information and hue is redundant
with it, which the two-row grid could never claim. Your swapped-row rule survives
as **depth**: certain nearer matter, guessed further into UV (the INCOMING ticks).

Molecules are drawn from their **real skeletons** — a double bond is two lines
because it *is* two lines, and angles are the tabulated ones (water bent at
104.5°, CO₂ linear at 180°).

---

## Four defects that only rendering found

1. **The MAKE buttons were lying.** Three hardcoded equations drawn regardless of
   what was selected — an interface asserting a fact the game had not produced.
   Now the executor's own `optionsFor` output, with an honest empty state.
2. **The spectrum ran backwards against its own legend** — a reachable order
   rendered deep in UV, an unreachable one near matter.
3. **A red sink ring on ~40% of cells** competed with the green selection ring
   for the same channel. Sinks are now a mark at the rim; selection owns the outline.
4. **The migration signal was unreachable.** It was driven by "is the order on the
   board" — which under ANYWHERE delivery is *never true for an open order*,
   because an order ships the instant its molecule exists. The brightest state the
   readout could display could not occur. Driven by reachability now.

---

## What the Monte Carlo runs established

Two full cycles, each plan audited to APPROVE **before** compute, each result
audited after. 44 cells in run one, 8 + 4 configurations in run two.

**Validated and shipping:**

| | |
|---|---|
| the product choice | significant and positive on agency, throughput (+35%) and seed share — the one mechanic neither run threatened |
| effective branching | **14.2** live moves per turn, **5.23** bits of entropy, against a bar of 4 — the terrain is genuinely wide |
| signal utility | reading the order book beats ignoring it by 290–450% |
| not dominated | best thoughtless rule reaches 45% of thoughtful play |

**Failed, and not papered over:**

| gate | result | |
|---|---|---|
| consequence horizon | best **0.60** vs bar 1.0 | one move is worth less than one delivery |
| head-to-head | ORDER‑2 beats ORDER‑1 **43.3%** | depth does not win a match |
| denial value | **0.0** | taking what a rival needs is slightly *worse* than ignoring them |
| seed share | 50.5% floor | ~20 points of it is the metric's own floor at this score granularity |

**The two deepest findings:**

- **Information does not create depth.** Order preview bought 31.6 points of
  agency floor by spending 47 points of solver margin — it converts unreachable
  ceiling into reachable skill and moves the player up against it.
- **The declared route is a convergence engine, not a depth engine.** It *is*
  load-bearing at a high stake (never-declare reaches only 77% of it), but
  commitment collapses the state space, which is why its horizon is *lower*
  exactly where it works. In the auditor's words: *"a sink for complexity, not a
  source of it."*

---

## Recommended shipping configuration

**Square board · three product options · no swap verb · no preview · no declared
route · standing book of three · orders delivered anywhere.**

Every element of that is a measurement, not a preference:

- **square, not hex** — TOPOLOGY×OPTIONS is **−10.2**, the largest interaction in
  the screen. Hex fights the product choice. *(You asked for hex; this is the one
  place I'm recommending against your brief, and the number is why.)*
- **no swap** — −0.1 on agency, **+9.4** on decision density. Real decisions worth
  nothing; the parsimony rule discards it.
- **no preview** — it trades solver margin one-for-one.
- **no route** — load-bearing but a complexity sink, and it fails the primary gate.

---

## Open list

1. **Nothing in juice, sound or haptics exists** — for Farkle either. Largest
   untouched block in the project.
2. **Co-op pair-ranking is unsimulated**, in both games.
3. **Persona trait→decision mapping is mine** and unvalidated.
4. **The consequence-horizon metric is an open question**, not a validated
   instrument — nothing cleared its bar under ~40 configurations.
5. **Re-specifying the seed-share gate** is a human decision and has not been made.
6. **A VS executor does not exist.** The match runner shares one board array
   between two executor states for measurement; shipping versus needs a real one.
7. **48 of 50 deep-strategy candidates were eliminated on two measurements rather
   than tested.** The search was never exhaustive.

## The two structural prescriptions, if deep strategy is non-negotiable

Neither is reachable by tuning anything measured in these runs:

- **Break the shared-table paradigm** so that moves *subtract from an opponent's
  potential* rather than merely changing the environment. Denial is worthless
  here because every molecule is present with probability ≈1 — contested
  resources require scarcity this board does not have.
- **Introduce non-monotonicity**: a sub-optimal immediate move that creates a
  disproportionate future advantage.

---

## What I need from you

1. **Approve or revise the visuals** (`design/synth-sheet.png`).
2. **Approve the shipping configuration**, including square-over-hex.
3. **Accept the tactical-efficiency framing**, or tell me deep strategy is
   non-negotiable — in which case the two prescriptions above are the next build,
   not a tuning pass.
4. **Say whether to start Darkmatter**, whose plan is already approved at r3.
