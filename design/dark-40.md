# Darkmatter — 40 candidates, and why the number is 40

Not a wish list, and deliberately **smaller than the last two**. Chemical
generated 115 ideas and then 50; of the 50, **48 were eliminated on two
measurements rather than tested**, and that sits on the project's open list as a
known weakness. Generating past what the design can adjudicate does not widen the
generator — it produces decoration and then discards it unexamined.

So the count is derived rather than chosen.

---

## Why 40

**Step 1 — the budget, measured.** 605 ms per 440-step play at twelve bodies
(`scripts/probe/dark-legible.ts`, timed before the design was sized; rule G).

**Step 2 — what a screening cell costs.** M1 measured a Spearman legibility
coefficient whose sampling noise over twelve actions is ≈ 0.30. To resolve a
difference of 0.2 between two levels, σ/√n < 0.1, so **n ≈ 9 seeds**. A cell is
9 seeds × 13 plays (12 actions plus the do-nothing baseline) = 117 plays =
**71 seconds**.

**Step 3 — how many cells fit.** A four-hour stage-1 cap is 14,400 s ÷ 71 s =
**203 cells**. A resolution-V two-level fractional factorial needs 2^(k−1) cells:
k = 7 → 64 cells, comfortably replicated; k = 8 → 128 cells, unreplicated, at
2.5 hours with headroom. **The design can adjudicate eight factors.** Not nine.

*Engine savings are deliberately excluded from this arithmetic.* Prefix caching
and racing (ORRERY E5 and E10) should cut per-cell cost roughly in half, but rule
G says the design is sized to the **measured** cost. Savings become replicates —
the pre-registered degradation path run in reverse — rather than more factors.

**Step 4 — how many candidates that implies.** Eight factors, each of which is a
*question*. A factor level is only a real choice if it was selected from a
genuine field rather than a pair, so each question gets **four competing
answers**: 8 × 4 = **32 testable candidates**.

**Step 5 — the tail, which is not allowed to be selected for testability.**
EINCOL's one rule is *widen the generator, never the judge*. Trimming the tail to
what the design happens to be able to screen is the judge reaching back into the
generator. Step 2 of the round produced eight rows and this document carries
**eight more that the design cannot carry as levels**, unpruned.

> **32 + 8 = 40.** Every number in that sum is traceable to a measurement or to
> the protocol, and the count came out lower than the last two rounds because the
> project learned that it should.

---

# Part 1 · The 32, as eight factors with four answers each

Each factor is a question the Monte Carlo run will answer. The **[current]** mark
is what Darkmatter does today; the measurement that motivates the question is
named, because a factor with no measurement behind it is a preference.

---

## D1 · OBJECTIVE — what is being scored?

*Motivated by:* M1. The best human-executable rule beat a random ranking by 0.08
against a sampling noise of 0.30. A statistic of the whole system has no visible
referent — a player cannot see "moment of inertia".

1. **Inertia band, scale-free.** Hold the system's second moment inside a band
   defined relative to what doing nothing produces. **[current]**
2. **Noun delivery.** A named body reaches a named place. The pool structure:
   the objective is a noun reaching a noun, and success is visible without being
   told the score.
3. **Shape match.** A target silhouette — a ring, a bar, two lobes — shown beside
   the live system. The player compares two pictures and never learns a number.
4. **Prediction error.** Commit to where a marked body will be at the end, then
   act; score the error. Turns the Lyapunov horizon from a fairness hazard into
   the scoring surface.

## D2 · SCENE SIZE — how many nouns are on screen?

*Motivated by:* the tail row at p=0.09. Twelve bodies is a cloud, and a cloud has
no nouns in it. Also by M1's two dead seeds — response may depend on size.

1. **12 bodies.** **[current]**
2. **6 bodies.**
3. **3 movers + 9 fixed masses.** The distinction between *state* and *terrain*,
   which is what makes a pool table readable: the pockets do not move.
4. **5 bodies, one of them marked as the player's.**

## D3 · ACTION LATTICE — how is the decision presented?

*Motivated by:* the whole cue. A continuous placement crossed with a continuous
magnitude is not a decision, it is a dial. Also by engine rule C: the ceiling
must be able to play the player's move, which is impossible if the player's
action space is finer than the search's.

1. **Continuous bearing × continuous magnitude.** **[current]**
2. **12 discrete bearings at one magnitude.** What M1 and the falsification probe
   both used, so its behaviour is already partly measured.
3. **A hand of 5 drawn from a deck of named interventions** — Chemical's
   three-options finding transplanted: exposing a small ranked set raised naive
   throughput 41% there.
4. **24-cell lattice: 12 bearings × 2 radii.**

## D4 · COST — what constrains action?

*Motivated by:* M4, and it is the strongest single result of the round. REMOVE
scores 0.375 for free and **0.000** under any budget a game would set. The
evaluator's standing gap: *"without a cost the player is not playing a game; they
are executing a cheat code."*

1. **No cost.** **[current]**
2. **One currency, one budget for the round.**
3. **Per-verb prices against a budget.** The configuration under which the verb
   ranking measurably changes.
4. **A hard count of N actions**, with no price differences.

## D5 · TEMPO — when does the player act?

*Motivated by:* the pool analogy, property 2. The decision is complete before the
physics starts, so there is no continuous control problem to solve.

1. **Continuous intervention into a running system.** **[current]**
2. **One shot, then watch to the end.**
3. **N shots at fixed intervals.**
4. **N shots, each offered only when the system is readable** — see D6.

## D6 · REST — does the consequence finish arriving?

*Motivated by:* the pool analogy, property 3, and it is the property least
represented anywhere in the existing design. Darkmatter's universe never rests,
so every decision is taken against a state still carrying the unresolved
consequence of the last one.

1. **Never; the universe runs continuously.** **[current]**
2. **Damped between shots** until kinetic energy falls below a threshold.
   *Flagged:* damping is LAST in the pre-registered Lyapunov remedy order because
   it conflicts with the momentum requirement. Screened, not assumed.
3. **Frozen preview** — time stops while choosing, and only while choosing.
4. **Score locks on the event**, not at the horizon: the moment the body crosses
   the zone, the outcome is banked and the rest is spectacle.

## D7 · FORECAST — what is shown ahead?

*Motivated by:* Chemical revision (E). Observability is the preview dial and it
traded 31.6 points of agency floor for 47 points of solver margin. Reported
against solver margin here, or Darkmatter rediscovers the same trade and calls it
a win.

1. **Nothing beyond the current frame.** **[current]**
2. **Trails.** Without them a photograph of an orbit and of a standstill are the
   same picture. **[shipped]**
3. **A forecast cone per body**, widening at the measured λ = 0.098 — so the
   picture shows how far ahead prediction is trustworthy, and the fairness
   readout and the interface are the same object.
4. **The full predicted path for the action under consideration**, before
   committing.

## D8 · VERB SET — which verbs are available?

*Motivated by:* M4. Three verbs reach the band; two survive a budget.

1. **MASS only** — best equilibrium score 0.529. A game with one verb is a
   button, and this level exists as the negative control that should lose.
2. **MASS + TORQUE** — 0.529 and 0.495. Torque injects a *different conserved
   quantity* than a linear impulse, which is why it reaches where impulse (0.005)
   does not.
3. **MASS + TORQUE + REMOVE, priced.** Removal is strong (0.375) and expensive
   (1.4), so it becomes the round's one big swing.
4. **All six** — mass, torque, remove, split, impulse, phase.

---

# Part 2 · The 8 the design cannot carry, generated anyway

The protocol's rule is that the generator is never narrowed by the judge. These
are here because they were generated, not because they will be screened. Each
names what would have to be true for it to matter.

33. **The player never intervenes at all.** The game is a pari-mutuel market on a
    seeded universe — the repository's economic layer with no game on top of it.
    *Would matter if:* the measured problem is that intervention is illegible,
    and prediction is legible; M1 says the first half is true.

34. **Two universes, one action.** The same intervention applied to a seeded
    pair that differ by one bit, scored on the **difference**. Makes chaotic
    divergence the subject of the game rather than its fairness problem.
    *Would matter if:* λ cannot be reduced without killing the momentum
    requirement — then stop fighting it and score it.

35. **Played backwards.** The player is shown an end state and must choose the
    intervention that produced it. An inverse problem, which is a genuinely
    different verb from anything in the three games.
    *Would matter if:* forward prediction stays unrankable while recognition
    stays easy — the asymmetry that makes jigsaw puzzles work.

36. **The player is a body.** Not an outside hand: you are in the system, and
    your own trajectory is what you steer. Every intervention is then also a
    reaction on yourself, which is Newton's third law as a game rule.
    *Would matter if:* ownership is what creates stakes, per tail row p=0.08.

37. **Time is the resource.** You may rewind, and each rewind costs score. The
    Lyapunov horizon stops being a constraint and becomes a commodity the player
    buys when the forecast cone is too wide to act on.
    *Would matter if:* the fairness problem and the economy can be the same
    mechanism.

38. **One universe across all three games.** Farkle's dice and Chemical's
    molecules are bodies in Darkmatter's universe; a Farkle round perturbs it.
    *Would matter if:* the ecosystem framing needs a shared substrate rather than
    a shared art direction — which is the thing "glass_labs almost had right".

39. **Render only the uncertainty.** The bodies are never drawn; only their
    forecast envelopes are. The picture shows what is *known*, not what *is*.
    *Would matter if:* P4 is real — that the reachable set is large in
    coordinates no player perceives — in which case draw the coordinates that
    matter and nothing else.

40. **No objective; the score is how surprised the engine was.** The Monte Carlo
    search's own entropy at the chosen action becomes the scoring function: you
    win by doing something the engine did not rank highly and having it work.
    *Would matter if:* a self-referential objective is the only one that cannot
    be solved out — and it is the only candidate here that requires the engine to
    ship inside the game rather than beside it.

---

## What the run is entitled to conclude, written before it runs

Negative selection is not positive selection. If these factors fail, the claim is
**"these factors failed"** and not *"a physics sandbox cannot be a straightforward
game"*. Standing instruction (I), carried from the Chemical plans.
