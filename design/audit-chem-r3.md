# Independent audit — the molecular mapping, round 3

Run through the rebuilt harness (`scripts/audit.mjs`). **Provenance: emitted
after deliberation** — the witness saw its own analysis and then formally
committed. No trace was mined.

**VERDICT: REVISE.**

Full record: `design/audits/chem-r3.json`.

## Why this round exists at all

Round 2 returned APPROVE, and that approval was **withdrawn by us before this
run**, because it had been read out of the model's reasoning trace rather than
from an emitted answer. Asked directly whether that was legitimate, the same
auditor said no:

> It is indefensible for an audit. An audit requires a formal, committed
> conclusion. A reasoning trace is a 'stream of consciousness' — unrefined, often
> contains self-corrections, false starts, and contradictory hypotheses. By
> mining the trace, you are conflating the model's *internal process* with its
> *formal verdict*.

That judgement is upheld, and our own history proves it: the round-2 trace
contains `VERDICT: APPROVE, ensure the library includes a few simple noble gas
compounds`, which the model then reconsidered and replaced. A regex taking the
last match happened to pick the right one. That is luck.

**The re-audit immediately found a defect round 2 had passed.** The cost of the
broken harness was not hypothetical.

## (c) — THE SCORING RULE WAS SIGN-INVERTED. Accepted in full.

> It is decorative and mathematically inverted. If the score is 'Energy released'
> (which should be positive for stable molecules), but the formula is 'bonds
> broken minus bonds formed,' a player who forms many bonds will receive a low or
> negative score. The formula as written rewards the destruction of bonds
> (instability) rather than the formation of them (stability).

Correct, and it is the round-1 audit's own fix implemented backwards. The
chemistry:

    ΔH = Σ(bonds broken) − Σ(bonds formed)

ΔH is **negative** when a reaction releases energy. Exothermic means ΔH < 0. So
scoring ΔH directly pays a player for building *unstable* things and penalises
every stable molecule they complete — precisely inverting the concept the score
was introduced to teach.

**The score is energy RELEASED, which is −ΔH:**

    score = Σ(bonds formed) − Σ(bonds broken)

Stable molecules pay. This is now the specification, and `verify-chem` will
assert the sign on a known reaction — methane combustion is exothermic and must
score positive, or the oracle fails.

## (d) — THE "REACTION PATHWAY" NAME IS ALSO WRONG. Accepted; the name is dropped.

> The design treats a reaction pathway as a physical 'link' or conduit that
> 'carries charge.' In real chemistry, a reaction pathway is a multidimensional
> coordinate in energy space representing the sequence of molecular geometries a
> system traverses; it is not a physical connection between two points that
> transports a property.

This is the round-1 finding recurring in a new costume. Told that calling the
hidden link "molecular geometry" taught VSEPR wrongly, we renamed it "a reaction
pathway" — and that is wrong in the same way, for the same reason: **a real term
was attached to a mechanic that does not behave like the thing the term names.**

The fix is to stop naming it after chemistry at all. The hidden link is a hidden
link. It carries charge between cells, it is what the player infers, and it
predates the chemistry layer entirely. **It gets no chemical interpretation**,
and `verify-chem` will police the vocabulary — geometry, VSEPR, shape, angle,
*and now* reaction pathway, reaction coordinate, transition state.

The general lesson, which is the one worth keeping: *renaming a mechanic after a
real concept does not make it that concept.* Twice now the temptation has been to
buy authenticity with a label. Both times the auditor caught it.

## (b) — Accepted as a direction, and it is measurable rather than arguable.

> It is too high for a 'scarcity' mechanism... the player is not searching for a
> needle in a haystack; they are choosing between several available needles. This
> shifts the gameplay from a 'puzzle' to a 'matching' game.

The characterisation is fair but the conclusion does not follow on its own,
because 10.3 *available* molecules is not 10.3 *equivalent* ones. Whether this is
a puzzle or a matching game depends on whether the choice between them matters,
and that is now a number rather than an opinion: **the spread of scores across
the molecules available on a board.** If one option dominates almost always, the
auditor is right and it is a matching game. If the best choice is contested, the
choosing is the puzzle.

That measurement is owed before round 4 and is not being argued around.

## (e) — Accepted as characterised, not contested.

> It is a patch. While it is an 'honest' way to handle the mathematical
> constraints of a six-sided die and the size of the playable board, it is a
> functional workaround.

Agreed, and recorded as such. It is a workaround, it is chemically true, and
those are compatible. The alternative — inventing referents for valence 5 and 6
that a player could actually build — would require regions of six and seven
cells, which is a different game. Noted as a known compromise rather than
defended as an elegance.

## (a) — Passed.

> It survives. The mapping is a mathematically sound derivation of valence based
> on the octet rule... a functional abstraction rather than a superficial
> coincidence.

The round-1 charge is answered. `game/chem/elements.ts` derives valence from
group and nothing assigns it.
