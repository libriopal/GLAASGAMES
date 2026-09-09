#!/usr/bin/env node
// scripts/gen-alleles.mjs — emit design/allele-pool.json from the corpus.
//
// The corpus lives outside this repository (1116 `*.info.json` beside 1129
// images). `design/manifest-corpus.py` already established the convention for
// that: do not vendor the corpus, publish a hash and let anyone holding it
// recompute. This does the same for the GRAMMAR the prompts carry.
//
// Unlike the image manifest, the artifact this writes is not only provenance —
// it is the gene pool itself, and Stage 2 reads it at runtime with no corpus on
// disk. So it carries, for each of the 311 grammar prompts, BOTH the raw source
// and its decomposition. That redundancy is deliberate: it is what lets
// `verify-alleles` A3 run the round trip offline. A decomposition that agrees
// with a source stored beside it is checkable; one stored alone is a claim.
//
//     npm run gen:alleles -- [corpus-dir] [out.json]
//
// Default corpus dir: $GLAAS_CORPUS_DIR, else the sibling checkout.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPool, expand, poolDigest, sourcesRoot } from '../corpus/alleles.ts';

const DEFAULT_DIR =
  process.env.GLAAS_CORPUS_DIR ?? '/home/user/libriopal/magentadice-cyancode/data';

const dir = process.argv[2] ?? DEFAULT_DIR;
const out = process.argv[3] ?? new URL('../design/allele-pool.json', import.meta.url).pathname;

/** id -> prompt, for every prompt in the corpus, grammar or prose. */
const sources = new Map();
for (const name of readdirSync(dir).sort()) {
  if (!name.endsWith('.info.json')) continue;
  const doc = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const prompt = doc?.info?.prompt;
  if (typeof prompt !== 'string') {
    throw new Error(`gen-alleles: ${name} has no info.prompt — refusing to skip it silently`);
  }
  // The id is the FILE name, not doc.meta.id: the file is what the image
  // manifest keys on, so provenance joins across the two artifacts.
  sources.set(name.replace(/\.info\.json$/, ''), prompt);
}

const root = sourcesRoot(sources);
const pool = buildPool(sources);
const digest = poolDigest(root, pool);

// Refuse to emit an artifact the round trip does not already witness. A
// generator that wrote a pool its own verifier would reject is a generator that
// makes the verifier look like the author's opinion.
for (const p of pool.prompts) {
  const back = expand(p);
  if (back !== sources.get(p.id)) {
    throw new Error(`gen-alleles: round trip failed for ${p.id} — refusing to emit`);
  }
}

const artifact = {
  generator: 'scripts/gen-alleles.mjs',
  corpus_prompts: sources.size,
  sources_root: root,
  digest,
  total_prompts: pool.totalPrompts,
  total_loci: pool.totalLoci,
  distinct_alleles: pool.frequency.size,
  frequency: Object.fromEntries(
    [...pool.frequency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  ),
  prompts: pool.prompts.map((p) => ({
    id: p.id,
    source: sources.get(p.id),
    skeleton: p.skeleton,
    // `alleles` is what a genome expresses; `raw` is what the corpus wrote.
    // They differ on 7 loci and the artifact carries both, so A3's round trip
    // is checkable without the corpus on disk.
    loci: p.loci.map((l) => ({ alleles: l.alleles, raw: l.raw })),
  })),
};

writeFileSync(out, `${JSON.stringify(artifact, null, 1)}\n`);
console.error(
  `gen-alleles: ${pool.totalPrompts}/${sources.size} prompts carry a grammar; ` +
    `${pool.totalLoci} loci, ${pool.frequency.size} distinct alleles; digest ${digest.slice(0, 12)}`,
);
