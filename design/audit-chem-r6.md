# Independent audit — reaction scoring, round 6

Provenance: **emitted after deliberation** through the rebuilt harness. Record:
`design/audits/chem-r6.json`.

**VERDICT: APPROVE.** The first clean, emitted approval in this track — rounds 1,
3, 4 and 5 all returned REVISE, and round 2's approval was withdrawn by us as
trace-mined.

## It withdrew its own round-5 finding

> "I accept. My previous assessment of 'brittleness' was a category error. I was
> concerned with the mathematical possibility of partitioning an arbitrary set of
> atoms into the library; however, since the player's input set is itself a
> subset of the library, a valid partition is tautologically guaranteed. The
> actual constraint is not the existence of a partition, but the existence of a
> valid reaction path, which you have correctly identified as a 'dud' problem
> rather than a 'brittleness' problem."

Worth recording because the alternative was available and would have been wrong:
round 5 demanded conservation of mass be relaxed, and complying would have thrown
away a physical law to fix a problem that does not exist. Measuring instead of
complying was the right call, and the auditor agrees on the evidence.

## What it accepted

**(b) The genre changed, and it named the change precisely.** Enumerating live
moves takes the game "from a 'Search' puzzle (where the player must discover the
reaction) to an 'Optimization' puzzle (where the player must choose the most
efficient reaction)", and given the 83% dud rate "the 'Search' version would have
been a frustration engine". Accepted as stated — this is a real trade and it was
made deliberately.

**(c) The instinct trap is a feature.** That the match-3 heuristic now scores
worse than random is "a 'usability trap' that functions as a 'pedagogical
pivot'... you create a moment of cognitive dissonance that forces the player to
abandon instinct and adopt the new logic." Accepted, with the note that it is
genuinely high-friction and the onboarding has to earn it.

## (d) — ACCEPTED, BUT ITS REASONING OVERSTATES WHAT WAS MEASURED

> "It demonstrates that players are successfully internalizing the underlying
> logic of chemical stability and reactivity... without needing to memorize the
> specific values in your table. This is the definition of conceptual transfer."

**It does not demonstrate that, and the distinction must not be lost just because
the conclusion is flattering.** What was measured is that a POLICY embodying the
concept outscores one that does not, by 35.5% at t = 15.07. That is a fact about
the game's incentive structure, not about human cognition. No human played
anything.

The honest claim, and the only one anything here supports:

> **The game mechanically rewards a chemical concept over the match-3 instinct,
> by a large and significant margin, without requiring any memorisation.**

That is a *necessary* condition for teaching and not a sufficient one. Whether
players actually internalise it needs players, and this project has none.
Recorded as an open limit rather than quietly upgraded to the auditor's wording.

## (e) — ACCEPTED. The next real finding.

> "The design teaches that endothermic reactions are 'invalid' or 'impossible'
> moves rather than simply 'energy-requiring' ones. By 'refusing' the N₂ + O₂
> reaction, the game treats endothermicity as a violation of the game's rules
> rather than a fundamental thermodynamic reality where energy must be supplied
> to drive the process."

Correct and specific. Endothermic reactions happen constantly — they just need
energy put in. Photosynthesis is endothermic. The Haber process needs heat and
pressure. Electrolysis splits water by paying for it. A game that says "no" to
N₂ + O₂ implies such reactions cannot occur, which is false and is the kind of
false that sticks.

It is also a better mechanic than the refusal. An endothermic reaction should be
*available at a price* — spend banked energy to drive one uphill — which is
exactly what driving a reaction means, and which turns a dead end into a
decision. That is the next cycle, and it goes to audit before it is built.
