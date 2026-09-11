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
