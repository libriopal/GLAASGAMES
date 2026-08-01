/**
 * W2 gate: expression generation is deterministic (same genome+corpus+seed ⇒
 * identical output), the prohibition scanner hard-fails on dice/poker/casino
 * iconography, and band honesty rejects dishonest presentation.
 *
 * Run: npm run verify:expression   ·   Exit 0 = gate held.
 */

import type { Genome } from '../genome/types.ts';
import type { BandRender, CorpusIndex } from './pipeline.ts';
import { generateExpression, scanForProhibitedIconography, verifyBandHonesty } from './pipeline.ts';
import { makeProvenanceNote } from '../provenance/types.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const genome: Genome = {
  id: 'g-kot-calibration',
  lineage: [],
  structural: {
    topology: 'contested-centre',
    interactionVerb: 'keep-reroll',
    targeting: 'asymmetric-by-position',
    winCondition: 'plural',
    dilemmaShape: 'stay-or-yield',
    inSessionMutation: 'power-cards',
  },
  economy: { hasDraftEconomy: false, hasStaking: false },
  branch: 'D',
  expression: {
    palette: [],
    motifKeywords: [],
    characterArchetype: '',
    namingGrammar: '',
    soundscape: { tonalCentre: 0, bandVoicing: {} as never, emotionalContour: 'rising' },
    narrativeFrame: '',
  },
  scalars: { boardWidth: 5, boardHeight: 5, chainLengthMin: 3, hazardDensity: 0.2, targetScore: 20 },
  family: 'strike-or-hold',
};

const corpus: CorpusIndex = {
  entries: [
    { id: 'c1', motifKeywords: ['sentinel', 'ember', 'quarry'], sidecarTags: ['warm'] },
    { id: 'c2', motifKeywords: ['lattice', 'thicket', 'signal'], sidecarTags: ['cool'] },
  ],
  namingSyllables: { onset: ['kr', 'th', 'vel'], nucleus: ['a', 'o', 'ei'], coda: ['n', 'sh', 'th'] },
  characterArchetypePool: ['watcher', 'forager', 'signaller'],
  paletteBands: {
    matter: ['#101820', '#1B2A32'],
    ir: ['#FF6B35', '#C1440E'],
    uv: ['#7B2CBF', '#5A189A'],
    cyan: ['#00B4D8', '#0096C7'],
    voidshard: ['#03071E', '#14213D'],
  },
};

const seedA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const seedB = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);

// 1. Determinism: same genome/corpus/seed ⇒ byte-identical output.
const exprA1 = generateExpression(genome, corpus, seedA);
const exprA2 = generateExpression(genome, corpus, seedA);
ok(JSON.stringify(exprA1) === JSON.stringify(exprA2), 'same genome+corpus+seed produces byte-identical expression');

// 2. Different seed ⇒ (very likely) different output — sanity check the pipeline isn't a constant.
const exprB = generateExpression(genome, corpus, seedB);
ok(JSON.stringify(exprA1) !== JSON.stringify(exprB), 'different seed produces different expression');

// 3. Prohibition scanner — clean text passes.
const cleanNote = makeProvenanceNote({
  baselineId: 'kot-ref',
  mechanicTaken: 'contested-space occupancy with asymmetric targeting',
  sourceLineage: 'King of Tokyo (Garfield, 2011)',
  expressionNotTaken: 'no monsters, no Tokyo, no art, no names, no trade dress',
  expressionInvented: {
    names: [exprA1.characterArchetype],
    characters: [exprA1.characterArchetype],
    palette: exprA1.palette,
    narrativeFrame: exprA1.narrativeFrame,
  },
});
const cleanScan = scanForProhibitedIconography(
  `${exprA1.narrativeFrame} ${cleanNote.expressionNotTaken} ${exprA1.motifKeywords.join(' ')}`,
);
ok(cleanScan.clean, 'clean narrative text passes the prohibition scanner');

// 4. Prohibition scanner — dice/poker/casino iconography hard-fails.
ok(!scanForProhibitedIconography('the sentinel rolls a die to decide').clean, 'die iconography is caught');
ok(!scanForProhibitedIconography('a poker chip glints on the table').clean, 'poker iconography is caught');
ok(!scanForProhibitedIconography('the casino jackpot lights flash').clean, 'casino iconography is caught');

// 5. Band honesty — honest render set passes.
const honestRenders: BandRender[] = [
  { band: 'matter', mutatesState: true, presentedAsForecast: false, presentedAsFact: true, labelledSynthetic: false, readOnly: false, tierGate: null },
  { band: 'ir', mutatesState: false, presentedAsForecast: true, presentedAsFact: false, labelledSynthetic: false, readOnly: false, tierGate: null },
  { band: 'uv', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: true, readOnly: false, tierGate: null },
  { band: 'cyan', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: false, readOnly: true, tierGate: null },
  { band: 'voidshard', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: false, readOnly: false, tierGate: 5 },
];
ok(verifyBandHonesty(honestRenders).passed, 'honest band render set passes verify-band-honesty');

// 6. Band honesty — ir presented as fact fails.
const dishonestIr = honestRenders.map((r) => (r.band === 'ir' ? { ...r, presentedAsFact: true } : r));
ok(!verifyBandHonesty(dishonestIr).passed, 'ir presented as fact fails verify-band-honesty');

// 7. Band honesty — un-synthetic-labelled uv fails.
const dishonestUv = honestRenders.map((r) => (r.band === 'uv' ? { ...r, labelledSynthetic: false } : r));
ok(!verifyBandHonesty(dishonestUv).passed, 'uv without synthetic label fails verify-band-honesty');

// 8. Band honesty — a second state-mutating band fails.
const doubleMutator = honestRenders.map((r) => (r.band === 'cyan' ? { ...r, mutatesState: true } : r));
ok(!verifyBandHonesty(doubleMutator).passed, 'a second state-mutating band fails verify-band-honesty');

console.log('');
if (failures === 0) {
  console.log('W2 GATE HELD: expression is deterministic; prohibition scan and band honesty enforced.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
