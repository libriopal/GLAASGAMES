# P0 — fifteen experiments for GLAASGAMES

Each is a **game that is also a measurement**. That is the constraint that makes
this list different from a brainstorm: this project's identity is that its claims
are proven, so an experiment earns its place only if playing it *produces a
number somebody could be wrong about*.

Every row therefore carries a **claim**, an **instrument**, and the **result that
would kill it**. A row without a killing result is a feature request wearing an
experiment's clothes, and there are none here.

All fifteen run on machinery that already exists: a 6×6 board, hidden 1-out-degree
links, charge propagation, commit–reveal with a rules hash, and `verify-learnable`'s
policy harness. That is deliberate — the cheapest experiment that can still be
wrong beats an expensive one that cannot.

---

## The measured gap this list has to close

| Measured | Value | Source |
|---|---|---|
| inference value of the observation trail | **+6.3%** | `verify-learnable` E7 |
| clairvoyant ceiling (perfect information) | **54.4%** | E7 |
| **fraction of available information the player captures** | **≈12%** | E7 |
| human ratings in the corpus | **0** | Stage 0, all `rating: 0` |
| `scoreJudgment` / `concordance` in the foundry | **DISABLED** | no human data exists |
| fitness signal available to breed on | **none** | the foundry cannot select |

**The foundry cannot breed.** It has `computeFitness`, `BRANCH_WEIGHTS`, a
novelty gate and a W7 calibration gate, and nothing to rank candidates *with*.
An experiment that produces a genuine fitness signal is therefore worth more than
one that produces a better game, because without it there is no second
generation.

---

## The fifteen

### Group A — vary what is hidden and how you learn it

**1. Lattice** *(baseline, shipped)*
Infer a hidden directed graph by watching where charge appears.
**Claim:** inference pays. **Instrument:** E7. **Killed by:** trail ≤ blind.
*Status: measured at +6.3%. Alive.*

**2. Blind Cartographer** — *declare before you bank*
Before banking, optionally **declare** which neighbour you believe the cell
feeds. Correct doubles the face component; wrong halves it; declining is today's
game.
**Claim:** an optional, priced declaration makes belief explicit without changing
what is knowable, and a player who declares only when confident beats one who
never declares.
**Instrument:** a calibration curve — declaration rate vs accuracy, per confidence
band. **Killed by:** declarers do no better than non-declarers, or accuracy is
flat across bands (players cannot tell when they know).
**Why it matters most: it is the only row that turns play into labelled data.**

**3. Fog** — you see charge only within radius r of your last bank.
**Claim:** locality forces route planning, raising the value of a *sequence*.
**Killed by:** edge unchanged from Lattice at r = board size.

**4. Cascade** — charge travels two hops; you are paid for one, you can see both.
**Claim:** more signal per action, harder attribution — net inference value rises.
**Killed by:** E7 falls. *(Note: paying for hop two was already tried and measured
worse — 4.2% → 2.1%. This varies visibility, not payout.)*

**5. Ebb** — charge decays each turn.
**Claim:** decay creates a real explore/exploit tension; early observation
appreciates.
**Killed by:** optimal play collapses to "bank immediately", i.e. the greedy
policy's edge over the learner *grows*.

### Group B — vary the topology

**6. Tessera** — hex, or a torus with no boundary.
**Claim:** boundary cells leak information (a corner has 2 neighbours, not 4), so
removing the boundary measurably *raises* inference difficulty.
**Instrument:** E7 on both topologies, same seed count. **Killed by:** no
difference — which would be a finding about the grid, not a failure.

**7. Half-Life** — cells carry age; older pays more, but is likelier to refill.
**Claim:** adds a timing decision orthogonal to inference (the two edges should
be additive, not overlapping).
**Killed by:** the combined edge ≤ max of the parts — the failure E8 already
caught once when two signals turned out not to compound.

**8. Chain** — you must bank a cell your previous bank fed.
**Claim:** a constrained action space sharpens inference by making each
observation load-bearing.
**Killed by:** boards become unplayable (stagnation rate rises past the existing
`MAX_RESHUFFLE_ATTEMPTS` guard).

### Group C — add a second mind

**9. Duel** — two players, one board, alternating banks; the opponent's banks are
free observations.
**Claim:** shared observation raises inference value for *both* — you learn from
their probes.
**Killed by:** edge per player ≤ solo edge.

**10. The Cartel** — asymmetric: one player sees the lattice and may not speak;
the other does not. The informed player can only signal through move choice.
**Claim:** costly signalling emerges without a channel being designed for it.
**Instrument:** mutual information between the informed player's move sequence
and the naive player's subsequent accuracy. **Killed by:** MI ≈ 0.
*This is the most scientifically interesting row and the least commercial.*

**11. Ladder** — everyone plays one daily seed; ranked.
**Claim:** a shared seed makes skill visible and produces population telemetry.
**Killed by:** score variance is dominated by seed luck rather than player —
measurable directly as between-player variance on a fixed seed.
*Feeds the foundry: this is where a fitness signal comes from at scale.*

### Group D — turn the machinery itself into play

**12. The Auditor's Game** — you are shown a *claimed* lattice and evidence from a
played round, and must decide whether the claim is true.
**Claim:** falsification is playable, and players get measurably better at it.
**Instrument:** d′ (signal detection) over sessions. **Killed by:** d′ flat.
*This is EINCOL as a game.*

**13. Reverse Lattice** — you author the hidden graph; an AI plays it; you score
on how *unlearnable* you made it, subject to passing the fairness oracles.
**Claim:** humans generate adversarial genomes better than random search.
**Killed by:** human-authored lattices no harder than seeded ones.
*Feeds the foundry: a human-in-the-loop mutation operator.*

**14. Provenance** — the corpus prompt that seeded your board is revealed at the
end, and collected.
**Claim:** the corpus is content, not just palette. **Killed by:** no measurable
effect on session length or return.
*The one row here whose instrument needs live users; flagged as such.*

**15. Foundry Arena** — two bred genomes play head to head; the human votes which
is the better game.
**Claim:** pairwise human preference is a usable fitness signal where absolute
rating is not (all 1129 corpus ratings are 0 — absolute rating has already failed
once in this project's history).
**Instrument:** Bradley–Terry over votes; inter-rater agreement.
**Killed by:** agreement no better than chance — which would say the population
is not yet distinguishable, a real and useful result.

---

## The pick, and why

**#2, Blind Cartographer.**

Worked as a distribution rather than a preference:

| p | Candidate to build first |
|---|---|
| 0.22 | #11 Ladder — the obvious "get telemetry" answer |
| 0.18 | #15 Foundry Arena — directly the fitness signal the foundry lacks |
| 0.14 | #9 Duel — the most commercial |
| 0.12 | #6 Tessera — the cheapest to measure |
| 0.10 | #12 The Auditor's Game — the best fit to the project's identity |
| **0.08** | **Tail: #2 — every other row needs users, a population, or a second player before it produces a single number. #2 produces its measurement from ONE player in ONE session, on the machinery already shipped.** |
| 0.06 | #13 Reverse Lattice |

**Working the tail.** #11 and #15 are the right long answers and both are blocked
on the same thing: they need a population that does not exist yet. #15 needs bred
genomes, which needs a fitness signal, which is what #15 is for — a loop that
cannot start.

#2 breaks it. A declaration is a **belief, priced and recorded**, so a single
session yields a calibration curve: how often the player declares, and how often
they are right when they do. That is a fitness signal derived from one player,
with no server, no population and no second generation required. It is also the
first thing in this project that measures what the *human* inferred rather than
what a *policy* could infer — E7's 6.3% is a statement about a program.

**Falsification, before building.** The claim is *"players can tell when they
know."* It dies if accuracy is flat across confidence bands — if people declare
at the same rate whether or not the evidence supports it. That is a real
possibility and the instrument reports it plainly rather than burying it.

**Second falsifier:** the declaration must not change what is *knowable*. If
declaring alters the board, the payout distribution, or the information available,
then #2 is a different game and its numbers cannot be compared to E7's. The
oracle asserts the observable projection is byte-identical with and without
declarations.

---

## AUDIT — and the fitness signal it forced me to change

The pick went to an independent auditor. The reasoning survived; **the metric did
not.**

> *"The strongest objection is that declaration accuracy measures PLAYER
> CALIBRATION, not GRAPH DIFFICULTY OR QUALITY. Accuracy is a confounded metric;
> it cannot distinguish between a well-designed graph and a trivial one. This
> bites if the breeding goal is difficulty or engagement: the evolutionary
> pressure will instead optimize for player certainty, likely converging on
> trivial graphs (to maximize accuracy) or impossible graphs (to minimize it),
> rather than finding a balanced difficulty curve."*

**Correct, and it would have been a bad generation-one fitness function.** Breed
on raw declaration accuracy and the population walks straight to "every cell
feeds the cell on its right": accuracy 1.0, difficulty zero.

### First repair, which was not enough

The obvious fix is to score **discriminability** rather than accuracy — reward
graphs where the player *can tell when they know*, so that declaring predicts
being right. Trivial graphs score 0 because everyone always knows; impossible
graphs score 0 because nobody ever does.

That still degenerates, and it is worth writing down why, because the failure is
not obvious: on an "all links point right" board, the player learns the rule from
one observation and then declares correctly every time. Discriminability against
*chance* is enormous. The metric rewards the trivial board again, one level up.

### The repair that holds: measure against a BLIND baseline, not against chance

The signal is the **trail lift on declarations**:

```
fitness = P(correct | declared, with observation trail)
        − P(correct | declared, trail withheld)
```

Both terms are measured on the **same board**, differing only in whether the
player's history is available — which is exactly the structure `verify-learnable`
E7 already uses and which this project has already validated against a
clairvoyant ceiling.

- **Trivial graph** — guessable without any history, so the blind term is just as
  high. Lift ≈ 0. Correctly worthless.
- **Impossible graph** — neither term beats chance. Lift ≈ 0. Correctly worthless.
- **Good graph** — the trail is what makes the declaration possible, so the first
  term rises and the second does not. **Lift is maximal at intermediate
  difficulty**, which is the balanced curve the auditor said accuracy could not
  find.

This is not a new instrument. It is E7 pointed at the human's declaration instead
of at a policy's move, and it inherits E7's negative controls including the
clairvoyant ceiling that stops the number being read as larger than the
information available.

**Residual risk, accepted and recorded:** lift is a *population* statistic. One
session gives a noisy estimate, so the per-session calibration curve is the
game-facing readout and the breeding signal needs many sessions pooled. That is a
smaller version of the population problem #11 and #15 were rejected for — but it
degrades gracefully to a usable single-player display, where theirs degrade to
nothing at all.
