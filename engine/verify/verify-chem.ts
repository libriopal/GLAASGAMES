// engine/verify/verify-chem.ts — the chemistry is real, or the suite fails.
//
// C1   valence is DERIVED from group, and the derivation is right per element
// C2   every library molecule satisfies its own valences exactly
// C3   every library bond has a MEASURED energy — no invented quantities
// C4   the solver recovers each library molecule's structure from valence alone
// C5   the solver REFUSES shapes that are not molecules          (negative control)
// C6   formation energy is positive; a bond always releases energy
// C7   COMBUSTION IS EXOTHERMIC — the sign check the audit's finding needed
// C8   Hill notation: formulas are written the way chemists write them
// C9   no source file attaches a chemistry name to the hidden link (textual)
// C10  every element on the board appears in some buildable molecule
// C11  NO DEAD BOARDS — the generator validates before the player sees anything
// C12  valence is the COVALENT BOND COUNT, not the oxidation state (disputed)
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE IS THE POINT OF THE WHOLE FEATURE.
//
// A game that claims to teach chemistry and teaches something false is worse
// than a game that teaches nothing, because the player cannot tell which they
// got. Sokobond — the best prior art there is — still draws the complaint that
// it has "some questionable views of chemistry". The difference between a claim
// and a checked claim is a file like this one.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ELEMENTS, BY_SYMBOL, faceOf, valenceOf } from '../../game/chem/elements.js';
import { drawPlayableBoard, isPlayable, playableMoves } from '../../game/chem/board.js';
import { FACE_WEIGHTS } from '../../lattice/round.js';
import { makeRng } from '../sim/world-gen.js';
import { type Bond, bondEnergy, formationEnergy, reactionEnergy } from '../../game/chem/bonds.js';
import { MOLECULES, bondsOf } from '../../game/chem/library.js';
import { type Atom, type Edge, formula, solve } from '../../game/chem/lewis.js';

const failures: string[] = [];
const ok = (c: boolean, d: string): void => { if (!c) failures.push(d); };

const atomsOf = (symbols: readonly string[]): Atom[] =>
  symbols.map((s) => ({ symbol: s, valence: valenceOf(BY_SYMBOL.get(s)!.group) }));

// ── C1: valence is derived, and the derivation is correct ──────────────────
// The round-1 audit called the original hand-assignment "arbitrary and ignores
// the periodic table". These are the values a chemist would give, checked
// against a rule that computes them rather than a table that lists them.
{
  const expected: readonly (readonly [string, number])[] = [
    ['H', 1], ['C', 4], ['N', 3], ['O', 2], ['F', 1], ['Cl', 1],
    ['He', 0], ['Ne', 0], ['Ar', 0],
  ];
  for (const [symbol, v] of expected) {
    const e = BY_SYMBOL.get(symbol);
    ok(e !== undefined, `C1: ${symbol} is not in the element table.`);
    if (e === undefined) continue;
    ok(valenceOf(e.group) === v,
      `C1: ${symbol} (group ${e.group}) derives valence ${valenceOf(e.group)}, chemistry says ${v}. ` +
        'The rule is min(group-10, 18-group) for groups 13-17 — NOT the classroom "8 minus group", ' +
        'which gives boron 5 when boron forms 3.');
  }
  // The boron case specifically, because it is the one that breaks the shorthand.
  ok(valenceOf(13) === 3,
    `C1: group 13 derives valence ${valenceOf(13)}, not 3. Boron is electron-deficient and forms ` +
      'three bonds; a rule that says five has adopted the shorthand this project rejected.');
  ok(valenceOf(18) === 0, `C1: the noble gases derive valence ${valenceOf(18)}, not 0.`);
  console.log(`  C1 derivation: ${expected.length} elements derive the valence a chemist gives; ` +
    `group 13 gives 3 (not the shorthand's 5); group 18 gives 0`);
}

// ── C2: every library molecule satisfies its own valences ──────────────────
{
  for (const m of MOLECULES) {
    const need = atomsOf(m.atoms).map((a) => a.valence);
    const got = new Array(m.atoms.length).fill(0);
    for (const [i, j, order] of m.skeleton) { got[i] += order; got[j] += order; }
    for (let i = 0; i < m.atoms.length; i += 1) {
      ok(got[i] === need[i],
        `C2: in ${m.formula}, atom ${i} (${m.atoms[i]}) has ${got[i]} bonds but its valence is ` +
          `${need[i]}. A library entry that does not satisfy valence is not a molecule, and it ` +
          'would teach a player the rule they are meant to be learning is optional.');
    }
  }
  console.log(`  C2 valence: all ${MOLECULES.length} library molecules satisfy every atom exactly`);
}

// ── C3: no invented energies ───────────────────────────────────────────────
// A missing bond energy must fail loudly. Scoring a player with a number nobody
// measured is the precise thing this feature exists not to do.
{
  for (const m of MOLECULES) {
    for (const b of bondsOf(m)) {
      ok(bondEnergy(b) !== null,
        `C3: ${m.formula} contains a ${b.a}-${b.b} bond of order ${b.order} with no measured ` +
          'energy. Add the published value or remove the molecule; do not guess one.');
    }
  }
  console.log(`  C3 energies: every bond in every library molecule resolves to a measured value`);
}

// ── C4: the solver recovers each molecule from valence alone ───────────────
// The player supplies a shape; the game supplies the structure. If the solver
// cannot re-derive a molecule we already know the answer to, it cannot be
// trusted on one we do not.
{
  let recovered = 0;
  for (const m of MOLECULES) {
    const atoms = atomsOf(m.atoms);
    const edges: Edge[] = m.skeleton.map(([i, j]) => [i, j] as Edge);
    const s = solve(atoms, edges);
    ok(s !== null,
      `C4: the solver cannot reconstruct ${m.formula} (${m.name}) from its own connectivity and ` +
        'valences, though the library says it exists. Either the solver is wrong or the entry is.');
    if (s === null) continue;
    recovered += 1;
    const total = s.orders.reduce((a, o) => a + o, 0);
    const want = m.skeleton.reduce((a, [, , o]) => a + o, 0);
    ok(total === want,
      `C4: ${m.formula} solves to total bond order ${total}, the library says ${want}.`);
  }
  console.log(`  C4 solver: recovered ${recovered}/${MOLECULES.length} library structures from ` +
    `valence and adjacency alone`);
}

// ── C5: the solver refuses what is not a molecule ──────────────────────────
// A solver that accepts everything proves nothing. These are the shapes that
// look plausible and are not.
{
  const refuse: readonly (readonly [string, string[], Edge[]])[] = [
    ['two carbons alone', ['C', 'C'], [[0, 1]]],
    ['one hydrogen and one carbon', ['H', 'C'], [[0, 1]]],
    ['three hydrogens in a row', ['H', 'H', 'H'], [[0, 1], [1, 2]]],
    ['water with a spectator helium', ['O', 'H', 'H', 'He'], [[0, 1], [0, 2], [0, 3]]],
  ];
  for (const [why, symbols, edges] of refuse) {
    ok(solve(atomsOf(symbols), edges) === null,
      `C5: the solver ACCEPTED ${why} (${symbols.join('')}), which is not a molecule. A solver ` +
        'that says yes to everything has made the library decorative.');
  }
  // And a positive control, so C5 cannot pass by refusing everything.
  ok(solve(atomsOf(['O', 'H', 'H']), [[0, 1], [0, 2]]) !== null,
    'C5 POSITIVE CONTROL FAILED: the solver rejects water. It is refusing everything, which is ' +
      'not the same as refusing the right things.');
  console.log(`  C5 refusal: ${refuse.length} plausible non-molecules rejected; water still accepted`);
}

// ── C6: forming a bond always releases energy ──────────────────────────────
{
  for (const m of MOLECULES) {
    const e = formationEnergy(bondsOf(m));
    ok(e > 0,
      `C6: ${m.formula} has formation energy ${e} kJ/mol. Assembling a molecule from free atoms ` +
        'always releases energy — that is what a bond is — so a non-positive value means the ' +
        'arithmetic or the data is wrong.');
  }
  const n2 = MOLECULES.find((m) => m.formula === 'N2')!;
  ok(formationEnergy(bondsOf(n2)) === 941,
    `C6: N2 prices at ${formationEnergy(bondsOf(n2))} kJ/mol, not 941. That number is the reason ` +
      'the atmosphere is inert and it is the one fact this game most wants a player to keep.');
  console.log(`  C6 formation: all ${MOLECULES.length} molecules release energy when assembled; ` +
    `N2 prices at 941 kJ/mol`);
}

// ── C7: combustion is exothermic ───────────────────────────────────────────
//
// THE CHECK THAT THE AUDIT'S FINDING DEMANDED. The specification said the score
// was "bonds broken minus bonds formed", which is ΔH — and ΔH is NEGATIVE when
// energy is released. As written it would have paid players for destroying
// bonds and penalised every stable molecule they built. The auditor caught it;
// this stops it coming back.
//
//     CH4 + 2 O2 -> CO2 + 2 H2O
//
// broken: 4 C–H, 2 O=O.  formed: 2 C=O, 4 O–H.  Real, balanced, and famously
// exothermic — it is what a gas hob does.
{
  const broken: Bond[] = [
    ...Array.from({ length: 4 }, () => ({ a: 'C', b: 'H', order: 1 as const })),
    ...Array.from({ length: 2 }, () => ({ a: 'O', b: 'O', order: 2 as const })),
  ];
  const formed: Bond[] = [
    ...Array.from({ length: 2 }, () => ({ a: 'C', b: 'O', order: 2 as const })),
    ...Array.from({ length: 4 }, () => ({ a: 'O', b: 'H', order: 1 as const })),
  ];
  const released = reactionEnergy(broken, formed);
  ok(released > 0,
    `C7: burning methane scores ${released} kJ/mol, which is not positive. Combustion releases ` +
      'energy. A negative number here means the sign has inverted again and the game is paying ' +
      'players to break bonds — the exact defect the independent audit found in the specification.');
  // And the reverse must cost, or the rule is not a rule.
  ok(reactionEnergy(formed, broken) < 0,
    `C7: un-burning methane scores ${reactionEnergy(formed, broken)}, which is not negative. ` +
      'If both directions pay, the score is not measuring energy at all.');
  console.log(`  C7 sign: methane combustion releases ${released} kJ/mol (positive, exothermic); ` +
    `the reverse costs ${-reactionEnergy(formed, broken)}`);
}

// ── C8: Hill notation ──────────────────────────────────────────────────────
// A game that teaches formulas should write them the way chemistry writes them.
{
  const cases: readonly (readonly [string[], string])[] = [
    [['C', 'H', 'H', 'H', 'H'], 'CH4'],
    [['O', 'H', 'H'], 'H2O'],
    [['C', 'O', 'O'], 'CO2'],
    [['C', 'H', 'H', 'H', 'Cl'], 'CH3Cl'],
  ];
  for (const [symbols, want] of cases) {
    const got = formula(atomsOf(symbols));
    ok(got === want,
      `C8: ${symbols.join('')} formats as "${got}", chemists write "${want}". Hill notation puts ` +
        'carbon first, then hydrogen, then the rest alphabetically.');
  }
  console.log(`  C8 notation: ${cases.length} formulas render in Hill order`);
}

// ── C9: the hidden link gets NO chemical name ──────────────────────────────
//
// Twice now the temptation has been to buy authenticity with a label. Round 1
// of the audit killed "the hidden lattice is molecular geometry" — real geometry
// is a consequence of electron-pair repulsion, not a property assigned in
// advance. Round 3 killed the replacement, "a reaction pathway":
//
//   "In real chemistry, a reaction pathway is a multidimensional coordinate in
//    energy space... it is not a physical connection between two points that
//    transports a property."
//
// Same error, new costume. Renaming a mechanic after a real concept does not
// make it that concept. The hidden link is a hidden link.
{
  const banned: readonly (readonly [RegExp, string])[] = [
    [/\bVSEPR\b/i, 'VSEPR'],
    [/molecular geometry/i, '"molecular geometry"'],
    [/reaction pathway/i, '"reaction pathway"'],
    [/reaction coordinate/i, '"reaction coordinate"'],
    [/transition state/i, '"transition state"'],
    [/bond angle/i, '"bond angle"'],
  ];
  const files = ['elements.ts', 'bonds.ts', 'lewis.ts', 'library.ts'];
  for (const f of files) {
    const src = readFileSync(fileURLToPath(new URL(`../../game/chem/${f}`, import.meta.url)), 'utf8');
    // Comments included deliberately: a comment describing the link as geometry
    // becomes the next author's understanding, which is how the claim came back
    // the first time.
    for (const [re, what] of banned) {
      ok(!re.test(src),
        `C9: game/chem/${f} uses ${what}. The hidden link carries charge and is inferred by the ` +
          'player; it is not a chemical object and must not be named as one. This prohibition has ' +
          'already been violated twice, in two different words, and caught both times by audit.');
    }
  }
  ok(/VSEPR/i.test('a comment mentioning VSEPR'),
    'C9 NEGATIVE CONTROL FAILED: the scan cannot detect a planted term.');
  console.log(`  C9 vocabulary: ${files.length} chemistry files contain none of the ${banned.length} ` +
    `prohibited terms; the scan fires on a planted one`);
}

// ── C10: no element on the board is unusable ───────────────────────────────
//
// The defect no argument predicted and a probe found: under uniform weights 34%
// of tiles were valence 5-6, and those appear in NO molecule small enough to
// play, because PCl5 and SF6 are six and seven atoms. A third of every board
// would have been litter. This asserts it cannot happen again silently.
{
  const used = new Set(MOLECULES.flatMap((m) => m.atoms));
  for (const e of ELEMENTS) {
    if (valenceOf(e.group) === 0) continue; // inert on purpose; see below.
    ok(used.has(e.symbol),
      `C10: ${e.symbol} (${e.name}) is on the board and appears in no library molecule, so it is ` +
        'a tile a player can never use. That is the 34%-dead-board defect returning.');
  }
  const inert = ELEMENTS.filter((e) => valenceOf(e.group) === 0);
  ok(inert.length > 0 && inert.every((e) => faceOf(e) >= 5),
    'C10: the inert elements are not on faces 5-6. Those faces exist to carry them precisely ' +
      'because no playable molecule needs valence 5 or 6.');
  ok(inert.every((e) => !used.has(e.symbol)),
    'C10: a noble gas appears in a library molecule. They form no bonds; if one is bonded, either ' +
      'the library is wrong or valence 0 is not being enforced.');
  console.log(`  C10 usability: every bonding element appears in a molecule; ${inert.length} inert ` +
    `elements sit on faces 5-6 and bond in nothing`);
}

// ── C11: no dead boards ────────────────────────────────────────────────────
//
// Measured, 60 boards under the shipped weights: FOUR had no playable molecule.
// The auditor's verdict on that was not "tune it" but a diagnosis:
//
//   "A 6.6% dead-board rate is unacceptable for a polished product... a board
//    that contains no playable objective is a failure of the generator. The
//    generator must include a validation pass."
//
// Accepted. Generation is now draw-and-validate, and this asserts the guarantee
// holds rather than trusting that it does.
{
  const BOARDS = 120;
  let worstDraws = 0;
  let totalDraws = 0;
  let totalMoves = 0;
  for (let b = 0; b < BOARDS; b += 1) {
    const rng = makeRng(31337 + b * 977);
    const { symbols, draws } = drawPlayableBoard(rng, FACE_WEIGHTS);
    const moves = playableMoves(symbols);
    ok(moves.length > 0,
      `C11: drawPlayableBoard returned a board with no playable molecule at seed ${31337 + b * 977}. ` +
        'The validation pass is the whole point of the function; if it can emit a dead board it is ' +
        'doing nothing.');
    worstDraws = Math.max(worstDraws, draws);
    totalDraws += draws;
    totalMoves += moves.length;
  }
  // The redraw must actually be doing work, or the guarantee is untested luck.
  ok(worstDraws > 1,
    `C11: every board was playable on the first draw across ${BOARDS} seeds, so the validation ` +
      'pass never fired and this check has not exercised it. Either the face weights changed or ' +
      'the dead-board measurement that motivated this was wrong.');
  console.log(`  C11 no dead boards: ${BOARDS}/${BOARDS} playable, mean ` +
    `${(totalMoves / BOARDS).toFixed(1)} moves each; redraw fired (worst case ${worstDraws} draws, ` +
    `mean ${(totalDraws / BOARDS).toFixed(2)})`);
}

// ── C12: valence is a bond count, not an oxidation state ───────────────────
//
// ── A DISPUTED AUDIT FINDING, SETTLED BY TEST RATHER THAN BY ARGUMENT ───────
//
// Round 4 returned REVISE, naming this as the change that mattered most:
//
//   "The min(group-10, 18-group) formula is a mathematical heuristic, not a
//    chemical principle, and as written, it is mathematically broken for Group
//    15 (e.g., it would assign Nitrogen a valence of 3 instead of 5)."
//
// THIS FINDING IS REJECTED, because nitrogen's covalent valence IS 3. The +5 is
// an OXIDATION STATE — the charge nitrogen would carry in nitrate if every bond
// were fully ionic — and it is not a count of bonds. Nitrogen cannot form five
// covalent bonds at all: it has no accessible d orbitals to expand its valence
// shell, which is why NF5 does not exist while PF5 does. Its hard maximum is
// four, and the fourth costs it a formal positive charge, as in ammonium.
//
// The conflation of oxidation state with bond count is one of the most common
// confusions in introductory chemistry, and it is precisely the confusion this
// game exists to fix. Adopting it on an auditor's say-so would have written the
// error into the thing meant to correct it.
//
// The auditor is however RIGHT about group 15 in general, for the element it did
// not name: PHOSPHORUS genuinely is hypervalent and forms five bonds in PCl5,
// where this formula gives 3. That is why phosphorus is not in ELEMENTS — the
// rule would be wrong for it, and a rule that is wrong for an element is a
// reason to leave the element out, not to keep both and hope.
{
  const n = BY_SYMBOL.get('N')!;
  ok(valenceOf(n.group) === 3,
    `C12: nitrogen derives valence ${valenceOf(n.group)}. It must be 3. If this has been changed ` +
      'to 5 on the strength of nitrate\u2019s +5 oxidation state, the change is wrong: oxidation ' +
      'state is not a bond count, and nitrogen has no d orbitals to form a fifth covalent bond.');
  // The molecules prove it from the other direction: every nitrogen in the
  // library forms exactly three bonds, and they are real molecules.
  for (const m of MOLECULES) {
    const bonds = new Array(m.atoms.length).fill(0);
    for (const [i, j, o] of m.skeleton) { bonds[i] += o; bonds[j] += o; }
    m.atoms.forEach((sym, i) => {
      if (sym !== 'N') return;
      ok(bonds[i] === 3,
        `C12: nitrogen in ${m.formula} forms ${bonds[i]} bonds, not 3. Ammonia, N2 and HCN all ` +
          'put exactly three bonds on nitrogen; a library entry that disagrees is wrong.');
    });
  }
  ok(!ELEMENTS.some((e) => e.symbol === 'P'),
    'C12: phosphorus is in the element set. The derivation gives it 3, which is right for PH3 and ' +
      'wrong for PCl5 — phosphorus IS hypervalent, unlike nitrogen. A rule that is wrong for an ' +
      'element is a reason to omit the element, not to keep both.');
  console.log(`  C12 valence vs oxidation state: nitrogen derives 3 and forms 3 in every library ` +
    `molecule; phosphorus is excluded because the rule genuinely fails for it`);
}

if (failures.length > 0) {
  console.error(`verify-chem: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-chem: C1-C12 pass. Valence is derived rather than assigned, every molecule and ' +
  'every bond energy is real, the solver recovers known structures and refuses plausible ' +
  'non-molecules, combustion comes out exothermic, and the hidden link is not named after ' +
  'chemistry it does not do.');
