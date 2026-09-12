// engine/verify/verify-tiles.ts — sixteen molecules must be tellable apart.
//
// V1  every atom and bond stays inside the tile
// V2  no two atoms overlap into a single blob
// V3  the layout reads the REAL bond graph, not a ring of everything
// V4  PAIRWISE DISTINGUISHABILITY — the pair a player would confuse
// V5  size comes from covalent radius, not valence   (the 10-zero-pair defect)
// V6  every glyph in every formula can actually be drawn
// V7  tabulated angles are used: CO2 is linear, water is bent
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A GATE AND NOT A TASTE REVIEW.
//
// A player picks a selection by reading tiles. If two molecules render the same,
// the move is a coin flip and no amount of correct chemistry underneath rescues
// it. That is a measurable property of a set of pictures, and every check below
// exists because a measurement or a screenshot found the failure first:
//
//   V5  drawing radius from VALENCE made H2, HF, HCl, F2 and Cl2 pixel-identical
//       — ten pairs at an ink distance of exactly 0.0000 out of 120.
//   V4  drawing bond order as a THICKER LINE left O2 and N2 at 0.0039 against a
//       field mean of 0.1106. Separate parallel lines, as chemists draw them,
//       took the worst pair to 0.0173.
//   V3  putting every non-central atom on a ring drew acetylene as a bullseye of
//       overlapping circles, because H–C≡C–H is a CHAIN and one hydrogen is not
//       bonded to the centre at all.
//   V7  spreading substituents evenly drew water straight; capping the spread
//       drew carbon dioxide bent. Both are wrong, and the fix was tabulated
//       angles rather than a schematic that flatters some molecules.

import { MOLECULES } from '../../game/chem/library.js';
import { BY_SYMBOL, valenceOf } from '../../game/chem/elements.js';
import {
  TILE_PX, geometryOf, inkMap, tileDistance, tileSvg, worstPair,
} from '../../web/molecule-tile.js';

const failures: string[] = [];
const ok = (c: boolean, d: string): void => { if (!c) failures.push(d); };

// ── V1: nothing falls off the tile ─────────────────────────────────────────
{
  let marks = 0;
  for (const m of MOLECULES) {
    const g = geometryOf(m);
    for (const a of g.atoms) {
      marks += 1;
      ok(a.x - a.r >= 0 && a.x + a.r <= 1 && a.y - a.r >= 0 && a.y + a.r <= 1,
        `V1: in ${m.formula}, atom ${a.symbol} at (${a.x.toFixed(3)}, ${a.y.toFixed(3)}) r=` +
          `${a.r.toFixed(3)} leaves the tile. A clipped atom is a different shape from an ` +
          'unclipped one and the player sees the clip.');
    }
    for (const l of g.label) {
      ok(l.x - l.w / 2 >= 0 && l.x + l.w / 2 <= 1 && l.y + l.h / 2 <= 1,
        `V1: ${m.formula}'s label runs outside the tile.`);
    }
  }
  console.log(`  V1 containment: ${marks} atoms across ${MOLECULES.length} tiles, all inside`);
}

// ── V2: atoms do not merge ─────────────────────────────────────────────────
// Two circles closer than the sum of their radii read as one blob, which is how
// the acetylene bullseye looked before the layout walked the real graph.
{
  for (const m of MOLECULES) {
    const g = geometryOf(m);
    for (let i = 0; i < g.atoms.length; i += 1) {
      for (let j = i + 1; j < g.atoms.length; j += 1) {
        const a = g.atoms[i]!;
        const b = g.atoms[j]!;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        ok(d > (a.r + b.r) * 0.72,
          `V2: in ${m.formula}, ${a.symbol} and ${b.symbol} are ${d.toFixed(3)} apart with radii ` +
            `${a.r.toFixed(3)} and ${b.r.toFixed(3)} — they merge into one mark. Acetylene drew ` +
            'exactly this, as a bullseye, when the layout ringed every atom around the centre.');
      }
    }
  }
  console.log(`  V2 separation: no two atoms merge in any of the ${MOLECULES.length} tiles`);
}

// ── V3: the layout reads the real bond graph ───────────────────────────────
{
  for (const m of MOLECULES) {
    const g = geometryOf(m);
    ok(g.bonds.length === m.skeleton.length,
      `V3: ${m.formula} has ${m.skeleton.length} bonds but the tile draws ${g.bonds.length}.`);
    m.skeleton.forEach(([i, j, order], k) => {
      const b = g.bonds[k]!;
      ok(b.order === order,
        `V3: ${m.formula} bond ${k} is drawn at order ${b.order}, the skeleton says ${order}.`);
      // Every drawn bond must join the two atoms the skeleton actually bonds.
      const joins = Math.hypot(b.x1 - g.atoms[i]!.x, b.y1 - g.atoms[i]!.y) < 1e-9
        && Math.hypot(b.x2 - g.atoms[j]!.x, b.y2 - g.atoms[j]!.y) < 1e-9;
      ok(joins,
        `V3: ${m.formula} draws a bond that does not join atoms ${i} and ${j}. The tile must be a ` +
          'projection of the same skeleton the solver scores, or the picture and the rules drift.');
    });
  }
  console.log(`  V3 graph: every drawn bond joins the atoms the skeleton bonds, at its own order`);
}

// ── V4: the pair a player would confuse ────────────────────────────────────
{
  const maps = MOLECULES.map((m) => ({ f: m.formula, ink: inkMap(geometryOf(m), 32) }));
  const bare = MOLECULES.map((m) => {
    const g = geometryOf(m);
    return { f: m.formula, ink: inkMap({ ...g, label: [] }, 32) };
  });
  const sweep = (ms: typeof maps): { a: string; b: string; d: number; mean: number } => {
    let worst = { a: '', b: '', d: Infinity };
    let total = 0;
    let n = 0;
    for (let i = 0; i < ms.length; i += 1) {
      for (let j = i + 1; j < ms.length; j += 1) {
        const d = tileDistance(ms[i]!.ink, ms[j]!.ink);
        total += d; n += 1;
        if (d < worst.d) worst = { a: ms[i]!.f, b: ms[j]!.f, d };
      }
    }
    return { ...worst, mean: total / n };
  };
  const full = sweep(maps);
  const structural = sweep(bare);

  ok(full.d > 0,
    `V4: ${full.a} and ${full.b} render IDENTICALLY. Ten pairs did once, when atom radius came ` +
      'from valence; a player choosing between them would be guessing.');
  ok(full.d / full.mean > 0.08,
    `V4: the closest pair (${full.a} / ${full.b}) is ${full.d.toFixed(4)} against a field mean of ` +
      `${full.mean.toFixed(4)} — ${((100 * full.d) / full.mean).toFixed(1)}% of typical. Below ` +
      'about 8% the two tiles are near-duplicates at 60 px and the selection is a coin flip.');
  // The label must EARN its place, and the number says by how much.
  ok(full.d >= structural.d,
    `V4: adding the formula label made the worst pair WORSE (${full.d.toFixed(4)} against ` +
      `${structural.d.toFixed(4)} for structure alone). The label exists to separate molecules ` +
      'that share a shape; if it does not, it is ornament on a tile that has no room for any.');
  const wp = worstPair();
  ok(wp.a === full.a || wp.a === full.b,
    `V4: worstPair() reports ${wp.a}/${wp.b} but the sweep found ${full.a}/${full.b}.`);
  console.log(`  V4 distinguishability: worst ${full.a}/${full.b} at ${full.d.toFixed(4)}, mean ` +
    `${full.mean.toFixed(4)} (${((100 * full.d) / full.mean).toFixed(1)}%); structure alone would ` +
    `be ${structural.d.toFixed(4)} (${structural.a}/${structural.b})`);
}

// ── V5: radius is the atom's, not its valence ──────────────────────────────
// The regression guard for the defect that produced ten identical pairs.
{
  const radiusOf = (symbol: string): number => {
    const g = geometryOf(MOLECULES.find((m) => m.atoms.includes(symbol))!);
    return g.atoms.find((a) => a.symbol === symbol)!.r;
  };
  ok(radiusOf('Cl') > radiusOf('H') * 1.4,
    `V5: chlorine draws at ${radiusOf('Cl').toFixed(3)} and hydrogen at ${radiusOf('H').toFixed(3)}. ` +
      'Chlorine is 102 pm against hydrogen at 31 and must look it — sizing by valence made every ' +
      'valence-1 element the same circle and H2, HF, HCl, F2 and Cl2 the same tile.');
  ok(Math.abs(radiusOf('H') - radiusOf('F')) > 1e-3,
    `V5: hydrogen and fluorine draw at the same radius, so HF is H2 with extra steps.`);
  // Both have valence 1, so a valence-driven radius would make them equal.
  ok(valenceOf(BY_SYMBOL.get('H')!.group) === valenceOf(BY_SYMBOL.get('Cl')!.group),
    'V5 PREMISE FAILED: hydrogen and chlorine no longer share a valence, so this check no longer ' +
      'exercises the defect it was written for.');
  console.log(`  V5 radius: Cl draws ${(radiusOf('Cl') / radiusOf('H')).toFixed(2)}x hydrogen, ` +
    `though both have valence 1`);
}

// ── V6: every glyph can be drawn ───────────────────────────────────────────
{
  const svg = MOLECULES.map((m) => tileSvg(m, TILE_PX)).join('');
  for (const m of MOLECULES) {
    for (const ch of m.formula) {
      ok(svg.includes(`>${ch}</text>`),
        `V6: "${ch}" from ${m.formula} is never emitted as a glyph. A formula with a missing ` +
          'character is a molecule the player cannot name.');
    }
  }
  // The ink map must see letterforms, or it cannot measure the label's value —
  // it once scored "O2" and "N2" identically because every glyph was a box.
  const o2 = MOLECULES.find((m) => m.formula === 'O2')!;
  const n2 = MOLECULES.find((m) => m.formula === 'N2')!;
  const labelOnly = (m: typeof o2): Float64Array =>
    inkMap({ ...geometryOf(m), atoms: [], bonds: [] }, 32);
  ok(tileDistance(labelOnly(o2), labelOnly(n2)) > 0,
    'V6: the labels "O2" and "N2" measure as identical ink, so the instrument cannot see ' +
      'letterforms and V4 is underestimating exactly the channel that separates same-shape ' +
      'molecules.');
  console.log(`  V6 glyphs: every character of every formula is emitted, and the ink map ` +
    `distinguishes O2's label from N2's`);
}

// ── V7: tabulated angles, so CO2 is linear and water is not ────────────────
{
  const angleAt = (formula: string): number => {
    const m = MOLECULES.find((x) => x.formula === formula)!;
    const g = geometryOf(m);
    const centre = 0; // the central atom is index 0 in every entry with an angle
    const others = g.atoms.filter((_, i) => i !== centre);
    const [p, q] = [others[0]!, others[1]!];
    const a1 = Math.atan2(p.y - g.atoms[centre]!.y, p.x - g.atoms[centre]!.x);
    const a2 = Math.atan2(q.y - g.atoms[centre]!.y, q.x - g.atoms[centre]!.x);
    let d = Math.abs(a1 - a2) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    return d;
  };
  ok(Math.abs(angleAt('CO2') - 180) < 1,
    `V7: carbon dioxide draws at ${angleAt('CO2').toFixed(1)} degrees. CO2 is LINEAR at 180, and a ` +
      'schematic spread that bends it is wrong about the molecule rather than neutral.');
  ok(Math.abs(angleAt('H2O') - 104.5) < 2,
    `V7: water draws at ${angleAt('H2O').toFixed(1)} degrees, not its measured 104.5. Water is ` +
      'famously bent; drawing it straight was the defect that motivated the tabulated angles.');
  ok(Math.abs(angleAt('HCN') - 180) < 1,
    `V7: hydrogen cyanide draws at ${angleAt('HCN').toFixed(1)} degrees, not linear.`);
  console.log(`  V7 angles: CO2 ${angleAt('CO2').toFixed(0)} degrees, H2O ` +
    `${angleAt('H2O').toFixed(1)}, HCN ${angleAt('HCN').toFixed(0)} — tabulated, not schematic`);
}

if (failures.length > 0) {
  console.error(`verify-tiles: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-tiles: V1-V7 pass. Sixteen molecules fit their tiles, none merge or clip, the ' +
  'layout reads the real bond graph, no two render alike, and the angles are the measured ones.');
