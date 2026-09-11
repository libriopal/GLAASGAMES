# Tokens as atoms: 26 candidates for a bonding layer

Status: **audited to APPROVE over two rounds; no code yet.** The proposal below
is the ORIGINAL, kept intact so the audit can be read against what it reviewed.
Four of its entries did not survive. Read `design/audit-chem-r1.md` and
`design/audit-chem-r2.md` with it, and where they disagree with this file, **they
win.**

Superseded here, in brief:

| entry | was | now |
|---|---|---|
| **B5** hidden lattice = molecular geometry | 0.68 | **WITHDRAWN.** Teaches VSEPR wrongly. |
| **B4** score = sum of bond energies | 0.74 | **revised** to enthalpy change: bonds broken minus bonds formed. |
| **B3** bond order | 0.55, "probably not first build" | **REQUIRED.** Measured: single bonds alone leave 10/60 boards unplayable. |
| **A1/A3** face-to-valence | hand-assigned | **derived from group number.** |
| **faces 5-6** | valence 5-6 (P, S) | **noble gases**, valence 0. 34% of tiles were otherwise litter. |

---

## 0. Two corrections first, because the whole point is that the chemistry is real

The brief offered two examples. One is wrong and one is half right, and saying so
now matters more than it would in any other feature, because a game whose selling
point is "you learn actual chemistry" cannot ship folklore.

**"H chained with 2 O becomes H₂O" — no.** Water is **2 H + 1 O**. The subscript
belongs to the hydrogen. The reason is the mechanic itself: oxygen forms **two**
bonds, hydrogen forms **one**, so one O needs two H to satisfy it. H + 2 O would
leave three bonds dangling and is not a molecule at all. This is worth dwelling
on because it is *exactly the confusion the game can fix* — the subscript is not
decoration, it is a count forced by valence, and a player who builds H₂O by
satisfying an oxygen's two slots will never misremember it again.

**"O bonded with O becomes O₂, explosive or charged" — half right.** O₂ is real
and correct: two oxygens, each with valence 2, joined by a **double** bond. But
O₂ is not explosive. It is an *oxidiser* — it makes other things burn and does
not burn itself. The unstable oxygen allotrope is **O₃, ozone**, which decays
back to O₂ and is genuinely reactive. So the mechanic the brief is reaching for
exists; it just belongs one molecule over. That is a better game fact anyway:
**O₂ stable, O₃ decays** is a decay timer with a real referent.

Sokobond — the closest prior art, and an elegant game — is criticised in
precisely this register: "a nice little puzzle game with some questionable views
of chemistry." Whatever gets built here should be able to survive a chemist
reading it.

---

## 1. This is not a bolt-on. The engine already has three of the four pieces

The striking thing about the brief is how much of it is already in the codebase
under different names.

| already in the engine | what it is in chemistry |
|---|---|
| `OFFSET_FACE`, an integer **1–6** per cell | **valence** — how many bonds this atom forms |
| `OFFSET_CHARGE`, an integer **0–3** | **formal charge / oxidation state** — an ion |
| `OFFSET_LINK`, **hidden**, "the cell this one feeds" | **a reaction pathway** — which neighbour this one acts on. ~~the bonding partner~~ and emphatically NOT geometry (audit r1(d)) |
| `advanceTurn` scoring the face of the *linked* cell | a reaction resolving along a bond |

The third row is the one that makes this worth doing, and it is also the one the
audit corrected. The hidden lattice is already "which neighbour does this cell
point at", and the player already infers it by watching charge move.

**The original text here read "the hidden lattice is molecular geometry, and
inferring it is doing structure determination". That is withdrawn.** Molecular
geometry — water bent at 104.5°, methane tetrahedral at 109.5° — is a consequence
of electron-pair repulsion, not a property assigned to a cell in advance. A fixed
lattice called "geometry" would teach VSEPR backwards to exactly the players this
feature exists for. The hidden link is a REACTION PATHWAY and nothing else, which
is all it ever was before chemistry was involved. `verify-chem` will enforce that
no source file says otherwise.

Nothing about the pari-mutuel settlement, the heat lifecycle, the commit–reveal
fairness, the replay oracle or the belief widget needs to change. Those sit below
this layer and are indifferent to what the tokens *mean*.

Valence is the keystone: a die shows 1 to 6 pips, and main-group valence runs 1
to 6. That is not numerology of the kind that killed the last cycle — it is not
"six of these and six of those, therefore map them". It is that **the number
already printed on the token is the number the chemistry needs**, with the same
semantics: a count of connections.

---

## 2. The authentic core, stated before any game design

Four real rules, none simplified into falsehood:

1. **The octet rule.** Main-group atoms tend toward eight valence electrons —
   hydrogen toward two, the "duet". Valence, the number of covalent bonds an atom
   forms, follows: **H 1, O 2, N 3, C 4**. F and Cl are 1. This is the single
   most load-bearing idea in introductory chemistry.
2. **Noble gases form no bonds.** He, Ne, Ar have full shells; valence 0. A
   factually correct immovable blocker, free of charge.
3. **Bond order.** Two atoms can share one, two or three pairs: C–C, C=C, C≡C.
   Higher order means shorter and stronger.
4. **Bond energy is a number, and it explains behaviour.** Approximate standard
   values in kJ/mol: H–H 436, O–H 463, C–H 413, C–C 348, C=C 614, C≡C 839,
   O=O 498, **N≡N 945**. That last one is why nitrogen is inert and why fixing it
   into fertiliser was a civilisation-scale problem. A player who learns one
   number from this game should learn that one.

**Exceptions are not hidden.** Hypervalency is real — P forms 5 bonds in PCl₅, S
forms 6 in SF₆ — which is convenient, because it gives faces 5 and 6 honest
referents instead of inventing elements to fill the die.

---

## 3. The candidates

Probabilities are my credence that the idea survives contact with a build and an
auditor. They are recorded before the fact so they can be wrong in public, which
is the only thing that makes them worth writing. The last cycle's headline
candidate was weighted 0.75 and refuted three times; that history is why the
numbers here are lower and why the plan is to let a search decide rather than my
taste.

### A. Valence and identity — what a token *is*

**A1. Face = valence, element unnamed (0.72).** A token showing 3 pips is "an
atom that forms three bonds". No element symbol. Keeps the existing art, keeps
greyscale legibility, teaches the concept before the vocabulary. Weakness:
teaches no elements, which is half the promise.

**A2. Face = valence, element named on the face (0.66).** Same, plus the symbol.
Pip count and symbol are redundant channels for the same fact — the redundancy
the token system already insists on. Risk: symbols are text, and `verify-tokens`
P1–P9 proves the *pips* survive greyscale at phone width; letterforms at that
size are a new legibility claim needing new measurement.

**A3. One element per face, fixed (0.30).** Face 1 = H, 2 = O, 3 = N, 4 = C,
5 = P, 6 = S. Clean, memorable, and it makes the die a periodic-table slice.
Weakness: the board would be 1/6 carbon, which is nothing like real abundance and
would make the chemistry feel arbitrary.

**A4. Face = valence, element drawn from a weighted pool (0.58).** Face 2 might
be O or S; face 1 might be H, F or Cl. Preserves valence as the mechanic while
letting real abundance shape the pool. More to learn, more to confuse.

**A5. Noble gases as valence-0 blockers (0.80).** The highest-confidence idea
here. Factually exact, mechanically useful, and it gives the board obstacles that
are not arbitrary walls. Already fits `EMPTY` and `STATE_SPENT` handling.

**A6. Isotopes as a charge variant (0.22).** Deuterium, C-14. Probably a
distraction: isotopes change mass and nuclear stability, not bonding, so it would
teach the wrong lesson about what the token's number means.

### B. Bonding — what chaining *does*

**B1. A chain is a molecule; all valences satisfied = stable = scores (0.78).**
The core loop. Drag a path through adjacent tokens; the path is a bond skeleton;
it scores when every atom's slots are full and nothing dangles.

**B2. Unsatisfied valence = a radical, and radicals decay (0.70).** An incomplete
chain does not simply fail — it leaves a reactive fragment that degrades over a
turn or two. Real (radicals are genuinely short-lived and reactive) and it turns
a failed move into a consequence instead of a no-op.

**B3. Bond order as chain multiplicity (0.55 → REQUIRED, see §5a).** Passing through the same pair
twice makes a double bond. Real and important, but the input gesture for "go back
over that bond" is awkward on a phone and may not be worth it.

**B4. Bond energy is the score (0.74 → revised to enthalpy change).** A molecule pays the sum of its bond
energies, in kJ/mol, shown as the real number. N≡N pays 945 and is nearly
impossible to build; H–H pays 436 and is easy. **The score becomes a quantity
that exists outside the game**, which is the strongest single argument in this
document for the whole idea.

**B5. The hidden lattice is molecular geometry (0.68 → WITHDRAWN by audit).** The existing hidden link
becomes "the neighbour this atom is predisposed to bond with". Inference is
unchanged mechanically; its *meaning* becomes structure determination. Costs
nothing and re-uses the belief widget exactly as built.

**B6. Electronegativity drives polarity, polarity drives charge (0.48).** Real,
teaches a genuinely deep idea, and probably one layer too many for a first build.

**B7. Ionic vs covalent as two bond types (0.52).** Metal + non-metal transfers
an electron rather than sharing. A real and important distinction. Adds a second
bonding rule before the first is proven.

**B8. Catalysts: a token that enables a reaction without being consumed (0.44).**
Delightful, real, and hard to make legible.

**B9. Conservation of mass as a hard constraint (0.62).** Atoms in equals atoms
out; nothing vanishes. This is a *law*, and enforcing it is both authentic and a
strong design discipline — it forbids the "tokens just disappear" convenience
that most match-3 games rely on.

### C. Instability — where the drama lives

**C1. O₃ decays to O₂ (0.66).** The brief's instinct, relocated to the molecule
that actually does it. A built ozone is worth points but is on a timer.

**C2. Combustion: a hydrocarbon plus O₂ releases energy (0.71).** CH₄ + 2 O₂ →
CO₂ + 2 H₂O. Real, balanced, dramatic, and a genuine reaction a player can learn.
The energy released is the difference in bond energies — the score is *derived*,
not assigned.

**C3. Unstable species as the Farkle "bust" (0.69).** Farkle's core is push your
luck until you lose the turn. Here: keep extending a chain for more bonds, but an
unsatisfied valence when the turn ends loses the accumulated score. The bust
condition stops being arbitrary and becomes **"you left a dangling bond"**.

**C4. N≡N as the immovable problem (0.58).** Nitrogen's triple bond is so strong
that N₂ does essentially nothing. Pays enormously, almost never buildable — a
jackpot with a real explanation.

**C5. Explosives as high-energy-release molecules (0.35).** Authentic in
principle. Lowered deliberately: a puzzle game that teaches the energetics of
explosives invites a content question nobody needs, and the same drama is
available from combustion.

**C6. pH / acid–base neutralisation (0.40).** Real and very teachable, but it is
a second axis of state on top of charge and probably belongs in a later cycle.

### D. How it meets what already exists

**D1. Charge = oxidation state (0.64).** `OFFSET_CHARGE` is already 0–3 and
already means "energised". Ions are the honest reading.

**D2. Charge propagation = electron delocalisation (0.57).** Charge already
travels two hops along hidden links; in a conjugated system, electrons genuinely
delocalise along a chain. Two hops is a crude but *directionally true* model.

**D3. The belief widget shows inferred geometry (0.75).** Built, searched,
audited, passing B1–B13. Under the chemical reading its meaning improves at zero
cost: "which way does this region bond".

**D4. Pari-mutuel heats stay untouched (0.88).** The settlement layer does not
care what the tokens mean. Highest confidence in the document, and the reason
this can be attempted at all.

**D5. The Monte Carlo learner learns chemistry (0.61).** `foundry/montecarlo`
already measures whether modelling the hidden lattice is worth points. Pointed at
molecules it answers a sharper question: *is knowing chemistry worth points?* If
the answer is no, the educational claim is false and the suite says so.

**D6. Molecule library as the natural-selection substrate (0.66).** The user's
standing request for evolved game variants gets a real genome here: which
molecules are in the pool, their bond energies, their decay rates. Evolvable,
measurable, and bounded by a fact — an invented molecule is simply wrong and can
be rejected mechanically.

### E. Teaching, as a measurable property rather than a hope

**E1. Every completed molecule states a real fact (0.70).** Sokobond does this
and it is the thing reviewers single out as working.

**E2. A reaction the player built is shown as a balanced equation (0.64).** The
game writes CH₄ + 2 O₂ → CO₂ + 2 H₂O and the coefficients are the ones the player
forced by satisfying valences.

**E3. Difficulty follows the real curriculum (0.52).** Diatomics, then water and
methane, then functional groups. Attractive; risks making a game feel like
homework.

**E4. `verify-chem`: every molecule in the pool is real (0.84).** An oracle over
the molecule table asserting formula, valence consistency and bond count — so a
fictional molecule cannot ship. Second-highest confidence here, and the piece
that makes "authentic" a *checked* claim rather than a marketing one. **A game
that claims to teach chemistry and teaches something false is worse than one that
teaches nothing.**

**E5. The learning claim is measured, not asserted (0.58).** The Monte Carlo
harness can measure whether a policy that knows valence outscores one that does
not, exactly as `verify-learnable` E8 measured the lattice at +6.3% / +4.2% /
+7.3%. If valence-awareness is worth nothing, the game does not teach chemistry —
it decorates with it, and we would have to say so.

---

## 4. What I would build, and why

> **Superseded.** The authorised build is in `design/audit-chem-r2.md`. B5 is out,
> B3 is in, B4 is enthalpy change, and faces 5-6 are noble gases.

**A1 + A5 + B1 + B2 + B4 + B5 + C3 + D1 + D4 + E1 + E4.**

In one sentence: *pips are valence; noble gases block; dragging a path builds a
bond skeleton; a molecule scores its real bond energy when every valence is
satisfied; a dangling bond at end of turn busts the way Farkle busts; and an
oracle proves every molecule in the pool is real.*

Deliberately **not** in the first build: bond order (B3), electronegativity (B6),
ionic bonding (B7), catalysts (B8), pH (C6), explosives (C5). Each is real and
good. None of them can be judged until the core loop is measured, and the failure
mode of this whole idea is a pile of authentic mechanics that do not add up to a
game.

The single strongest element is **B4, bond energy as score**. Every other
match-3 pays in points someone invented. This one pays in kilojoules per mole,
and the numbers are checkable against a textbook. That is the same move the rest
of this codebase already makes everywhere — prefer the quantity that exists
outside the program to the one you made up.

---

## 5. What would falsify this

Written now, before building, so it cannot be quietly dropped later.

1. **Valence may be too rigid for a random board.** If faces are drawn at random,
   a satisfiable molecule may be rare, and the board may deadlock constantly. This
   is a *measurable* question and it is the first thing to measure: sample boards,
   count reachable molecules. **If satisfiable molecules are rare under the
   shipped face weights, the idea fails as specified** and either the weights or
   the satisfaction rule has to change.
2. **The learning claim may be empty.** If a valence-aware policy scores no better
   than a greedy one (D5/E5), the chemistry is a costume.
3. **Symbols may not survive the phone.** A2 needs its own legibility measurement;
   the existing P1–P9 evidence covers pips, not letters.
4. **It may not be the same game.** Pari-mutuel heats are priced around a scoring
   distribution. Replacing "bank the biggest number" with "complete a molecule"
   changes that distribution, and `verify-parimutuel` will need re-running against
   real score samples, not assumed ones.
5. **Two systems may not fuse.** The brief asks for the bonding layer and the
   visual layer to become one seamless operation. If the belief widget cannot
   express molecular structure as naturally as it expresses flow, the fusion is
   decorative and should be called off rather than dressed up.

---

## 5a. Falsifier #1, measured — and it moves a probability

Falsifier #1 was the one that could kill the idea outright, so it was measured
before the audit rather than after. 60 boards under the **shipped** uniform face
weights, all 1,613 connected regions of size 2–5 on the 6×6 board, testing
whether any assignment of bond orders makes every selected atom's valence exact:

| max bond order | boards with ≥1 molecule | mean molecules per board |
|---|---|---|
| 1 — single bonds only | **50 / 60** | 4.3 |
| 2 — doubles allowed | **60 / 60** | 15.9 |
| 3 — triples allowed | **60 / 60** | 40.9 |

**The idea survives, but B3 was wrong and I am revising it up from 0.55 to
essentially required.** With single bonds only, one board in six contains no
buildable molecule at all — a 17% dead-board rate, which is not a game. Allowing
double bonds takes that to zero across every board sampled.

That conclusion was already forced by the chemistry and I had it filed as
optional anyway: **O₂, CO₂ and N₂ are all multiply bonded**, so a game without
bond order cannot build the three most famous small molecules in existence. The
measurement and the textbook agree, which is the only time a design decision here
is safe.

A second and more interesting result: at order ≤ 3 there are **40.9** satisfiable
shapes per board, which is almost certainly too many to be interesting. The fix
is not to tune a difficulty knob — it is **E4**. Degree-satisfiability says a
shape is *arithmetically* consistent; it does not say the molecule *exists*.
Requiring the shape to correspond to a real molecule cuts that 40.9 down hard,
and cuts it **on a principle rather than on a tuned constant**. The constraint
that makes this authentic and the constraint that makes it a game are the same
constraint, which is the strongest structural argument in this document.

It also settles the shape of the core interaction. A simple drag-a-path cannot
work: a path gives its interior atoms degree 2 and its endpoints degree 1, so
**carbon can never appear in one**, and CH₄ — a valence-4 atom with four
neighbours — is a plus-shape, not a line. The player therefore selects a
connected *region*, and the game solves the bond orders. That solve is a perfect
b-matching, it is cheap, and it is exactly what deriving a Lewis structure is.

Measured by `probe-chem.ts`, which is not kept: it becomes `verify-chem` if this
proceeds, so the number is re-derived by the suite rather than quoted from a
document nobody re-runs.

---

## 6. How the machine decides, not me

The same division that worked for the belief display, since it is the one method
in this project with a track record of overruling its author:

- **Enumerate** what can be enumerated. The molecule pool is a finite table, and
  a search over "which molecules, at which weights" is exhaustive at useful sizes.
- **Evolve** what cannot. Face weights, decay rates, bust thresholds and energy
  scaling are continuous, and mutation under a fixed fitness is the right tool.
- **Fitness is measured against facts, not taste.** Board solvability, score
  distribution against the settlement layer's assumptions, and the valence-aware
  versus valence-blind score gap. All three are numbers, all three can come back
  hostile.
- **The visual layer evolves in parallel, under one fitness.** The brief asks for
  these to fuse. Concretely that means the bonding search and the display search
  share a term: a molecule that is mechanically excellent and visually unreadable
  scores badly *as a molecule*, because a bond a player cannot see is a bond that
  does not exist for them.

---

## 7. For the auditor

The questions this needs answered before code:

1. Does mapping a die face to valence survive a chemist's reading, or is it the
   same species of coincidence as "six planes, six faces"?
2. What is the strongest reason a valence-satisfaction rule produces a boring or
   deadlocked board?
3. Is "bond energy as score" genuinely teaching, or is it a real number used
   decoratively?
4. What real chemistry does this mapping actively teach *wrongly*, in the way
   Sokobond is accused of?
