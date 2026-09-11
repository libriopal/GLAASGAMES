# Independent audit — the molecular mapping, round 1

Auditor: `CF_AUDIT_MODEL` on Cloudflare Workers AI. Different vendor, different
weights, no repository access. Given the mapping, the scoring rule, and the
60-board measurement. **Verdict returned: REVISE.** No authority to build.

## Verbatim

> It is a superficial coincidence dressed as a design. The mapping of die faces
> to elements is arbitrary and ignores the periodic table. The high density of
> solutions is the strongest reason the board is boring; with 40.9 satisfiable
> shapes per board, the player faces no scarcity or meaningful constraint,
> turning a puzzle into a trivial selection task. Scoring by bond energy is a
> real number used decoratively, as players are merely collecting high-value
> numbers rather than learning to optimize stability. Most critically, the
> mapping teaches VSEPR theory and steric hindrance wrongly by treating molecular
> geometry as a static, pre-determined link rather than a consequence of
> electron-pair repulsion.
>
> VERDICT: REVISE, introduce scarcity by making most connectivity patterns
> chemically impossible.

## Disposition

**(d) — ACCEPTED IN FULL. Candidate B5 is withdrawn.** This is the best note in
the audit and it is unarguable. Real molecular geometry — water bent at 104.5°,
methane tetrahedral at 109.5° — is a *consequence of electron-pair repulsion*,
not a property assigned in advance. Calling the hidden link "molecular geometry"
would have taught a falsehood to precisely the players the feature is for, and it
would have been the exact failure Sokobond is criticised for. The hidden link
stays what it already is: a reaction pathway, the cell that receives charge. It
is not geometry and will not be described as geometry. **B5: 0.68 → withdrawn.**

**(b) — ACCEPTED, AND THE DIRECTIVE WAS MEASURED.** "Introduce scarcity by making
most connectivity patterns chemically impossible" is candidate E4, and it works.
Requiring a satisfiable region to match a real molecule, over the same 60 boards:

| constraint | molecules per board | boards with ≥1 |
|---|---|---|
| degree-satisfiable only | 40.9 | 60/60 |
| **and a real molecule** | **10.3** (25.2% survive) | **59/60** |

Three quarters of the arithmetically valid shapes are not molecules and are now
rejected. The scarcity is real and it costs no tuned constant.

**(c) — ACCEPTED. The scoring rule is changed.** "Players are merely collecting
high-value numbers rather than learning to optimize stability" is right, and the
fix is to score the quantity chemistry actually cares about: **enthalpy change —
bonds broken minus bonds formed — not the sum of bond energies.** Summing bond
energies rewards building the biggest thing. ΔH rewards building the thing that
*releases* energy, which is what "stable" means and what the player should come
away understanding. This is strictly more authentic and strictly better as a game
rule. **B4 is revised, not withdrawn.**

**(a) — PARTLY ACCEPTED, AND THE REVISION IS REAL.** "Arbitrary and ignores the
periodic table" is a fair charge against the mapping *as written*, where faces
were assigned to elements by hand. It is not fair against valence as such: a die
face is a count and valence is a count of the same kind. The revision removes the
hand-assignment — **valence is now DERIVED from group number** (groups 1–2:
valence = group; groups 14–17: valence = 18 − group), so the face is a
consequence of where the element sits in the table rather than a label somebody
chose. If the derivation is wrong, it is wrong in a way a chemist can point at.

## What the audit did not catch, and the probe did

**A third of the board is dead.** Under the shipped uniform face weights, 34% of
tiles are valence 5 or 6, and those appear in **none** of the eleven library
molecules — the hypervalent species that need them (PCl₅, SF₆) are six and seven
atoms, outside the region sizes that are playable. Measured per board: NH₃ turns
up 0.02 times and C₂H₂ 0.18, while H₂/HF/HCl turns up 2.05 times.

So faces 5 and 6 are not merely rare. They are **unusable**, and a third of every
board would be litter. Two fixes, both authentic:

1. **Faces 5 and 6 become noble gases — valence 0, inert, unbondable.** This is
   candidate A5, already the highest-confidence idea in the document at 0.80, and
   it is exactly true: helium, neon and argon form no bonds. A dead tile becomes a
   *designed obstacle with a real explanation*.
2. **The face weights are evolved, not assumed.** `RoundConfig.faceWeights`
   already exists for precisely this, and `verify-montecarlo` already treats it as
   the one knob that decides fairness. Uniform weights were never a chemical
   claim; they were a default.

Neither is adopted unilaterally. Both go back to the auditor as part of round 2.
