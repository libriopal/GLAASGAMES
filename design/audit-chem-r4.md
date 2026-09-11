# Independent audit — the molecular mapping, round 4

Run through the rebuilt harness. Provenance: **emitted after deliberation**.
**VERDICT: REVISE.** Record: `design/audits/chem-r4.json`.

This is the first round where a finding is **rejected on the evidence**, and the
first where the auditor passed something it had previously failed.

## (c) — ACCEPTED IN FULL. Dead boards were a generator defect.

> "No. A 6.6% dead-board rate is unacceptable for a polished product... a board
> that contains no playable objective is a failure of the generator. The
> generator must include a validation pass."

Right, and the framing is the useful part: a dead board is not bad luck to be
smoothed over with a reshuffle button, it is the generator emitting something
broken. `game/chem/board.ts` now draws and validates before the player sees
anything. C11 asserts the guarantee over 120 boards — all playable, mean 5.0
moves each — and also asserts the redraw actually **fires** (worst case 2 draws),
because a guarantee that never engages is untested luck rather than a guarantee.

## (e)(3) and the verdict — **REJECTED.** The finding is factually wrong.

> "The `min(group-10, 18-group)` formula is a mathematical heuristic, not a
> chemical principle, and as written, it is mathematically broken for Group 15
> (e.g., it would assign Nitrogen a valence of 3 instead of 5)."
>
> VERDICT: REVISE — "The valence formula is a critical logic error that will
> break the solver for Nitrogen and Phosphorus."

**Nitrogen's covalent valence is 3.** The +5 is an OXIDATION STATE — the charge
nitrogen would carry in nitrate if every bond were fully ionic — and it is not a
count of bonds. Checked against sources before rejecting: *"Nitrogen cannot form
5 covalent bonds, since it has no d orbitals available. It can form up to 4."*
That fourth bond costs it a formal positive charge, as in ammonium; NF₅ does not
exist while PF₅ does, and the missing d orbitals are exactly why.

Ammonia has three bonds on nitrogen. N₂ has a triple bond. HCN has a triple bond.
Every nitrogen in the library forms three, and they are all real molecules.

Conflating oxidation state with bond count is among the most common confusions in
introductory chemistry — **and it is precisely the confusion this game exists to
fix.** Adopting it because an auditor asserted it would have written the error
into the thing meant to correct it. The finding is rejected, and C12 now pins
nitrogen at 3 so the disagreement is settled by a test that runs rather than by
whoever argues last.

**The auditor is right about group 15 in general, for the element it did not
name.** Phosphorus genuinely is hypervalent — five bonds in PCl₅ — and the
derivation gives it 3. That is a real limit of the rule. It is why phosphorus is
**not in the element set**: a rule that is wrong for an element is a reason to
omit the element, not to keep both and hope. C12 asserts phosphorus stays out.

## (b) — Accepted as a direction; the numbers moved the right way and are not there yet.

> "The scarcity (4.9 options) is correct and provides a good density for a
> puzzle. However, the 'sharpness' is inconsistent... nearly half your puzzles
> are 'flat,' offering no clear optimal solution."

The density passed, which it did not in round 3. The flatness point stands: on
23 of 56 boards the best option is under 1.5× the median. Whether that is
"frustrating" or "a low-stakes turn" is a judgement neither of us can settle by
assertion, and it is the right target for the evolutionary pass over face
weights — sharpness is measurable and can be selected for.

## (e)(1) — Accepted as a known omission. Activation energy.

> "It implies that energy release is an instantaneous consequence of bond
> formation, ignoring the energy barrier required to initiate a reaction."

True and unfixed. Real reactions need a push before they pay, which is why a
mixture of methane and oxygen sits there until it is lit. Recorded as an open
limit; it is also a good future mechanic rather than merely a gap.

## (e)(2) — Already documented, not a new finding.

> "It treats bond energy as a static constant, whereas in real chemistry, the
> strength of a bond is influenced by the surrounding molecular environment."

Correct, and `game/chem/bonds.ts` already says so at the point the values are
declared: *"These are MEAN values across compounds, which is a real approximation
and is stated rather than hidden: the C–H in methane is not exactly the C–H in
ethanol."* Noted rather than actioned.

## (a) and (d) — Passed.

Scoring: *"you have resolved the sign error while maintaining mathematical
consistency."* Exclusions: *"intellectually honest provided the game is defined
by its constraints. You are not claiming to simulate all of chemistry."*
