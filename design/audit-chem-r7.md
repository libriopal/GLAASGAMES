# Independent audit — endothermic pricing, round 7

Provenance: **emitted, single call** — the cleanest run yet; no deliberation
loop, no second pass. Record: `design/audits/chem-r7.json`.

**VERDICT: APPROVE.**

> "The transition from 'Energy as a Gate' to 'Energy as a Cost' is the single
> most important architectural shift in this version. It moves the game from a
> 'Search for Valid Moves' (Constraint Satisfaction) to a 'Search for Optimal
> Moves' (Optimization)."

## (c) and (d) — accepted without argument

The correction landed: *"Yes. The correction is accepted. The failure was a
library/data error (missing product), not a logic error (energy gate)."*

On excluding NO, NO₂, CO and ozone: *"consistency is superior to completeness...
The loss of 'famous' molecules is a fair price for a coherent rulebook."*

## (a) — accepted, and the abstraction is now named in the source

> "It is a faithful **abstraction**, but not a faithful **mechanism**. In
> thermodynamics, you do not 'spend' energy from a bank to drive a reaction; you
> couple a non-spontaneous reaction to a spontaneous one, or you provide
> continuous work."

Correct and worth keeping visible. The bank is a proxy for external work
capacity, not a description of how anything happens. Recorded rather than
smoothed over.

## (b) — ACCEPTED AS A CONCLUSION, REJECTED AS A REASON

> "The 2.3% uplift is a red herring. The metric that matters is the 35.5% beat
> over match-3 instinct and the fact that match-3 instinct is now performing
> worse than random."

**This conflates two separate mechanics, in our favour, and it should not be
banked.** The 35.5% figure and the sub-random instinct come from REACTION SCORING
— they were measured before the energy bank existed and would be exactly the same
if the bank were cut tomorrow. They are not evidence for the bank.

The bank's own justification is +2.3% at t = 3.91, and that is the number that
belongs next to it. The honest case for keeping it is not strategic uplift at
all: it is that **endothermic reactions are real**, that refusing them taught
something false, and that the mechanic makes photosynthesis playable. A small
strategic gain is a bonus, not the argument.

This is the second consecutive round where the auditor's reasoning overstated a
result in the direction we would have liked. Recorded both times.

## (e) — ACCEPTED. The deepest finding in this whole track.

> "The design teaches that Enthalpy (ΔH) is the sole arbiter of spontaneity,
> provided energy is available. It ignores Entropy (ΔS). In real chemistry, a
> reaction's ability to proceed (Gibbs Free Energy, ΔG = ΔH − TΔS) depends on the
> change in disorder. A reaction can be endothermic but still occur spontaneously
> if the entropy increase is large enough at high temperatures."

Entirely correct, and it is the one remaining place where the game's model
diverges from chemistry on something a student would be marked wrong for. Ice
melts and ammonium nitrate dissolves while absorbing heat, because disorder
increases enough to pay for it.

It is also cheap to fix properly rather than approximately, because standard
molar entropies are tabulated values like bond enthalpies. Acted on immediately —
see `design/audit-chem-r8.md`.
