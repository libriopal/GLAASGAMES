# Visual gate — Darkmatter (game three)

**Stop here for approval or revision input.**

Screenshot: `design/dark-sheet.png` — five panels, **one real round of seed 129
played end to end by the shipping ruleset** in `game/dark/steer.ts` and recorded
as it went. Nothing is a mockup and nothing is posed.

---

## What the game is, in one sentence

> **Drop a mass, or spin the cluster, to steer the marked body into the ring
> before your budget runs out.**

Fourteen actions — twelve bearings to drop a mass on, two directions to spin —
taken twice, in a five-body gravitational universe rebuilt from a seed every
round and integrated in Q32.32 fixed point so it replays bitwise.

That sentence is the whole deliverable. Games one and two could each be stated in
a line a player acts on correctly; **game three could not, and finding out why
took four failed proofs.**

---

## The finding, which is the reason this game exists at all

Darkmatter's problem was never the physics, the objective, the rendering, or the
player's controls. It was measured, in this order, and each answer killed the
previous design:

| what was measured | the number | what died |
|---|---|---|
| can a human rule rank the actions? | 0.156 against a random control of 0.076, on noise of 0.30 | the premise that it was playable |
| is a named target more legible than a statistic? | **−0.176**, worse than guessing | the objective hypothesis |
| **when does intuition work?** | 100% correct at 30 steps, 95.4% at 120, 67.6% at 360, 42.6% at 600 | the horizon everything had been scored at |
| is finer control the answer? | doubling the lattice moves the ceiling **0.842 → 0.837** | the "clumsy" hypothesis |
| is information the answer? | perfect foresight with unchanged hands: **+33.4 points** | the "it's the hands" hypothesis |

> **The direction of an intervention's effect is intuitive. Its magnitude is
> intuitive at no horizon at all — and the game is decided by magnitude.**

So the interface stops asking the player to estimate a magnitude and **shows the
outcome instead**. For each of the fourteen actions the engine already integrates
the future; it draws where the marked body *ends up*. The player does not read a
forecast and infer a magnitude — they see fourteen dots and a ring, and pick the
nearest. **A nearest-neighbour comparison is the one spatial judgement humans
make instantly and without training.**

| policy | share of the ceiling |
|---|---|
| random, priced | 11.5% |
| aim, watch, aim again | 16.3% |
| the auditor's spin-then-aim | 15.2% |
| **pick the dot nearest the ring** | **78.8%** |

And a gate was written **to fail if that number went too high**: a mechanic that
takes a human to the ceiling has solved the game rather than made it playable,
which is the standing objection to every observability mechanic in this project.
It passed at ≤ 85%.

<!--R4-->

---

## The five panels

| panel | state | what it demonstrates |
|---|---|---|
| 1 · SEEDED | step 80, five bodies, wide frame | the universe exists, is rebuilt from the seed alone, and the marked body is a **noun** — ringed in white |
| 2 · SHOT 1 · CHOOSE | framed on the decision | the cyan ring is the target; fourteen UV rings are *landings*, not trajectories; the cyan tick is the engine showing its own arithmetic |
| 3 · SHOT 2 · CHOOSE | after the first shot resolves | the ghosts are recomputed **from what actually happened**; the budget bar has moved and unaffordable actions are struck through rather than hidden |
| 4 · RESOLVED | step 320 | the trail is what actually happened, sampled every fifth step as the round was played |
| 5 · DO NOTHING | the same seed, untouched | the **screensaver detector** — if this looked like panel 4, the universe would be producing the score and the player would be an observer |

## The visual system, and why each band means what it means

The corpus rule is load-bearing: *a band whose colour lies about its content is a
defect, not a style preference.*

- **matter** — what IS: the bodies, their trails. The marked body carries a white
  halo, because a player steering one of five identical dots has no noun in the
  sentence.
- **UV** — what is HIDDEN or SYNTHETIC: the ghosts. A ghost is a **computed
  future that does not exist in the universe being drawn**. Painting it in matter
  colours would assert that a prediction is a position — the same class of lie as
  game two's screen drawing equations the game had not produced. They are hollow
  rings, never filled discs, for the same reason.
- **IR** — what MIGHT go wrong: a ghost whose action **loses the body entirely**,
  and the budget bar as it empties.
- **cyan / ENGINE** — what the ENGINE READS: the ring (the one region the scorer
  looks at) and the tick on the nearest ghost.

**Unaffordable ghosts are drawn and struck through, not hidden.** Removing them
would remove the cost decision instead of presenting it. The strike is a line
rather than a hue, which is the only encoding that survives a colour-blind
reader.

---

## What the screenshot found that no metric did

Standing rule (H) — render before concluding — earned its place three more times
in this increment. Every one of these passed every balance measurement:

1. **The trails drew the future.** The first generator ran a clone *forward* and
   painted the result as history. A trail is the only thing that makes a momentum
   system legible in a still frame, and drawing where a body *will* be in the
   visual language of where it *has* been is precisely the lie the spectrum rule
   forbids. The round is now played once with a recorder attached.
2. **All five panels drew the same state.** A `DarkView` holds a live reference
   to the universe, and the panels were collected first and rendered last — so
   every one showed the final frame. "SEEDED" was captioned *five bodies at step
   80* and rendered *seven bodies at step 320*. The captions were right and the
   pictures were all the same picture.
3. **The decision was an unreadable blob, and framing on the body made it
   worse.** Over a 240-step round the marked body **drifts much further than the
   landings spread**, so including its position in the camera extent hands the
   scale to the drift and collapses the entire choice into a few pixels. The
   frame is now the ghosts and the ring; the body is usually outside it and its
   trail leads in — which is the correct relationship, since the player is
   choosing between futures rather than looking at a dot.

**And the screenshot found a design defect independently of the numbers.** The
first pricing charged every drop 1.0 against a budget of 1.7; the picture said
*"12 of 14 are now out of reach"* after a single shot, and the simulation
separately measured the budget costing 33 points of ceiling. Two flat prices and
two shots admit no middle — either every second shot is affordable or none is. A
drop is now charged **for its leverage**: the closer it lands to the marked body
the more it moves it and the more it costs, which is the one pricing rule the
physics itself supplies rather than a balance knob.

---

## What this gate does NOT claim

- **It is not a depth result.** The ceiling is rich — 5.30 bits of move-value
  entropy, ~3.6 live sequences in 196 — and the shipping policy reaches most but
  not all of it. Whether the remainder is interesting *to a person* is not
  something any of these instruments measured.
- **It is not a rendering claim.** A game that is only good because it looks good
  has not passed; the vertex-GPU pipeline is a separate gate.
- **Negative selection is not positive selection.** Four designs failed here. The
  claim is that *those* designs failed, not that a physics sandbox cannot carry a
  straightforward game.

## Open, and stated as open

1. **The marked body is off-frame during a decision.** Correct for the gate, and
   a real interface needs an edge indicator. Not built.
2. **Multi-round play is unmeasured.** Every number is for a single two-shot
   round.
3. **No versus or co-op executor exists** for this game, and the pari-mutuel
   layer is not wired to it.
4. **No audio or haptics.**
5. **The persona population has not been run against this ruleset**, so the
   median-persona gate (revision 8) is unfired — the ghost rule is executable by
   *a* rule, not demonstrably by the median human.
6. **Stages 1–5 of the Monte Carlo plan have not run.** This is a baseline proof,
   which is a much smaller thing than the screening design it was meant to seed.
7. **The 4D level** remains a factor with a comprehension gate, unscreened.

---

## What I need from you

1. **Approve or revise the visuals** (`design/dark-sheet.png`).
2. **Approve the shipping configuration** in `game/dark/steer.ts` — in
   particular **twelve bearings rather than twenty-four**, which is the rare case
   where the coarser option is the measured one, and **two shots**, which is
   arithmetic about the reachable set rather than a difficulty setting.
3. **Accept the ghost-landings mechanic**, or tell me showing the landings is too
   much information — in which case the measured alternative is *no* playable
   game, not a harder one, and that is the thing to argue with.
4. **Say whether Darkmatter ships as the third launch game**, or whether the four
   failed proofs mean it should be replaced.
