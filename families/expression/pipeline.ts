// families/expression/pipeline.ts — W2 (07_CLAUDE_CODE_HANDOFF_V6.md §3.2)
// Expression is GENETIC. This derives phenotype from genotype — it does NOT
// apply a skin to a finished game. Deterministic: same genome ⇒ same
// expression, always. Uses a counter-hash DRBG seeded by caller-supplied CSPRNG
// bytes — never Math.random() (§5.2 / verify-no-math-random applies to this path
// by extension of the seed discipline).

import { createHash } from 'node:crypto';
import type { ExpressionLoci, Genome, SoundscapeGenes, SpectrumBand } from '../genome/types.ts';

export interface CorpusEntry {
  id: string;
  motifKeywords: string[];
  sidecarTags: string[]; // from the entry's .info.json sidecar
}

export interface CorpusIndex {
  entries: CorpusEntry[]; // production corpus: ~1,550 images + .info.json sidecars
  namingSyllables: { onset: string[]; nucleus: string[]; coda: string[] };
  characterArchetypePool: string[];
  paletteBands: Record<SpectrumBand, string[]>; // candidate hex swatches per band
}

export type GeneratedExpression = ExpressionLoci;

/** Deterministic counter-hash stream: same (seed, label) ⇒ same sequence, always. */
function deriveStream(seed: Uint8Array, label: string, count: number): number[] {
  const out: number[] = [];
  let counter = 0;
  while (out.length < count) {
    const h = createHash('sha256');
    h.update(Buffer.from(seed));
    h.update(label);
    h.update(Buffer.from([counter & 0xff, (counter >> 8) & 0xff]));
    const digest = h.digest();
    for (let i = 0; i < digest.length && out.length < count; i++) {
      const b = digest[i];
      if (b !== undefined) out.push(b / 255);
    }
    counter++;
  }
  return out;
}

function pick<T>(arr: readonly T[], r: number): T {
  const item = arr[Math.floor(r * arr.length) % arr.length];
  if (item === undefined) throw new Error('pick() called on empty pool — corpus is underspecified');
  return item;
}

function buildNamingGrammar(
  syllables: CorpusIndex['namingSyllables'],
  rolls: number[],
): string {
  const onset = pick(syllables.onset, rolls[0] ?? 0);
  const nucleus = pick(syllables.nucleus, rolls[1] ?? 0);
  const coda = pick(syllables.coda, rolls[2] ?? 0);
  return `${onset}${nucleus}(${coda})+`; // grammar descriptor, not a single generated name
}

function deriveSoundscape(genome: Genome, rolls: number[]): SoundscapeGenes {
  const contours: SoundscapeGenes['emotionalContour'][] = ['rising', 'cyclical', 'resolving', 'suspended'];
  const voicingPool = ['pluck', 'pad', 'bell', 'drone', 'click', 'sweep'];
  const bands: SpectrumBand[] = ['matter', 'ir', 'uv', 'cyan', 'voidshard'];
  const bandVoicing = Object.fromEntries(
    bands.map((band, i) => [band, pick(voicingPool, rolls[i] ?? 0)]),
  ) as Record<SpectrumBand, string>;
  const tonalCentre = 110 * 2 ** Math.floor((rolls[5] ?? 0) * 3); // 110 / 220 / 440 Hz
  const dilemmaToContour: Record<Genome['structural']['dilemmaShape'], SoundscapeGenes['emotionalContour']> = {
    'push-or-bank': 'rising',
    'stay-or-yield': 'suspended',
    'commit-or-reroll': 'cyclical',
    'invest-or-cash': 'resolving',
    'strike-or-hold': 'suspended',
  };
  return {
    tonalCentre,
    bandVoicing,
    emotionalContour: dilemmaToContour[genome.structural.dilemmaShape] ?? contours[0]!,
  };
}

function derivePalette(corpus: CorpusIndex, rolls: number[]): string[] {
  const bands: SpectrumBand[] = ['matter', 'ir', 'uv', 'cyan', 'voidshard'];
  return bands.map((band, i) => pick(corpus.paletteBands[band], rolls[i] ?? 0));
}

/**
 * Deterministic: same (genome.id, corpus, seed) ⇒ byte-identical expression.
 */
export function generateExpression(genome: Genome, corpus: CorpusIndex, seed: Uint8Array): GeneratedExpression {
  if (corpus.entries.length === 0) throw new Error('empty corpus — cannot derive expression');
  const rolls = deriveStream(seed, genome.id, 24);

  const motifPool = corpus.entries.flatMap((e) => e.motifKeywords);
  const motifKeywords = [0, 1, 2].map((i) => pick(motifPool, rolls[i] ?? 0));
  const characterArchetype = pick(corpus.characterArchetypePool, rolls[3] ?? 0);
  const namingGrammar = buildNamingGrammar(corpus.namingSyllables, rolls.slice(4, 7));
  const palette = derivePalette(corpus, rolls.slice(7, 12));
  const soundscape = deriveSoundscape(genome, rolls.slice(12, 18));
  const narrativeFrame = `${characterArchetype} at ${genome.structural.topology.replace(/-/g, ' ')}, ${motifKeywords.join('/')}`;

  return { palette, motifKeywords, characterArchetype, namingGrammar, soundscape, narrativeFrame };
}

// ---------------------------------------------------------------------------
// §3.1 — expression prohibition scanner (verify-expression-prohibition, hard-fail)
// ---------------------------------------------------------------------------

export interface ProhibitionHit {
  category: 'diceIconography' | 'pokerIconography' | 'casinoIconography';
  pattern: string;
  match: string;
}

export interface ProhibitionScanResult {
  clean: boolean;
  hits: ProhibitionHit[];
}

const PROHIBITED_PATTERNS: Record<ProhibitionHit['category'], RegExp[]> = {
  diceIconography: [/\bdice\b/i, /\bdie\b/i, /\bpips?\b/i, /\bd6\b/i, /\bd20\b/i, /\bcraps\b/i],
  pokerIconography: [
    /\bpoker\b/i,
    /\bpoker chips?\b/i,
    /\btexas hold ?'?em\b/i,
    /\bstraight flush\b/i,
    /\bfull house\b/i,
    /\bplaying cards?\b/i,
    /\bsuit of (spades|hearts|clubs|diamonds)\b/i,
  ],
  casinoIconography: [/\bcasino\b/i, /\bslot machines?\b/i, /\broulette\b/i, /\bblackjack\b/i, /\bjackpot\b/i],
};

/** Scans generated assets and asset prompts. Any hit is a hard-fail (§9). */
export function scanForProhibitedIconography(text: string): ProhibitionScanResult {
  const hits: ProhibitionHit[] = [];
  for (const [category, patterns] of Object.entries(PROHIBITED_PATTERNS) as [
    ProhibitionHit['category'],
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) hits.push({ category, pattern: pattern.source, match: match[0] });
    }
  }
  return { clean: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// §3.2 — band honesty (verify-band-honesty). Presentation policy, not a gene.
// ---------------------------------------------------------------------------

export interface BandRender {
  band: SpectrumBand;
  mutatesState: boolean;
  presentedAsForecast: boolean;
  presentedAsFact: boolean;
  labelledSynthetic: boolean;
  readOnly: boolean;
  tierGate: number | null;
}

export interface BandHonestyResult {
  passed: boolean;
  violations: string[];
}

export function verifyBandHonesty(renders: BandRender[]): BandHonestyResult {
  const violations: string[] = [];
  const byBand = new Map(renders.map((r) => [r.band, r]));

  const mutators = renders.filter((r) => r.mutatesState);
  if (mutators.length !== 1 || mutators[0]?.band !== 'matter') {
    violations.push('exactly one band (matter) may mutate state');
  }

  const ir = byBand.get('ir');
  if (ir && (!ir.presentedAsForecast || ir.presentedAsFact)) {
    violations.push('ir must be presented as a forecast, never as fact');
  }

  const uv = byBand.get('uv');
  if (uv && !uv.labelledSynthetic) {
    violations.push('uv must always be labelled synthetic');
  }

  const cyan = byBand.get('cyan');
  if (cyan && !cyan.readOnly) {
    violations.push('cyan must be read-only');
  }

  const voidshard = byBand.get('voidshard');
  if (voidshard && voidshard.tierGate !== 5) {
    violations.push('voidshard must be Tier-5 gated');
  }

  return { passed: violations.length === 0, violations };
}
