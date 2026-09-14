# EINCOL round 2 — Darkmatter, and the round that retracted round one

Run against `EINCOL.md` read fresh, not recalled. Five steps, in order.

Round one asked what *expands* the reachable state space. This round asks the
question the user actually needs answered, which is a different and smaller one.

---

## Step 1 · The cue, loaded with material measured today

**The question, stated once and specifically:**

> What is the smallest **complete decision** a Darkmatter player makes — and is
> it **decidable from what they can see** before they make it?

Games one and two answer that in a sentence and game three cannot. Farkle:
*"roll again, or bank"* — decidable from the dice and the score. Chemical:
*"which adjacent set, which of three products"* — decidable from the board.
Darkmatter currently offers a continuous placement crossed with a continuous
magnitude, which is not a decision. **It is a dial.**

**What I measured first, before generating anything.** Five numbers, three of
which are open items the last increment left behind rather than fresh curiosity.
`scripts/probe/dark-legible.ts` and `scripts/probe/dark-null.ts`.

### M0 · the budget, measured before the design was sized

**605 ms** per 440-step play at 12 bodies; 170 ms at 8 bodies over 300 steps.
Rule (G) of the plan exists because run one committed to 64 cells and *then*
timed three of them. Everything below is sized to this number, and the first
draft of M2 was rewritten when the arithmetic said it would cost five minutes of
identical work.

### M1 · decision legibility — can a rule a human can run rank the actions right?

Twelve mass drops around the ring. Truth is the equilibrium score after 360
steps. The heuristics are rules a player could execute from a still frame.

| heuristic | rank correlation with truth |
|---|---|
| drop toward the dense side | **0.156** |
| drop ahead of the rotation | 0.131 |
| drop toward the sparse side | −0.156 *(the same number; it is the negation)* |
| **RANDOM — the mandatory negative control** | **0.076** |

**And two of five seeds had ZERO outcome variance.** Twelve different
interventions, one identical score.

The best human-executable rule beats a random ranking by **0.08**, on four to
seven samples where the sampling noise of a Spearman coefficient over twelve
points is about **0.30**. *The player cannot tell a good action from a bad one.*
That is the finding of this round and everything else is downstream of it.

### M2 · the resolution floor of the novel-distance metric — standing rule B

The last increment published *"timing is worth three times more than which verb
you use"* from these two numbers, and flagged that their null had never been
measured. It has now been measured, on round one's harness verbatim, so the
observed values reproduce exactly.

The null is a point whose true novelty is **zero by construction**: one verb,
one application, at a parameter value falling *between* the reference grid's
levels. It lies in the single-verb reachable set by definition, so whatever the
estimator reports for it is the grid spacing showing through.

| composition | novel distance | vs floor |
|---|---|---|
| all at once, one operator | 0.0000 | — *(structural zero, the control works)* |
| split in time, SAME operator | 0.1464 | **0.99×** |
| split in time, DIFFERENT operators | 0.1949 | **1.32×** |
| **NULL — off-grid single impulse** | **0.1480** | — |
| NULL — off-grid single mass | 0.0580 | — |

**Both effects are inside the ruler.** The same-operator split reads *below* the
floor. The mixed-operator split clears it by a third, which is not a finding in a
metric with two nulls that differ by a factor of two and a half between
themselves.

> **RETRACTED: "timing is worth 3× operator choice."** The Lie-bracket import
> from quantum control remains a good structural analogy and has produced no
> evidence. Round one closed with *"these are directional findings, not gated
> ones"*; they are now not findings at all.

*The first version of this null was also wrong and was caught before it ran.* It
replaced the composed point with a point drawn **from** the reference set — a
point whose min-distance is exactly 0 because it is a member of the set it is
measured against. A null that cannot fail. That would have been this project's
sixth vacuous control; it is the first one caught at the writing desk rather than
in the output.

### M4 · how many verbs reach the equilibrium band? Round one found one.

Round one screened two verbs. Six are screened here, and a **cost** is attached
to each — the evaluator's standing gap, verbatim: *"without a cost the player is
not playing a game; they are executing a cheat code."*

| verb | best equilibrium score | best at cost ≤ 1.2 | cost of its best |
|---|---|---|---|
| do nothing | 0.000 | 0.000 | 0.00 |
| **MASS injection** | **0.529** | 0.529 | 0.52 |
| **TORQUE (angular-momentum couple)** | **0.495** | 0.495 | 0.36 |
| REMOVE a body | 0.375 | **0.000** | 0.56 |
| PHASE shift | 0.019 | 0.000 | 0.85 |
| IMPULSE | 0.005 | 0.005 | 0.09 |
| SPLIT a body | 0.000 | 0.000 | 0.00 |

**Open item (c) closes: there is a second working verb, and it is TORQUE.** An
angular-momentum couple injects a *different conserved quantity* than a linear
impulse, which is why it reaches where impulse does not — impulse scores 0.005,
which is zero with a rounding error on it.

**Open item (b) — cost — turns out to change the ranking, not just the flavour.**
REMOVE reaches 0.375 for free and **0.000** under any budget a game would set,
because its flat price of 1.4 exceeds the cap. A verb that is good only when it
is free is not a verb, it is a cheat code, and this is the first measurement in
the project that could have told them apart.

---

## Step 2 · A distribution, not an answer

Honest priors on *what would make Darkmatter a straightforward game*, given that
the measured problem is that actions are not rankable. The last rows are meant to
feel unlikely.

| p | Candidate |
|---|---|
| **0.22** | **Discretise the action space.** Replace the continuous dial with a small hand of named interventions. Row one: true, generic, what every sandbox-to-game conversion does, and it closes nothing on its own because twelve discrete drops were exactly what M1 measured as unrankable. |
| **0.17** | **The objective is the problem, not the action.** A statistic of the whole system — moment of inertia inside a band — has no visible referent. A player cannot see "inertia". They can see a body and a place. |
| **0.14** | **The decision is WHEN, not WHERE.** One verb, and all the skill is in the moment — Farkle's "again?" asked against a moving system. Round one's own data pointed here; §M2 has now withdrawn that support. |
| **0.13** | **The cost is the game.** With prices and a budget, "is this worth 3 of my 10?" is a decision a human makes instantly with no physics at all. The physics may stay opaque and the game still works. |
| **0.11** | **Commit-then-watch, not continuous control.** Two phases: plan against a frozen forecast, then release and watch it play out. That is the shape of games one and two and it is not the shape of a sandbox. |
| **0.09** | **The universe is too big to have nouns in it.** Twelve bodies is a cloud. Three bodies is the famous problem and every one of them can be pointed at. Legibility is a body-count decision, not a rendering decision. |
| **0.08** | **The player should own exactly one body**, and the other eleven are terrain. Their whole model becomes "where does *mine* end up", and the chaos stops being state and becomes weather. |
| **0.06** | **There is no decision to make legible, because the system is not actually responsive.** Two of five seeds gave twelve actions one identical score. Before designing an interface, check that the thing being interfaced to has a gradient at all. |

---

## Step 3 · Working the tail

Row one closes nothing, exactly as the protocol predicts: the action space was
*already* discretised into twelve for M1 and M1 is what found the problem.

**p=0.06, "the system is not responsive."** This is the cheapest and it is
partly already answered: two of five seeds were flat, and M5's branching numbers
say the rest are nearly flat. It is not the whole story — three seeds do vary —
but it sets an order of work. *An interface cannot make a flat response legible*,
so responsiveness is measured before anything is drawn.

**p=0.09 and p=0.08, body count and ownership.** Both predict the same thing and
it is cheap to test: legibility should rise sharply as body count falls, because
a heuristic about "the disc" is a heuristic about an aggregate and a heuristic
about three bodies is a heuristic about three bodies. Measured in step 4.

### The structural analogy, imported because the tail was thin

**Pool.** Not for flavour — for a specific reason. Pool is a continuous-control
physics game with genuine chaotic sensitivity, and novices play it competently on
their first afternoon. Three properties do that work, and **Darkmatter has none
of them**:

1. **The objective is a noun reaching a noun.** "That ball, that pocket." Not
   "the system's second moment inside a band." A player can see whether they
   succeeded without being told the score.
2. **The player acts once and then watches.** The decision is complete before the
   physics starts. There is no continuous control problem to solve.
3. **The table comes to rest.** The consequence fully arrives, and the next
   decision starts from a state that can be read. Darkmatter's universe never
   rests, which is why the "next decision" is taken against a state still
   carrying the unresolved consequence of the previous one.

That is a borrowed *relational structure*, and it makes three separate falsifiable
predictions rather than one vibe. It also reframes rows 0.17, 0.11 and 0.14 as
three faces of one thing, which is what a good analogy does.

---

## Step 4 · Falsifying my own finding, in writing

**The claim, stated generally:**

> *Darkmatter is illegible because its objective is a statistic of the whole
> system. Make the objective a NAMED BODY reaching a NAMED PLACE — and the player
> can rank actions without understanding the physics.*

**The case the claim would get wrong, and I looked for this hardest.** A noun
objective may be legible *because it is trivial*. If "aim at the target" ranks
actions perfectly **and** only one action ever scores, then the game became
straightforward by ceasing to be a game — the exact mirror of Chemical's
convergence-engine finding, where the declared route narrowed the tree and every
metric except the horizon called it depth.

So `scripts/probe/dark-noun.ts` measures legibility and branching **together**,
on one action grid, and a legibility win with a branching collapse is recorded as
a failure rather than a result.

**Two defects in the first version of that probe, both found by running it**, and
both recorded because the tally of instrument defects against design findings is
the reason the standing instructions exist. It used **one heuristic for both
objectives** — scoring the "aim at the zone" rule against the inertia band, where
it means nothing — and its **zone was a fixed world point that nothing reached**,
best score 0.142 out of 1.0 on five of seven dead seeds. Corrected: each
objective is scored against *its own* rule, both objectives are made scale-free
(the band target of 34 was calibrated at twelve bodies and moment of inertia
scales with body count), and the zone is placed per seed by the plan's own **N2
viability oracle** — at a landing some action reaches and inaction does not.

Nine seeds, twelve mass drops, three scene sizes:

| bodies | objective | legibility | random | live seeds | live moves | entropy | do-nothing | best |
|---|---|---|---|---|---|---|---|---|
| 12 | BAND | n/a | n/a | **0/9** | n/a | n/a | 0.000 | **0.000** |
| 12 | NOUN | **−0.176** | +0.080 | 9/9 | 1.0 | 0.44 | 0.000 | 1.000 |
| 6 | BAND | 0.296 | 0.103 | 4/9 | 1.0 | 0.59 | 0.000 | 0.132 |
| 6 | NOUN | −0.093 | −0.017 | 9/9 | 1.0 | 0.34 | 0.000 | 1.000 |
| 3 | BAND | 0.196 | −0.115 | 7/9 | 1.3 | 1.31 | 0.000 | 0.503 |
| 3 | NOUN | 0.064 | 0.050 | 9/9 | 1.0 | 0.55 | 0.000 | 1.000 |

### The claim is falsified, and not in the way I predicted

I predicted the failure would be **triviality** — legible because only one answer
exists. What happened instead:

**The noun objective's own human rule reads NEGATIVE.** −0.176 against a random
control of +0.080 at twelve bodies. *Aiming at the target is worse than guessing.*
The legibility did not arrive.

**What the noun objective did fix is responsiveness, not legibility.** 9/9 live
seeds against **0/9** for the band. At twelve bodies a single mass drop cannot
move the system's second moment by a quarter — which is the cause of M1's two
dead seeds and M4's low ceilings, and it had been read as difficulty.

**And one number in that table is mine, not the game's.** `live moves 1.0` for
NOUN is an **artifact of how I placed the zone**: the zone *is* the landing of the
furthest action, so exactly one action scores 1.000 by construction. It is not
evidence that the noun objective has one answer. Stated rather than quietly
enjoyed, because a viability oracle that manufactures the answer is the curator
problem the plan's own N2 was written to bound.

**Tail row p=0.09 is falsified too.** Legibility does not rise as bodies fall:
band legibility is 0.296 at six bodies and 0.196 at three. What *does* rise is
**liveness** — 0/9, 4/9, 7/9 — and best score, 0.000, 0.132, 0.503. Scene size is
a responsiveness dial, not a legibility dial.

### Why the intuitive rule is worse than guessing — measured, not inferred

"The heuristic reads negative" is equally consistent with my having wired the
heuristic backwards, so `scripts/probe/dark-intuition.ts` measures the mechanism
directly: the angle between the bearing of the drop, *as seen from the body*, and
the body's actual displacement from where it would otherwise have been.

| horizon | mean angle | median | within 45° | beyond 135° | mean displacement |
|---|---|---|---|---|---|
| 30 steps | **2.2°** | 1.3° | **100.0%** | 0.0% | 0.015 |
| 60 | 5.0° | 2.7° | 98.1% | 0.0% | 0.067 |
| 120 | 12.2° | 6.3° | 95.4% | 0.0% | 0.276 |
| 240 | 29.3° | 13.7° | 81.5% | 4.6% | 0.850 |

**The negative control is the top of the table and it fires.** At a short horizon
intuition is *exactly right* — 100% of drops move the body within 45° of the
direction a player would expect. So the heuristic is not wired backwards; it is
correct, and it **decays with the horizon**.

> **Corrected claim, and both versions are kept:**
>
> ~~Darkmatter is illegible because its objective is a statistic of the whole
> system.~~
>
> **Darkmatter is illegible because it is measured at a horizon where intuition
> has decayed. The DIRECTION of a mass drop's effect is intuitive — 95% correct
> within 45° out to 120 steps — and the MAGNITUDE never is. The game was scored
> at 360 steps, where direction has drifted to roughly 30° and the outcome is
> decided by the magnitude nobody can estimate. The objective was not the
> problem. The horizon was.**

That reprices the whole candidate set. **HORIZON was not among the eight factors**
and is now one of them, displacing TEMPO — of which it is the measurable half —
and it is also the *first* entry in the pre-registered Lyapunov remedy order,
adopted from the round-one audit long before there was a reason to reach for it.

It also explains the one thing that had looked like good news. The forecast cone
(D7.3) stops being "showing the player more", which Chemical measured as a
one-for-one trade against solver margin, and becomes the **only** channel through
which the undecidable half of the decision can reach the player at all. Direction
they can see. Magnitude they cannot, at any horizon. If magnitude matters and is
not shown, the game is a guess wearing a physics engine.

---

## Step 5 · Hand it to an evaluator I do not control

→ `design/briefs/dark-eincol-2.json` (rung 3), and the baseline plan that comes
out of this round goes to the auditor **after** its Monte Carlo proof, not
before — the user's requirement is that the plan be *both* proven and audited.

Rung 2 ran first and is what produced the retraction above; rung 1 is the
engine's job.

**Negative controls, and they earned their keep this round:**

- M1's random ranking read **0.076** where the real heuristics read 0.156 — which
  is how we know 0.156 is nothing, rather than how we know it is something.
- M2's "all at once" composition read **exactly 0.0000**, because it *is* a
  member of the single-verb set. A number that is exactly right for a structural
  reason.
- M2's first null was degenerate and was killed before it ran.
- M1 and the noun probe both **skip seeds with zero outcome variance** and report
  how many were skipped, rather than averaging a flat response into a mean.

### What the evaluator found that I did not

The auditor read the corrected claim, the baseline built on it, and the proof
that failed, and returned **REVISE** with a headline I had not reached:

> *"The baseline is currently attempting to solve a 'One Shot' problem that the
> data has already falsified. The 'One Shot Cannot Aim' measurement proves that
> the game, as currently structured, is actually a game of **sequence and
> momentum management**, not a game of single-action precision."*

And on my proposed fix — "allow a second shot" — it refused the framing outright:
*"It is an admission... The design must either move to continuous control, or
more productively pivot the objective from aiming to sequencing, where the player
uses the first shot to set the momentum for a second, more precise
intervention."*

I had treated the second shot as a patch to an aiming game. It is a different
game, and the coverage numbers were saying so before the auditor did: **10.8
distinct landings and 33.7% coverage with one shot; 48.3 and 64.1% with two.**

It also upheld the retraction more strongly than I had claimed it — reading the
off-grid null as measuring *"the continuous ceiling of single-verb actions"*,
which defines the floor at higher fidelity than the discrete grid does, so the
withdrawn finding had been compared against a floor that was too low rather than
merely unmeasured.

---

## What this round changed

1. **A published finding was withdrawn**, one increment after publishing it,
   because its null was finally measured. Standing rule B worked, and it worked
   late.
2. **The horizon became a factor and displaced tempo**, on the intuition-decay
   curve. It is also first in the pre-registered Lyapunov remedy order, adopted
   from the round-one audit long before there was a reason to reach for it.
3. **The objective stopped being the suspect.** The band was unreachable, not
   difficult, and the noun objective fixed responsiveness rather than legibility.
4. **A second working verb exists** — torque, 0.495, and perfectly monotone
   across its sweep, so its intuition is exactly right where mass injection's is
   not. Open item (c) closes.
5. **Cost changes the verb ranking**, not just the flavour. Open item (b) closes.
6. **Darkmatter is a sequencing game**, on the auditor's ruling and the coverage
   measurement together — not an aiming game with more shots.
