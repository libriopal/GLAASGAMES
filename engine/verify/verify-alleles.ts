// engine/verify/verify-alleles.ts
// The gene pool is what the corpus actually wrote, and can be shown to be.
//
// A1  the counts are the measured ones, and the gap to the plan's 311 is exactly
//     the five arity-one loci — named, not hand-waved
// A2  the skeleton holds no grammar, so the decomposition is a decomposition
// A3  ROUND TRIP: every one of the 316 prompts rebuilds from its parts, byte
//     for byte, and the parts are demonstrably not a stored copy
// A4  the digest moves when the CORPUS changes and when the PARSER changes —
//     both halves, each with a planted mutant seen to fail
// A5  the artifact's digest recomputes from the artifact's own contents
// A6  and, when the corpus is on disk, from the corpus itself
// A7  the trim is accounted for: 7 padded loci, and no allele carries padding
// A8  the parser reproduces the pinned decomposition WITHOUT the corpus, so a
//     parser regression is caught on a machine that has no corpus to check
// A9  a SECOND implementation, by a different algorithm, agrees about every
//     locus — the auditor's objection, that one parser cannot witness itself
//
// WHY THIS ORACLE IS SHAPED THIS WAY. `design/corpus-digest.json` pins the
// palette's pixels and `verify-theme` T1 checks the palette against it. Run
// through the sovereignty classifier, a digest alone is pinned IN TIME with NO
// WITNESS: it proves nothing has changed since it was written, and says nothing
// about whether it was right when written. A parser that mangled every allele
// the same way would produce a perfectly stable digest for as long as the bug
// lived.
//
// So the load-bearing check here is not A4 or A5, the two that look like the
// serious ones. It is A3, the round trip — the only check that compares the
// pool against something the pool did not produce.
//
// AND IT PAID FOR ITSELF ON THE FIRST RUN. A3 failed on `mp9d4ebqw7edep`: the
// parser trimmed the alternatives, the corpus had padded seven of them
// (`{void black abyss | skeletal gold arches | ...}`), and the pool was quietly
// lossy. No digest, no count and no reading of the corpus would have said so.
// `Locus.raw` exists because of that failure, and A7 is what keeps it honest.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPool,
  expand,
  type AllelePool,
  type ParsedPrompt,
  parsePrompt,
  poolDigest,
  render,
  sourcesRoot,
} from '../../corpus/alleles.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

// ── the measured constants ───────────────────────────────────────────────────
// Every number here was measured against the corpus before it was written down,
// and each is a claim this file can be run to falsify.

/** Prompts in the corpus, grammar and prose alike. */
const CORPUS_PROMPTS = 1116;
/** Prompts carrying a `{...}` grammar, counting arity-one braces. */
const GRAMMAR_PROMPTS = 316;
/** The count in `design/foundry-plan.md`, which required a `|`. */
const PLAN_GRAMMAR_PROMPTS = 311;
const TOTAL_LOCI = 1031;
const DISTINCT_ALLELES = 584;
/** Braces with no `|` inside. The whole of the 316 − 311 gap. */
const ARITY_ONE_LOCI = 5;
/** Loci whose alternatives were written with padding around the pipes. */
const PADDED_LOCI = 7;

const CORPUS_DIR =
  process.env.GLAAS_CORPUS_DIR ?? '/home/user/libriopal/magentadice-cyancode/data';

interface ArtifactLocus {
  alleles: string[];
  raw: string[];
}
interface ArtifactPrompt {
  id: string;
  source: string;
  skeleton: string[];
  loci: ArtifactLocus[];
}
interface Artifact {
  generator: string;
  corpus_prompts: number;
  sources_root: string;
  digest: string;
  total_prompts: number;
  total_loci: number;
  distinct_alleles: number;
  frequency: Record<string, number>;
  prompts: ArtifactPrompt[];
}

const artifactPath = fileURLToPath(new URL('../../design/allele-pool.json', import.meta.url));
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Artifact;

/** The artifact's prompts, in the shape the library works in. */
function asParsed(p: ArtifactPrompt): ParsedPrompt {
  return {
    id: p.id,
    skeleton: p.skeleton,
    loci: p.loci.map((l, index) => ({ index, alleles: l.alleles, raw: l.raw })),
  };
}

/** The artifact as an `AllelePool`, so `poolDigest` can be run over it. */
function asPool(prompts: readonly ArtifactPrompt[]): AllelePool {
  const parsed = prompts.map(asParsed);
  const frequency = new Map<string, number>();
  const provenance = new Map<string, string[]>();
  for (const p of parsed) {
    for (const locus of p.loci) {
      for (const allele of locus.alleles) {
        frequency.set(allele, (frequency.get(allele) ?? 0) + 1);
        const seen = provenance.get(allele) ?? [];
        if (!seen.includes(p.id)) seen.push(p.id);
        provenance.set(allele, seen);
      }
    }
  }
  return {
    prompts: parsed,
    frequency,
    provenance,
    totalPrompts: parsed.length,
    totalLoci: parsed.reduce((n, p) => n + p.loci.length, 0),
  };
}

/** A deep copy, so a planted mutant cannot leak into a later check. */
const clone = (p: readonly ArtifactPrompt[]): ArtifactPrompt[] =>
  JSON.parse(JSON.stringify(p)) as ArtifactPrompt[];

// ── A1: the counts, and the five that explain the gap ───────────────────────

ok(artifact.corpus_prompts === CORPUS_PROMPTS,
  `A1: artifact read ${artifact.corpus_prompts} corpus prompts, expected ${CORPUS_PROMPTS}`);
ok(artifact.total_prompts === GRAMMAR_PROMPTS,
  `A1: ${artifact.total_prompts} grammar prompts, expected ${GRAMMAR_PROMPTS}`);
ok(artifact.prompts.length === GRAMMAR_PROMPTS,
  `A1: header claims ${artifact.total_prompts} prompts but the body lists ${artifact.prompts.length}`);

const loci = artifact.prompts.flatMap((p) => p.loci);
ok(loci.length === TOTAL_LOCI, `A1: ${loci.length} loci, expected ${TOTAL_LOCI}`);
ok(artifact.total_loci === TOTAL_LOCI,
  `A1: header claims ${artifact.total_loci} loci but the body carries ${loci.length}`);

const distinct = new Set(loci.flatMap((l) => l.alleles));
ok(distinct.size === DISTINCT_ALLELES,
  `A1: ${distinct.size} distinct alleles, expected ${DISTINCT_ALLELES}`);
ok(Object.keys(artifact.frequency).length === distinct.size,
  `A1: frequency table lists ${Object.keys(artifact.frequency).length} alleles, body has ${distinct.size}`);

// THE GAP. The plan says 311; this says 316. That is not a discrepancy to be
// tolerated, it is a claim: the difference is exactly the arity-one braces, and
// each of those five prompts carries NOTHING BUT one such locus, which is
// precisely why a count that required a `|` could not see them.
const arityOne = artifact.prompts.filter((p) => p.loci.every((l) => l.alleles.length === 1));
ok(arityOne.length === ARITY_ONE_LOCI,
  `A1: ${arityOne.length} prompts have only arity-one loci, expected ${ARITY_ONE_LOCI}`);
ok(arityOne.every((p) => p.loci.length === 1),
  'A1: an arity-one prompt carries more than one locus, so the 316-vs-311 story is wrong');
ok(GRAMMAR_PROMPTS - arityOne.length === PLAN_GRAMMAR_PROMPTS,
  `A1: ${GRAMMAR_PROMPTS} − ${arityOne.length} ≠ ${PLAN_GRAMMAR_PROMPTS}, so the plan's count is ` +
    'unexplained rather than reconciled');

// The digest separates fields with \u0000 and claims no prompt contains one.
ok(!artifact.prompts.some((p) => p.source.includes('\u0000') || p.id.includes('\u0000')),
  'A1: a prompt contains the NUL the digest uses as a field separator, so the hash is ambiguous');

// ── A2: the skeleton holds no grammar ────────────────────────────────────────
// A parser that "decomposed" by storing the prompt whole would pass a round
// trip while proving nothing. This is the check that makes A3 mean something.
//
// IT CHECKS BRACES, NOT PIPES, AND THE DIFFERENCE WAS MEASURED. The first draft
// rejected `|` in the skeleton too and failed on `mp9c7ucgdfpb38` and
// `mp9c7vcng3iqpx` — two prompts that use a bare pipe as PROSE punctuation
// ("skeletal gold frames | neural lattice pathways | ...") and then carry one
// real `{warm amber|cold electric}` locus at the end. The parse was right and
// the check was wrong. A `{` or `}` in a skeleton is unambiguously a grammar
// the parser failed to take out; a `|` outside braces is just a character the
// author typed.
//
// The two are still pinned, below, so a parser that started leaking pipes out
// of loci would be caught by the count moving rather than by nothing at all.

const BARE_PIPE_PROMPTS = 2;
const BARE_PIPES = 16;
let barePipePrompts = 0;
let barePipes = 0;

for (const p of artifact.prompts) {
  ok(p.skeleton.length === p.loci.length + 1,
    `A2: ${p.id} has ${p.skeleton.length} skeleton segments for ${p.loci.length} loci`);
  for (const [i, seg] of p.skeleton.entries()) {
    if (/[{}]/.test(seg)) {
      fail(`A2: ${p.id} skeleton segment ${i} still contains a brace: ${JSON.stringify(seg.slice(0, 60))}`);
    }
  }
  const pipes = p.skeleton.join('').split('|').length - 1;
  if (pipes > 0) { barePipePrompts += 1; barePipes += pipes; }
}

ok(barePipePrompts === BARE_PIPE_PROMPTS && barePipes === BARE_PIPES,
  `A2: ${barePipes} bare pipes across ${barePipePrompts} prompts, measured ${BARE_PIPES} across ` +
    `${BARE_PIPE_PROMPTS} — either the corpus moved or the parser is leaking loci into the skeleton`);

// ── A3: the round trip ───────────────────────────────────────────────────────

let roundTripped = 0;
for (const p of artifact.prompts) {
  const back = expand(asParsed(p));
  if (back === p.source) roundTripped += 1;
  else fail(`A3: ${p.id} does not rebuild from its parts`);
}
ok(roundTripped === GRAMMAR_PROMPTS,
  `A3: ${roundTripped}/${GRAMMAR_PROMPTS} prompts round-tripped`);

// AND IT IS NOT A STORED COPY. Together with A2 this is what stops the round
// trip from being a self-witness: the skeleton is strictly shorter than the
// source on every prompt, because the grammar was taken out of it.
for (const p of artifact.prompts) {
  const skeletonChars = p.skeleton.join('').length;
  ok(skeletonChars < p.source.length,
    `A3: ${p.id} skeleton is ${skeletonChars} chars against a ${p.source.length}-char source — ` +
      'that is a copy, not a decomposition');
}

// `render` is the other direction and must NOT reproduce the source wherever a
// real choice exists: an expressed genome has no grammar left in it.
const multi = artifact.prompts.find((p) => p.loci.some((l) => l.alleles.length > 1));
if (!multi) fail('A3: no prompt has a locus with a genuine choice, so render cannot be checked');
else {
  const expressed = render(asParsed(multi), multi.loci.map(() => 0));
  ok(!/[{}|]/.test(expressed), `A3: render left grammar in the expressed form of ${multi.id}`);
  ok(expressed !== multi.source, `A3: render reproduced the source of ${multi.id} verbatim`);
}

// ── A4: the digest moves on BOTH halves ──────────────────────────────────────

const pool = asPool(artifact.prompts);
const digestNow = poolDigest(artifact.sources_root, pool);

// (a) THE CORPUS HALF. A corrupted prompt must move the root, and the root
// moves the digest. This is the negative control the plan names.
const corruptedSources = new Map<string, string>();
for (const p of artifact.prompts) corruptedSources.set(p.id, p.source);
const victim = artifact.prompts[0]!;
const cleanRoot = sourcesRoot(corruptedSources);
corruptedSources.set(victim.id, `${victim.source} `);
const dirtyRoot = sourcesRoot(corruptedSources);
ok(cleanRoot !== dirtyRoot,
  'A4 NEGATIVE CONTROL FAILED: appending a space to a prompt did not move the sources root');
ok(poolDigest(cleanRoot, pool) !== poolDigest(dirtyRoot, pool),
  'A4 NEGATIVE CONTROL FAILED: a moved sources root did not move the pool digest');

// (b) THE PARSER HALF, and this is the one a pool-only digest cannot see. The
// sources are byte-identical; only the decomposition changes.
const mutants: { name: string; mutate: (ps: ArtifactPrompt[]) => boolean }[] = [
  {
    name: 'the trim is dropped (raw padding normalised away)',
    mutate: (ps) => {
      let hit = false;
      for (const p of ps) {
        for (const l of p.loci) {
          if (l.raw.join('|') !== l.alleles.join('|')) { l.raw = [...l.alleles]; hit = true; }
        }
      }
      return hit;
    },
  },
  {
    name: 'one allele loses its last character',
    mutate: (ps) => {
      const p = ps.find((q) => q.loci.some((l) => l.alleles.some((a) => a.length > 1)));
      if (!p) return false;
      const l = p.loci.find((x) => x.alleles.some((a) => a.length > 1))!;
      const i = l.alleles.findIndex((a) => a.length > 1);
      l.alleles[i] = l.alleles[i]!.slice(0, -1);
      return true;
    },
  },
  {
    name: 'two alleles at one locus swap order',
    mutate: (ps) => {
      const p = ps.find((q) => q.loci.some((l) => l.alleles.length > 1 && l.alleles[0] !== l.alleles[1]));
      if (!p) return false;
      const l = p.loci.find((x) => x.alleles.length > 1 && x.alleles[0] !== x.alleles[1])!;
      [l.alleles[0], l.alleles[1]] = [l.alleles[1]!, l.alleles[0]!];
      return true;
    },
  },
  {
    name: 'a locus is dropped entirely',
    mutate: (ps) => {
      const p = ps.find((q) => q.loci.length > 1);
      if (!p) return false;
      p.loci.pop();
      p.skeleton.pop();
      return true;
    },
  },
];

for (const m of mutants) {
  const mutated = clone(artifact.prompts);
  if (!m.mutate(mutated)) {
    fail(`A4 VACUOUS CONTROL: "${m.name}" found nothing to change, so it proved nothing`);
    continue;
  }
  const mutatedDigest = poolDigest(artifact.sources_root, asPool(mutated));
  ok(mutatedDigest !== digestNow,
    `A4 NEGATIVE CONTROL FAILED: "${m.name}" left the digest unchanged with the corpus ` +
      'byte-identical — the digest is over the corpus, not over the parse');
}

// ── A5: the artifact's digest recomputes from the artifact ───────────────────

ok(digestNow === artifact.digest,
  `A5: the committed digest is ${artifact.digest.slice(0, 12)} but the body hashes to ` +
    `${digestNow.slice(0, 12)} — the artifact is stale`);
ok(artifact.distinct_alleles === DISTINCT_ALLELES,
  `A5: header claims ${artifact.distinct_alleles} distinct alleles, expected ${DISTINCT_ALLELES}`);

// ── A6: and, where the corpus is present, from the corpus ────────────────────
// The images are not vendored and neither are the prompts; this is the same
// split `verify-theme` T5 makes. A5 proves the artifact is internally sound
// with no corpus; A6 proves it is TRUE when the corpus is reachable.

if (!existsSync(CORPUS_DIR)) {
  console.log(
    `  A6 not run: no corpus at ${CORPUS_DIR}. A1-A5 and A7-A9 hold without it; set GLAAS_CORPUS_DIR to ` +
      'reproduce the pool from source.',
  );
} else {
  const live = new Map<string, string>();
  for (const name of readdirSync(CORPUS_DIR).sort()) {
    if (!name.endsWith('.info.json')) continue;
    const doc = JSON.parse(readFileSync(join(CORPUS_DIR, name), 'utf8')) as {
      info?: { prompt?: unknown };
    };
    const prompt = doc.info?.prompt;
    if (typeof prompt !== 'string') {
      fail(`A6: ${name} has no info.prompt`);
      continue;
    }
    live.set(name.replace(/\.info\.json$/, ''), prompt);
  }

  ok(live.size === CORPUS_PROMPTS, `A6: corpus holds ${live.size} prompts, expected ${CORPUS_PROMPTS}`);

  const liveRoot = sourcesRoot(live);
  ok(liveRoot === artifact.sources_root,
    `A6: the corpus hashes to ${liveRoot.slice(0, 12)} but the artifact pins ` +
      `${artifact.sources_root.slice(0, 12)}`);

  const livePool = buildPool(live);
  ok(poolDigest(liveRoot, livePool) === artifact.digest,
    'A6: re-parsing the corpus does not reproduce the committed digest');
  ok(livePool.totalPrompts === GRAMMAR_PROMPTS && livePool.totalLoci === TOTAL_LOCI,
    `A6: re-parse gives ${livePool.totalPrompts} prompts / ${livePool.totalLoci} loci`);

}

// ── A8: the parser is checked against the artifact, with no corpus ──────────
//
// THIS CHECK EXISTS BECAUSE THE MUTATION HARNESS EXPOSED A HOLE. Curated
// mutants M2 (single-option braces read as literal text) and M3 (the trim
// dropped) were caught only by A6 — the check that re-reads the corpus. On a
// machine without the corpus, both would have walked straight through a green
// A1-A7, because A1 and A7 read the PINNED ARTIFACT and a parser change cannot
// move a file it does not write.
//
// The fix is that the artifact stores each prompt's `source` alongside its
// decomposition. So the parser can be re-run here, offline, against a
// reference it did not just produce. A6 still does the stronger thing — it
// proves the artifact matches the corpus — but A8 means a parser regression is
// caught everywhere, not only where the corpus happens to be mounted.

for (const p of artifact.prompts) {
  const reparsed = parsePrompt(p.id, p.source);
  if (!reparsed) {
    fail(`A8: re-parsing ${p.id} finds no grammar, but the artifact records ${p.loci.length} loci`);
    continue;
  }
  ok(reparsed.skeleton.join('\u0000') === p.skeleton.join('\u0000'),
    `A8: re-parsing ${p.id} gives a different skeleton than the artifact pins`);
  ok(reparsed.loci.length === p.loci.length,
    `A8: re-parsing ${p.id} gives ${reparsed.loci.length} loci, artifact pins ${p.loci.length}`);
  for (const [i, locus] of reparsed.loci.entries()) {
    const pinned = p.loci[i];
    if (!pinned) continue;
    ok(locus.alleles.join('\u0000') === pinned.alleles.join('\u0000'),
      `A8: re-parsing ${p.id} locus ${i} gives different alleles than the artifact pins`);
    ok(locus.raw.join('\u0000') === pinned.raw.join('\u0000'),
      `A8: re-parsing ${p.id} locus ${i} gives a different raw form than the artifact pins`);
  }
}

// PLANTED INPUTS, for the behaviour the corpus cannot exercise. The artifact
// lists only well-formed grammars, so nothing real in it reaches the parser's
// refusals. That is not a reason to leave them unchecked: the mutation harness
// showed the unbalanced-brace throw surviving with the corpus unmounted, for
// exactly this reason. These are the parser's edges, run on data written here.
let threw = false;
try {
  parsePrompt('planted', 'a {b|c prompt with no closing brace');
} catch {
  threw = true;
}
ok(threw, 'A8 NEGATIVE CONTROL FAILED: an unbalanced brace parsed without complaint');

ok(parsePrompt('planted', 'ordinary prose, no braces') === null,
  'A8: prose was read as a grammar');
ok(parsePrompt('planted', 'a {b|c} grammar') !== null,
  'A8: a grammar was read as prose');

// Arity one is a locus, not literal text — the claim the whole 316-vs-311
// reconciliation rests on, checked on a planted input as well as on the five.
const planted = parsePrompt('planted', 'prefix {sole} suffix');
ok(planted !== null && planted.loci.length === 1 && planted.loci[0]!.alleles.length === 1,
  'A8: a single-option brace was read as literal text, so arity one is not a locus');

// ── A9: a SECOND implementation, sharing no code with the first ─────────────
//
// THE INDEPENDENT AUDITOR'S OBJECTION, AND IT WAS RIGHT.
//
// Asked whether A3 is a genuine witness, the auditor's answer named a hole the
// file did not cover: *"the reliance on the same parser for both artifact
// creation and verification (A6/A8), which fails to detect systematic parser
// errors that are consistent across the corpus and the pinned artifact."*
//
// That is the self-witness failure wearing its most persuasive costume. A6 and
// A8 both call `parsePrompt`. If `parsePrompt` is systematically wrong, it is
// wrong identically in the generator and in the verifier, they agree perfectly,
// and every check above goes green.
//
// (Half of the auditor's answer does NOT survive: it also said A3 cannot rule
// out a trivial identity mapping. A2 forbids a brace in any skeleton segment
// and A3 requires every skeleton to be strictly shorter than its source, so an
// identity mapping fails both. The objection that landed is the one below.)
//
// So this is a second reading of the same corpus by a DIFFERENT ALGORITHM —
// regex scanning rather than index walking — written to agree with the first
// only if both are right. It is not a better parser and it does not replace
// one; it is a witness that does not share the first one's mistakes.
//
// WHAT IT IS WORTH, MEASURED RATHER THAN ASSERTED. The scenario was built and
// run (`mut-alleles-a9.mjs`): the parser mutated to never split on `|`, the
// artifact regenerated with it, and the pinned constants rewritten to match, so
// that the pool, the digest, the round trip and every re-parse agreed with each
// other about a pool of 1031 arity-one loci. A9 objected on 1026 of them.
//
// But it was NOT the only check that objected, and saying otherwise would be
// the vocabulary proxy this project keeps catching itself in. A1's arity-one
// reconciliation fired too (316 prompts of pure arity one, not 5), and so did
// A3's guard against having no genuine choice left to test `render` on. A9's
// claim is therefore corroboration, not sole custody: it is the only check that
// would still object if those two constants were also "corrected", and that is
// the whole of what it earns.

/** Loci of one prompt, found by regex. Deliberately not `parsePrompt`'s method. */
function recount(source: string): string[][] {
  return [...source.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!.split('|'));
}

let recountedLoci = 0;
let recountedPrompts = 0;
for (const p of artifact.prompts) {
  const theirs = recount(p.source);
  recountedLoci += theirs.length;
  if (theirs.length > 0) recountedPrompts += 1;

  ok(theirs.length === p.loci.length,
    `A9: independent recount finds ${theirs.length} loci in ${p.id}, the parser recorded ` +
      `${p.loci.length}`);
  for (const [i, alts] of theirs.entries()) {
    const pinned = p.loci[i];
    if (!pinned) continue;
    ok(alts.join(' ') === pinned.raw.join(' '),
      `A9: independent recount disagrees with the parser about locus ${i} of ${p.id}`);
  }
}

ok(recountedPrompts === GRAMMAR_PROMPTS,
  `A9: recount finds ${recountedPrompts} prompts with a grammar, parser found ${GRAMMAR_PROMPTS}`);
ok(recountedLoci === TOTAL_LOCI,
  `A9: recount finds ${recountedLoci} loci, parser found ${TOTAL_LOCI}`);

// AND THE OTHER DIRECTION, which is the half that needs the corpus: the parser
// could be systematically DROPPING prompts, and no amount of agreement about
// the 316 it kept would show it. So the recount is run over every prompt in the
// corpus, including the 800 the parser called prose.
if (existsSync(CORPUS_DIR)) {
  let corpusGrammars = 0;
  let corpusLoci = 0;
  for (const name of readdirSync(CORPUS_DIR)) {
    if (!name.endsWith('.info.json')) continue;
    const doc = JSON.parse(readFileSync(join(CORPUS_DIR, name), 'utf8')) as {
      info?: { prompt?: unknown };
    };
    if (typeof doc.info?.prompt !== 'string') continue;
    const found = recount(doc.info.prompt);
    if (found.length > 0) { corpusGrammars += 1; corpusLoci += found.length; }
  }
  ok(corpusGrammars === GRAMMAR_PROMPTS,
    `A9: a regex sweep of the whole corpus finds ${corpusGrammars} grammar prompts, the pool has ` +
      `${GRAMMAR_PROMPTS} — the parser is dropping prompts the corpus contains`);
  ok(corpusLoci === TOTAL_LOCI,
    `A9: a regex sweep of the whole corpus finds ${corpusLoci} loci, the pool has ${TOTAL_LOCI}`);
}

// The recount must be capable of disagreeing, or its agreement means nothing.
const plantedDisagreement = recount('a {x|y} b {z} c');
ok(plantedDisagreement.length === 2 &&
  plantedDisagreement[0]!.join(' ') === 'x y' &&
  plantedDisagreement[1]!.join(' ') === 'z',
  'A9 VACUOUS CONTROL: the independent recount does not find loci it is shown, so its agreement ' +
    'with the parser is not evidence');

// ── A7: the trim is accounted for ────────────────────────────────────────────
// The failure that produced `Locus.raw`. Both directions: the padding survives
// where the corpus wrote it, and it survives NOWHERE ELSE.

const padded = loci.filter((l) => l.raw.join('|') !== l.alleles.join('|'));
ok(padded.length === PADDED_LOCI,
  `A7: ${padded.length} padded loci, expected ${PADDED_LOCI} — the corpus's whitespace has moved`);
for (const l of padded) {
  ok(l.raw.map((a) => a.trim()).join('|') === l.alleles.join('|'),
    'A7: a padded locus\'s alleles are not the trim of its raw form, so the two views disagree');
}
for (const a of distinct) {
  ok(a === a.trim(), `A7: allele ${JSON.stringify(a)} carries padding, so the trim did not happen`);
  ok(a.length > 0, 'A7: an empty allele reached the pool');
}

// ── verdict ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`verify-alleles: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `verify-alleles: A1-A9 pass. ${GRAMMAR_PROMPTS}/${CORPUS_PROMPTS} prompts carry a grammar; ` +
    `${TOTAL_LOCI} loci, ${DISTINCT_ALLELES} alleles; all ${GRAMMAR_PROMPTS} round-trip; ` +
    `digest ${artifact.digest.slice(0, 12)}`,
);
