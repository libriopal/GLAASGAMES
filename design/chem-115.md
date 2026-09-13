# Chemical — 115 ideas, and what makes it not Farkle and not Darkmatter

Written against a measured position rather than a blank page. Phase 1 passed
audit; phase 2 built the instrument and **one gate failed**, so a large fraction
of this list exists to attack that specific number rather than to decorate.

**Where it stands.** Product choice is real (runner-up pays within 10% of best
69.5% of the time; three options raise a naive player's throughput 41%). The
order book separates strongly — GREEDY 0.78 shipped against the readable rule
3.02, population spread 50%, no thoughtless rule above 45%. But:

| gate | value | required |
|---|---|---|
| SIGNAL UTILITY | 290% | ≥50 ✅ |
| SKILL DELTA | 50.0% | — ✅ |
| SOLVER MARGIN | 27.4% | positive ✅ |
| DOMINATED | false | false ✅ |
| **AGENCY FLOOR** | **4.1%** | **≥25 ❌** |
| **SEED SHARE** | **53.9%** | Farkle's was 3.3 ❌ |

**The measured cause.** An order is shippable on 22.4% of turns (0.30/turn) and
the one-ply rule ships 0.31/turn. It takes every chance the instant it appears;
**no policy manufactures chances**. The gap to the beam is foreknowledge of the
order stream, not skill.

So the organising question for every idea below is: **does this let a player
CONSTRUCT an opportunity rather than RECOGNISE one?**

---

## The three games must not be the same game wearing three skins

| | Farkle | **Chemical** | Darkmatter |
|---|---|---|---|
| question | *again?* | **what do I make from these?** | *what did I set in motion?* |
| verb | push or bank | **rearrange and route** | perturb and let run |
| topology | 4×4 live hand on a square lattice | **hexagonal, 6-neighbour** | non-planar / 3–4D |
| randomness | draw stream, per-ordinal | **conservation-bounded: the atoms are fixed** | seeded universe, rebuilt每 run |
| forecast | 2-row grid, certain over guessed | **IR/UV spectral readout** | trajectory cone |
| failure | farkle — lose the run | **strand the atoms — lose the route** | divergence — lose the universe |
| time | discrete turns | **reaction steps against decay** | continuous-ish integration |

---

## A · Board and topology — the hex turn (1–14)

1. **Hexagonal grid, 6 neighbours.** Not cosmetic: it raises connected-region
   count per cell and makes "bring two reagents together" a two-axis problem
   instead of a four-direction one. Measurable dial: `BOARD_TOPOLOGY`.
2. **Axial coordinates** (q, r) with a flat index, so the executor stays an
   `Int32Array` and hashing is unchanged.
3. **Hex rings as the selection primitive** — a centre plus any contiguous arc of
   its six neighbours, which reads as an orbital shell rather than a blob.
4. **Region size still 2–4.** The partition search is exponential in atom count;
   hex changes adjacency, not the chemistry budget.
5. **Board 37 cells** (a hex of radius 3) rather than 36 squares — near-identical
   area so every phase-2 number stays comparable.
6. **Edge cells have 3 neighbours, not 6.** Corners become genuinely different
   real estate, which is a positional asymmetry the square board never had.
7. **The centre cell is the crucible** — reactions selected through it get one
   extra product option (4 instead of 3). A spatial reason to fight over a cell.
8. **No gravity, no refill columns.** Match-3 refills by dropping; conservation
   forbids it. Cells refill in place, which the hex layout makes visually honest.
9. **Ring parity colouring** at very low alpha so the eye can count distance from
   centre without a grid overlay.
10. **Frozen cells**: a molecule whose bonds are all ≥900 kJ/mol (N₂) renders
    locked and cannot be selected until something adjacent heats it. Makes sinks
    *visible* rather than merely statistical.
11. **Board shape as a difficulty dial** — radius 2 (19 cells) / 3 (37) / 4 (61).
12. **Wrap-around toroidal hex** as an experimental level; likely rejected for
    legibility, but it is the cheapest way to remove edge effects if edges prove
    to dominate.
13. **Two-board co-op**: each player has their own hex, joined at one shared
    edge; molecules can be pushed across the seam.
14. **Selection is a drag along adjacency**, never a tap-set, so an illegal
    region is unreachable by the gesture rather than rejected after the fact.

## B · IR/UV forecasting — replacing the 2-row grid (15–30)

The corpus rule is load-bearing: *a band whose colour lies about its content is a
defect, not a style preference.* IR = what might go wrong. UV = what is hidden.

15. **The readout is a SPECTRUM, not a grid.** A horizontal band from IR through
    matter to UV, and the board's state is a set of emission lines on it.
16. **Each open order emits a UV line** — an order is a hidden intention, which
    is exactly what UV is licensed to mean.
17. **Each thermodynamic sink emits an IR line** — a sink is what might go wrong.
    The line's height is how many of that molecule are stranded.
18. **The line MOVES toward matter as the order becomes reachable.** A UV line
    crossing into the matter band is the single readable signal "you can make
    this now", and it is a position, not a number.
19. **Line width = uncertainty.** A broad line is an order whose route depends on
    refills you have not seen; a narrow one is deterministic from here.
20. **Absorption vs emission.** Orders you can fill are emission (bright lines on
    dark); orders whose reagents you have destroyed are absorption (dark lines on
    bright) — the physical inverse, for a state that IS the inverse.
21. **Preview orders sit deeper in UV** and migrate toward matter as they
    approach the book. This is the 2-row forecast's information content
    re-expressed as depth rather than as rows.
22. **The swapped-row rule carries over as depth order**: what is CERTAIN renders
    nearer the matter band, what is GUESSED renders further into UV. Certain in
    front, guessed behind.
23. **IR is never actionable and must never be** — it reports risk only. The
    agency-floor failure came from an interface that solved the game; a band that
    reads as an instruction would repeat it.
24. **No numbers on the spectrum.** Any number invites a rule printed on the
    screen, and a readable rule that reaches 96% of the ceiling is the exact trap
    Farkle escaped with the run multiplier.
25. **Doppler drift**: a line shifts IR-ward as the board decays, so the whole
    readout reddens across a round. Decay becomes peripherally visible.
26. **APCA-measured, not eyeballed.** Every line ≥ Lc 75 against its ground; the
    band ground itself ≥ Lc 15 from page. Swept, as the pip contrast was.
27. **Colour-blind path**: line POSITION carries the information and hue is
    redundant, which the 2-row grid could not claim.
28. **A single "spectral confidence" glyph** for accessibility mode, collapsing
    the readout to a 0–3 rung when motion is reduced.
29. **The spectrum is read-only and says so** — cyan chrome at its frame, the
    band meaning *what the engine reads*.
30. **Instrument the readout itself**: log how often a player acts within 2s of a
    line crossing into matter. That is the SIGNAL UTILITY gate measured on humans
    rather than on agents.

## C · Objective and loop (31–44)

31. **Order book of three, standing** — kept; a fixed list saturates (random play
    fills 2.48 of 3, whole ladder inside 1.2%).
32. **Delivery banks the order and frees the cell** — kept; without it targets are
    hostages and the 60-turn score fell below the 12-turn score.
33. **Contracts, not orders**: each has a deadline in turns. Missing one costs
    the book a slot for two turns. Introduces triage, which one-ply cannot do.
34. **Tiered orders**: bronze (1 molecule), silver (2 of a kind), gold (a
    molecule *and* a minimum bank). Gold is the first order type a one-ply rule
    provably cannot evaluate.
35. **Chained contracts** — fill A to unlock B at double value. Construction with
    a visible payoff horizon.
36. **A rush order** arrives mid-round at high value and short deadline; the
    decision is whether to abandon a route.
37. **Partial credit** for delivering a precursor rather than the target, at a
    fraction. Softens the all-or-nothing feel without inventing a bonus.
38. **The round ends when the board cannot react**, with the turn cap as a
    backstop only. Measured: the board dries at turn 8–12 whatever the policy.
39. **Score is orders shipped**, energy is a resource. Keep the two separate —
    scoring energy is the design that measured 5.7%.
40. **Energy as capital**: bank pays for transposition, for driving endothermic
    steps, and for refusing a bad order. Three sinks make the bank a decision.
41. **A round is 3–5 minutes**, matched to Farkle's so a session can mix games.
42. **Streak of on-time deliveries** raises order value multiplicatively, the way
    the run multiplier rescued Farkle from a flat reward. Same shape, different
    payload — and it must be swept the same way, not chosen.
43. **No fail state that ends a round early.** Chemistry's tension is attrition,
    not bust. That is what distinguishes it from Farkle and it should be defended.
44. **Post-round: the route you actually took, drawn as a synthesis tree**, next
    to the best route the beam found. The teaching moment is the diff.

## D · The product choice — the mechanic the engine was deleting (45–56)

45. **Three options, ranked by energy** — cap is measured: two-ply scores 5.37 at
    three options and 5.37 with all of them.
46. **Show the balanced equation for each option**, not a score. `2 H₂ + O₂ → 2 H₂O`.
47. **The option cards are the only place numbers appear on the board surface.**
48. **Colour each option by what it does to the book**, not by its energy —
    otherwise the interface ranks them for you and agency dies.
49. **A fourth option through the crucible cell** (idea 7) so position buys
    breadth.
50. **An option that is endothermic is shown with its price**, never hidden or
    greyed — the round-6 audit's finding, kept.
51. **Long-press an option to see the bonds broken and formed**, using the
    existing `accounting()`.
52. **Option order is stable across identical selections**, already enforced by
    the tie-break on the written equation, so muscle memory is possible.
53. **"Why is this not offered?"** — tap a rejected selection and the executor's
    rejection reason is shown verbatim. The same function judges both sides.
54. **Never auto-select the best option.** A default is a rule printed on screen.
55. **Option 3 is sometimes strictly better for the book and strictly worse for
    energy** — measure the frequency; if it is under ~20% the mechanic is thin.
56. **Telemetry: which option index players pick, by persona cluster.** This is
    the single most valuable signal the foundry can breed on.

## E · Making the player MANUFACTURE opportunity — the failing gate (57–74)

The measured defect: 22.4% of turns offer a ship, the one-ply rule takes 0.31 of
0.30 available. Every idea here is a candidate fix and each names how it would
show up in the gate.

57. **Transposition (swap two adjacent molecules) at an energy price.** Tested at
    120 kJ over 12 turns: **costs the readable rule 18%**. Not dead — it was
    priced and horizoned badly. Re-sweep cost × turns jointly rather than one at
    a time; the two interact and were measured separately.
58. **Free transposition, limited count per round** (3 per round). Removes the
    turn cost, which is what made it unaffordable, while keeping scarcity.
59. **Transposition as a TURN MODIFIER, not a turn**: swap and react in the same
    action, at an energy cost. This is the version most likely to pay, and the
    cheapest to test.
60. **Catalysts**: a held item that lets one reaction ignore the adjacency
    requirement entirely. Directly manufactures an opportunity.
61. **A holding bench of 2 cells** off-board. Park a molecule you will need in
    three turns. Storage is the simplest possible construction verb.
62. **Multi-step targets by construction** — order pools restricted to molecules
    that provably cannot be made in one reaction from any 4-cell region.
    *Measure the pool's 1-step reachability first and select on it.*
63. **The order pool adapts to the board's atom inventory** so orders are always
    physically reachable, removing the dead-order case that inflates seed share.
64. **Seeded board generation constrained to a target atom profile** — the direct
    attack on SEED SHARE 53.9%: if every board carries comparable reachable
    orders, the deal stops explaining half the outcome.
65. **Reject-and-redraw one order per round**, free. Gives agency over the book
    itself rather than only over the board.
66. **Reaction reversal at a price**: run a reaction backwards by paying its
    energy. Real chemistry, and a genuine undo that costs.
67. **Temperature returns — but as a LOCAL, positional field, not a global dial.**
    The global version was falsified (0/400 boards changed their best move). A
    heat source you place changes which reactions are available *where*, which is
    a spatial decision the global version could never be.
68. **Pressure as a second field** — Le Chatelier: raising pressure favours the
    side with fewer molecules. This is real, teachable, and it is a lever on
    *which option is best*, which is exactly the decision this game is built on.
69. **Concentration**: identical adjacent molecules raise the yield of reactions
    consuming them, so clustering becomes deliberate.
70. **Diffusion between turns**: unbonded light molecules (H₂, He) drift one cell
    per turn. Creates a clock the player must plan around.
71. **The dock**, tested: delivery only from the bottom row. Halved throughput,
    floor 2.4% — **but the ceiling measurement was invalid** (the beam cannot use
    the transposition verb), so this is *unresolved*, not refuted. Re-test with a
    verb-aware beam before discarding.
72. **Order preview depth as a tuned dial.** Swept: −26.2% at 0, +3.2% at 2,
    +15.8% at 5. It works; it just is not sufficient alone. Include in the
    factorial rather than fixing it by hand.
73. **Combine, do not iterate.** Every fix above was tested ALONE and each was
    insufficient. Preview 5 + free-swap + bench + multi-step pool may clear 25%
    where none does singly — that is precisely what a factorial run is for and
    why the next step is a designed experiment rather than another one-off.
74. **If nothing clears it, change the gate honestly rather than the game.** State
    that chemistry is a recognition game with a 4% planning margin and say so on
    the tin — but only after the factorial, and only with the auditor's sign-off.

## F · Chemistry that teaches without lying (75–84)

75. **Every molecule keeps its one true fact**, shown on first synthesis.
76. **Real bond enthalpies and real standard entropies** — the Haber check (ΔG°
    ≈ −33, not ΔH = −92) is the thing that cannot be fudged.
77. **Measured bond angles**, not schematic ones: water bent at 104.5°, CO₂
    linear at 180°. One schematic angle cannot serve both.
78. **The exclusions stay documented** (CO, O₃, NO, NO₂, benzene) with reasons —
    resonance and radicals are good to learn later and cannot be learned from a
    rule that says valence is exact.
79. **Hess's law as a post-round fact**, not a mechanic — measured: path
    independence holds only for identical endpoints, and final boards differ on
    199 of 200 runs.
80. **Never show a reaction the engine would not run.**
81. **A "what did I strand?" summary**: atoms locked in sinks at round end, by
    element. Turns an invisible loss into a lesson.
82. **Name the reaction when it is famous** — Haber, combustion, hydrogenation.
83. **No fictional molecules, ever.** The library is the scarcity mechanism *and*
    the honesty mechanism; inventing one to fix balance breaks both.
84. **A periodic-table drawer** showing only the 6 elements in play, with valence.

## G · Juice, sound, HD polish (85–98)

Nothing in this category exists yet — for Farkle either. It is the largest
untouched block in the project.

85. **Bond-break and bond-form are two different sounds**, pitched by energy.
86. **The spectrum hums** — a drone whose timbre tracks how much energy remains
    extractable. Decay becomes audible before it is visible.
87. **Exothermic reactions bloom outward, endothermic implode.** Direction of
    motion carries the sign, which is redundant with colour by design.
88. **Delivery is the payoff moment**: the molecule leaves the board along a
    tracked path to the order slot. Motion connects cause to reward.
89. **Haptic on option commit, not on selection** — the commit is the decision.
90. **A streak's audio rises in pitch**, resetting audibly when broken.
91. **60 fps budget measured as frame COST inside the callback plus drops at
    ≥1.75 refresh periods** — never as rAF interval, which is vsync-locked and
    measures the display.
92. **Molecule tiles render from the real skeleton** (`bondsOf`), so a double
    bond is drawn as two lines because it *is* two lines.
93. **Reduced-motion mode** replaces bloom with a one-frame luminance step.
94. **Every animation is skippable and none blocks input.**
95. **The board never moves under the player's finger.**
96. **Dark ground (`#080c12`) with the matter band carrying all chroma** — the
    fix for the near-monochrome failure, already proven on Farkle's screens.
97. **Sinks desaturate rather than darken**, the two-axis separation that solved
    Farkle's out-of-hand dice competing with the live hand.
98. **A single accent per screen state.** Two accents is a screen with no accent.

## H · Single / co-op / vs (99–106)

99. **SOLO**: fixed turns, score is orders shipped.
100. **VS shares the seed and the order stream**, blind settlement — neither sees
     the other's total until both close. Without blindness the second mover knows
     the target and plays a different game.
101. **VS on one board, alternating** — the shared resource is the BOARD. The
     audit killed a shared pot as "corrosive tension"; taking the route your
     opponent needed is healthy tension.
102. **CO-OP: separate books, one board.** You can fill your partner's order and
     they cannot lose your points.
103. **Co-op hand-off**: transposition may push a molecule across the shared seam
     (idea 13), which is the only cooperative verb that is not just talking.
104. **A co-op pair score** that rewards complementary play, ranked across pairs.
     *Currently unsimulated in Farkle too — this is a real open item.*
105. **Asynchronous VS** by replaying the action list server-side through the same
     executor. No second implementation of the rules, ever.
106. **Spectator replay** of any round from `(seed, actions)` alone, now that the
     turn path is pure.

## I · Economy and pari-mutuel (107–111)

107. **The pool is over ROUTES, not outcomes**: stakes distribute across which
     synthesis strategy pays on this seed.
108. **Fx Q16.16 throughout settlement.** No floats in engine, settlement or
     rm_finance code.
109. **`ledger_transactions` append-only at the DB level.**
110. **`FEATURE_RM_SETTLEMENT` stays false** until a human approver signs it.
111. **Every stake resolves by replaying the executor**, never by trusting a
     submitted score.

## J · Foundry and telemetry (112–115)

112. **Log the full action list plus the option index chosen**, which is the
     minimum for the foundry to breed on decisions rather than on outcomes.
113. **Survey hooks after round 3, 10 and 25**, three questions maximum.
114. **The persona population is the prior**; real telemetry updates it. Record
     which persona cluster each real player resembles.
115. **Fitness for breeding = the gate vector**, not the score: a bred game that
     ships more orders but fails AGENCY FLOOR is a worse game, and the foundry
     must be able to say so.
