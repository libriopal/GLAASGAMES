# 50 mechanics for deep strategy — and what the run says depth actually requires

The Monte Carlo run closed with the auditor's verdict: *"the run has proven this
design cannot be a Deep Strategy game; it is a game of maximizing efficiency
within a set of visible constraints."* These are candidate verbs to change that.

## First, the measured definition of "deep", because otherwise this is 50 guesses

The run established one thing that governs every idea below:

> **Agency and solver margin trade one-for-one.** Preview bought 31.6 points of
> agency floor by spending 47 points of solver margin. The planner went from 63%
> to 88% of the ceiling. *Information given to the player does not create depth —
> it converts unreachable ceiling into reachable skill and moves the player up
> against it.*

So depth cannot come from showing more. It has to come from **making a decision's
consequence survive longer**. That is measurable and it is the metric every idea
here should be judged against:

**CONSEQUENCE HORIZON** — take a move at turn *t*, and measure how many turns later
its quality is still distinguishable in the final score. Currently ≈ 1 turn,
because the board refills, orders are independent draws, and nothing a player did
at turn 3 is visible at turn 9. A game where the horizon is 1 is a sequence of
puzzles, not a strategy game — which is precisely what the run found.

The three structural culprits, all measured:

| culprit | evidence |
|---|---|
| the board refills, so nothing is spent | decay exists but resets; delivery made it a conveyor |
| orders are independent draws | the k-th order is a pure function of k — deliberately, for fairness |
| every molecule is present with p≈1 | 36 cells, 16 molecules, ~2.25 copies of each |

Each group below attacks one of those.

---

## A · The selection verb is the skill — your tap-and-drag idea and its family (1–8)

This is the strongest direction in the list, and it is the one you named. Its
merit is not the gesture; it is that **a drawn path is a much larger decision
space than a picked pair**, and the space is one a human navigates by shape
rather than by search.

1. **Tap-and-drag a connected path of adjacent molecules to bond them.** The path
   is the move. Length 2–6, and the partition options come from the whole path's
   atom inventory — so a longer drag is a genuinely different chemistry problem,
   not a bigger version of the same one.
2. **Path ORDER matters, not just membership.** Bonds form along the drawn
   sequence, so A→B→C and A→C→B offer different product sets. This multiplies the
   decision space without adding a single rule, and it is the cheapest depth in
   the list.
3. **Self-intersecting paths are legal and mean a RING.** Draw a loop and you get
   cyclic products. Real chemistry, and a gesture that rewards spatial planning.
4. **Path length costs activation energy**, rising superlinearly — so a 6-drag is
   a commitment, not a free upgrade. Without this, longest-path is a degenerate
   strategy and the run already showed BIGGEST-REGION at 37% of thoughtful play.
5. **Branching paths** via a second finger or a held tap — a T-shaped selection
   for a molecule with a central atom. Matches how CH₄ and NH₃ actually look.
6. **The drag previews its partition options live**, updating as the finger
   moves. The player searches by gesture rather than by menu, which is the one
   place added information does *not* cost solver margin — it speeds the search
   rather than shrinking it.
7. **A path may not cross a cell it already used** unless closing a ring, so the
   gesture has a grammar and illegal moves are unreachable rather than rejected.
8. **Lifting mid-path commits nothing**; the move commits on release over a legal
   terminus. Every animation skippable, no input blocked.

## B · Persistent state — so a turn-3 choice is visible at turn 9 (9–16)

Attacks: *the board refills, so nothing is spent*. This is the group most likely
to move the consequence horizon, which is the number that matters.

9. **The board does NOT refill.** Delivered cells go empty and stay empty. The
   board shrinks as you work, so throughput early costs you space late. This is
   the single change most likely to create depth, and the run already has the
   config flag for it (`refill: 'VOID'`) — untested because every measurement was
   taken under POOL.
10. **Spent regions leave inert slag** that blocks adjacency until cleared at a
    cost. Your route through the board is a wound you have to route around later.
11. **An entropy meter that only rises.** Every reaction adds to it; high entropy
    raises the activation cost of everything. The board genuinely winds down and
    the player chooses *how fast*.
12. **Atom inventory is the real resource, displayed by element.** Once the
    fluorine is locked in HF you cannot make F₂, ever. Conservation becomes a
    thing you can *see yourself losing*.
13. **A catalyst that degrades with use** — three uses, then gone.
14. **Heat accumulates locally** where you have been reacting, and hot cells
    behave differently. Your history is written on the board's map.
15. **Temperature returns as a FIELD, not a dial.** The global version was
    falsified (0/400 boards changed best move); a local field you create by
    playing is a different mechanic with the same physics.
16. **Contamination**: a byproduct you did not want occupies a cell until
    consumed, and some byproducts are sinks.

## C · Irreversibility and commitment (17–23)

Attacks: *every move is locally reversible in effect*, so nothing is ever a
mistake you live with.

17. **Declare a synthesis ROUTE before executing it** — commit to a 3-step plan,
    get a large bonus for completing it, lose the investment if you deviate.
    Commitment under uncertainty is the classic source of depth and this game has
    none of it.
18. **Reactions are irreversible unless you pay ΔH to drive them backwards**, at a
    penalty. An undo that costs is a decision; a free undo is not.
19. **A limited number of "purge" actions** for the whole round.
20. **Lock a cell** so neither you nor your opponent may consume it — a defensive
    verb, and the first one in the game.
21. **The bank can go negative** into debt with interest, so over-driving
    endothermic steps early compounds.
22. **One-way tech: choosing a reaction pathway disables its alternative** for the
    rest of the round.
23. **Deadlines on orders**, so declining one is a real choice rather than a wait.

## D · Competing currencies (24–30)

Attacks: *a single score means every decision reduces to one axis*. One currency
is an optimisation problem; several in tension is a strategy problem.

24. **Energy, purity and throughput as three scores**, with the round's objective
    weighting them differently each seed.
25. **Purity**: delivering a molecule made in fewer steps is worth more, so the
    fast route and the cheap route differ.
26. **Yield**: repeated use of the same reaction gives diminishing returns, which
    pushes variety without a rule that says "be varied".
27. **Spend energy to REROLL an order** you do not want.
28. **Spend energy to EXPAND the book** from 3 slots to 4 — more parallel routes,
    more exposure.
29. **Reputation**: consistently on-time deliveries unlock higher-value contracts,
    so early reliability is an investment.
30. **A carbon budget** — CO₂ produced is a tracked cost, which is real chemistry
    and a genuinely modern tension.

## E · Position as a real constraint (31–37)

Attacks: *position is free*, which is why the swap verb measured −0.1 on agency —
there was nothing to carry anything to.

31. **The dock, re-tested properly.** Delivery only from an edge. Measured at 2.4%
    agency, but its ceiling was invalid (the beam could not use the swap verb),
    so it is **unresolved rather than refuted** and deserves a fair run.
32. **Multiple docks, each accepting different elements.**
33. **Reaction range**: some reactions need reactants within distance 1, others
    tolerate 2. Distance becomes a property of chemistry rather than of the UI.
34. **Diffusion**: light molecules (H₂, He) drift one cell per turn on their own,
    so the board moves between your turns and plans must anticipate it.
35. **Gravity or a pressure gradient** giving the board a direction, so one edge is
    genuinely different from another.
36. **Walls and vessels** — dividers that partition the board into reaction
    chambers you can open at a cost.
37. **The crucible cell**: one special cell where selections get a fourth product
    option. A reason to fight over a square.

## F · Compounding (38–43)

Attacks: *early and late turns are interchangeable*. Compounding is what makes a
first move matter at the end.

38. **A tech tree of unlocked reactions** — synthesising a molecule for the first
    time permanently unlocks a more efficient route to it.
39. **Combo chains**: consecutive deliveries of related molecules multiply, so
    routing toward a family beats taking whatever is nearest.
40. **Escalating orders** — each filled order raises the next one's difficulty and
    value, so the player chooses their own pace.
41. **Apparatus you build** from delivered molecules, which then modifies the
    rules for the rest of the round.
42. **A two-phase round**: a setup phase where nothing scores and you arrange the
    board, then a production phase. Explicitly separates planning from execution.
43. **Carry one molecule over between rounds**, making a session a campaign.

## G · Adversarial depth (44–50)

Attacks: *a solver can compute the whole game*. An opponent cannot be solved, and
this is the most reliable source of depth in any design.

44. **VS on one shared board**, alternating — the resource is the board, and the
    audit already blessed this shape over a shared pot: *"a common enemy in the
    dwindling connectivity of the board."*
45. **Order stealing**: both players see the same book and whoever delivers first
    takes it.
46. **Denial**: consume the atoms your opponent needs. The first genuinely
    strategic negative action in the game.
47. **Blind simultaneous commit**, revealed together — no first-mover information
    advantage, which the blind-settlement rule already protects in async.
48. **Draft the order book**: players alternate picking which orders enter play.
49. **Co-op with asymmetric roles** — one player reacts, the other routes, neither
    can score alone.
50. **A shared pool over ROUTES**, not outcomes: stakes distribute across which
    synthesis strategy pays on this seed, which is the pari-mutuel layer with a
    strategic surface instead of a betting one.

---

## Which of these I would actually test first, and why

Ranked by expected effect on **consequence horizon** per unit of implementation:

> **#9 WAS RANKED FIRST AND IT FAILED ON FIRST TEST.** Measured before anything
> was built, because its config flag already existed. One forced move at turn 0,
> identical play after:
>
> | config | one move is worth | of a final score of |
> |---|---|---|
> | refill POOL (every prior measurement) | **0.38** | 4.94 |
> | refill VOID (idea #9) | **0.30** | 2.64 |
> | VOID + dock (#9 + #31) | **0.00** | 1.23 |
>
> Every gap is **below 1** — a single move is worth less than one delivery. The
> consequence horizon is under one turn, so the game is not merely shallow, it is
> **self-correcting**: taking a worse opening move costs almost nothing because
> the readable rule recovers from it. VOID raises the *relative* share (7.6% to
> 11.4%) only by halving the score, and VOID with a dock makes the first move
> **literally irrelevant**.
>
> So no-refill does not create depth, and the ranking below is wrong at the top.
> What survives the finding is that depth has to come from something a greedy
> policy CANNOT recover from — which points at group C (commitment) and group G
> (an opponent), not at the cheap structural changes.

| rank | idea | why |
|---|---|---|
| ~~1~~ | ~~#9 no refill~~ | **FALSIFIED above.** Kept in the list as the record |
| 2 | **#1–2 drag path + order matters** | your idea; largest decision-space gain per rule added |
| 3 | **#12 visible atom inventory** | makes conservation a resource the player manages rather than a law they bump into |
| 4 | **#17 declared route** | the only idea here that adds commitment under uncertainty |
| 5 | **#44/46 VS on one board** | an opponent is the one thing a beam search cannot solve |

**What I would not repeat:** anything whose whole effect is showing the player
more. The run measured that path and it trades solver margin one-for-one.

**The honest caveat:** these are 50 hypotheses. The last set of four "fixes" all
looked obviously right and all failed, three of them for reasons no amount of
reasoning would have produced. Same discipline applies — screen them, don't
adopt them.
