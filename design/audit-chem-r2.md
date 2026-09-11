# Independent audit — the molecular mapping, round 2

Auditor: `CF_AUDIT_MODEL` on Cloudflare Workers AI. Different vendor, different
weights, no repository access. Given the round-1 findings, the revisions made
against each, and the new measurement.

**VERDICT: APPROVE** — authority to build the revised design.

## Provenance, stated because it is not clean

The model entered a self-checking loop and exhausted its token budget, so the
`content` field came back empty and the answer had to be read out of the
reasoning trace. That is the same failure mode as both C2 dispatches and it is
worth naming rather than glossing.

What makes this one usable where the C2 verdict was not: the final text appears
**verbatim and identically about ten times** in the trace, each time after a
completed constraint check, and the verdict line is present and stable. It is a
settled answer that failed to be emitted, not a fragment that failed to be
finished. The C2 dispatch never reached a verdict at all, which is why that cycle
is recorded as having none.

## Verbatim

> Yes, the revised mapping survives a chemist's reading because valence is now a
> derived property of periodic position rather than an arbitrary assignment, and
> the removal of VSEPR claims eliminates the previous pedagogical error. The
> scarcity of 10.3 molecules per board is in the right direction, providing a
> meaningful challenge without making the game unsolvable. Enthalpy-change
> scoring successfully teaches stability by focusing on the net energy released
> or absorbed during a transition, which is the fundamental driver of chemical
> spontaneity. Turning faces 5 and 6 into noble gases is an honest solution; it
> acknowledges the limitations of the current molecular library and uses
> chemically accurate inert elements to resolve the statistical defect.
>
> VERDICT: APPROVE, the derivation of valence from group number.

## What is now authorised

The mapping as revised, and nothing beyond it:

| | |
|---|---|
| **valence** | derived from group number — groups 1–2: valence = group; groups 14–17: valence = 18 − group. Never hand-assigned. |
| **faces 1–4** | valence 1–4. H, O, N, C and their group-mates. |
| **faces 5–6** | noble gases. Valence 0, inert, unbondable. Real obstacles, not litter. |
| **face weights** | evolved through `RoundConfig.faceWeights`, never assumed uniform. |
| **bonding** | player selects a connected region; the game solves bond orders 1–3 so every valence is exactly satisfied. Bond order is REQUIRED, not optional — measured. |
| **admission** | a satisfiable region must also BE a real molecule. This is the scarcity mechanism and it is a fact, not a tuned constant. |
| **score** | ΔH — bonds broken minus bonds formed. Energy released, not energy collected. |
| **hidden link** | a reaction pathway carrying charge. **NOT geometry.** No VSEPR claim is made anywhere, in code, copy or comment. |

Explicitly still **not** authorised, and not to be smuggled in: electronegativity
and polarity, ionic bonding, catalysts, pH, explosives, isotopes. Each was
proposed, each is real, none has been reviewed.

## The standing prohibition

The auditor's round-1 finding (d) is the one that must not decay. Molecular
geometry is a consequence of electron-pair repulsion; it is not a property
assigned in advance, and the hidden lattice is not it. `verify-chem` will carry a
textual check — the same shape as `verify-net` T9 and `verify-belief` B1 — that
no source file describes the hidden link as geometry, shape, angle or VSEPR. A
prohibition nobody re-checks is a prohibition that comes back.
