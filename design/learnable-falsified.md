# The educational claim, measured — and not supported

**Status: the feature's central justification is currently FALSE.** Written up
before any fix, because a result that only gets recorded once it has been made to
go away is not a result.

## The claim

That a player learns real chemistry. That is only true if understanding
chemistry **changes what you do**. So: does a player who has grasped valence
score better than one who has not?

## The experiment

Four policies, 400 paired rounds of 12 turns each, on the evolved face weights.
Paired seeds, because variance between boards dwarfs variance between policies.

| policy | what it represents |
|---|---|
| `random` | finds a legal move, takes it. No evaluation at all. |
| `biggest` | takes the move with the most atoms. **The match-3 instinct** — imported from games where bigger clears are better. This is the control that matters: it is what someone plays who has *not* understood the chemistry but is not playing blind. |
| `valence` | takes the move with the greatest total valence. A player who grasped "more bonds means more energy" and memorised **no numbers at all**. |
| `energy` | takes the highest-energy move. The bond-enthalpy table, effectively. |

## The result

| comparison | gap | t | boards won |
|---|---|---|---|
| **`valence` − `biggest`** | **+1.43%** | **1.23** | **124 / 400** |
| `energy` − `biggest` | +1.44% | 1.23 | 123 / 400 |
| `biggest` − `random` | **+8.37%** | **4.13** | 231 / 400 |
| `energy` − `valence` | +0.01% | 0.04 | 12 / 400 |

**Understanding valence is worth 1.43% over "pick the biggest blob", at t = 1.23.
That is not significant, and `valence` actually loses or ties on 276 of 400
boards.** Nearly all the available skill — 8.37% at t = 4.13 — comes from the
match-3 instinct, which is not chemistry and needs no chemistry to have.

Memorising the entire bond-enthalpy table is worth **0.01%** over the valence
heuristic. The table is decoration on top of decoration.

## Why, and it is not subtle

    correlation(atom count, energy) over 592 real moves:  r = 0.843

Energy is 84% explained by how many tiles you cleared. And that is forced by the
scoring rule rather than being bad luck: building from **free atoms** breaks
nothing, so the score is the sum of the bonds formed, which grows with the number
of bonds, which grows with the number of atoms. *Bigger is better* is very nearly
optimal play, and no chemical insight is required to see it.

`game/chem/bonds.ts` already argued this in prose:

> So round 1's objection is not answered by arithmetic. It is answered by giving
> the player something where the two differ, and there is exactly one such thing:
> a REACTION between molecules that already exist.

The prose was right. This is the number attached to it. It also vindicates the
round-1 audit finding that summed bond energy is "a real number used
decoratively" — that objection was answered with a sign fix, and the sign fix was
necessary but did nothing about the substance.

## What follows

Two honest options, and only two.

1. **Make reactions the scoring event.** Under a reaction, bonds break as well as
   form, and ΔH stops being monotone in size. N₂ is the whole argument in one
   molecule: enormous bond energy, and inert *precisely because* breaking it costs
   941 kJ/mol. A player who knows that plays differently from one who counts
   tiles. This is the fix the code already points at.
2. **Drop the educational claim** and describe the game as chemistry-flavoured.

**Option 2 is not a failure mode to be avoided by wishful thinking.** If reaction
scoring is built and the gap is still inside the noise, the claim goes. The
measurement decides, and it is now a standing instrument
(`foundry/chem/learnable.ts`, `npm run search:learnable`) rather than a one-off.

Until one of those happens, nothing shipped may claim this game teaches
chemistry. `verify-chem` C15 pins the defect so it cannot quietly stop being
recorded.

---

# RESOLVED — reaction scoring, measured with the same instrument

Option 1 was built. The same experiment, so the before and after are comparable:

| | assembly scoring | **reaction scoring** |
|---|---|---|
| correlation(size, score) | 0.843 | **0.122** |
| a chemical concept vs the match-3 instinct | +1.43%, t = 1.23 | **+35.5%, t = 15.07** |
| the match-3 instinct vs random | +8.37%, t = 4.13 | **−21.0%, t = −11.73** |

**The bottom row is the result.** Under assembly scoring, "take the biggest
blob" was the single most valuable thing a player could bring to the game. Under
reaction scoring it is actively **harmful** — taking the largest selection loses
to taking one at random, on 129 of 150 boards. Importing the wrong intuition now
costs you, which is what it means for a game to be *about* something.

The concept policy (`fuel`) prefers reactions whose reactants are weakly bonded —
a player who has understood that a strongly-bonded molecule has little left to
give. **It memorises no numbers at all** and is worth +35.5% at t = 15.07. Full
knowledge of the bond table is worth +73.7% at t = 23.71.

## Why it works, stated so it can be checked rather than believed

A reaction's score is a DIFFERENCE — bonds formed minus bonds broken — and a
difference is not monotone in size. Nitrogen is the whole argument in one
molecule: N₂ carries 941 kJ/mol, more than almost anything on the board, and is
nearly worthless as a reactant because breaking that triple bond costs more than
most rearrangements repay. A big tile is a liability, and no amount of
tile-counting reveals that.

## The chemistry the engine derives, unprompted

| selection | result | released |
|---|---|---|
| CH₄ + 2 O₂ | → CO₂ + 2 H₂O | **+808** (textbook ≈ 802–818) |
| 3 H₂ + N₂ | → 2 NH₃ | **+97** (Haber, real ΔH ≈ −92) |
| 2 H₂O₂ | → 2 H₂O + O₂ | **+203** (real ≈ 196) |
| N₂ + O₂ | **refused** | making NO from air is endothermic — it needs lightning |

That last row matters as much as the others. The engine declines a reaction that
does not happen, for the right reason, without being told about it specifically.

## The round-5 audit finding, measured

It called conservation of mass a "Brittle Constraint" and demanded it be relaxed
or the library expanded, on the grounds that a selection might have no valid
partition. Measured over 1800 selections, **a valid partition exists 100% of the
time** at every size — necessarily, since the reactants are themselves library
molecules, so the arrangement you started with is always available. Conservation
cannot be unsatisfiable, and relaxing it would have discarded a law to fix a
problem that was not there.

The instinct was right under a different mechanism. At two reactants, 83% of
selections have no *exothermic* rearrangement — nothing happens. That is a dud
move rather than a broken puzzle, and a player forced to guess which is which
would feel exactly what the audit described. So the fix is to the INFORMATION,
not the constraint: `reactiveMoves` enumerates every selection that actually
reacts, and the player chooses among live options. Unearned failure is designed
out rather than tuned down.

`verify-chem` C16 now asserts the decoupling, the concept's uplift, the instinct's
*negative* uplift, and all four reactions above.
