#!/usr/bin/env node
// scripts/audit.mjs — the external witness, called properly.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS BROKEN.
//
// Four consecutive audits came back with an EMPTY `content` field and
// `finish_reason: "length"`. The model is a reasoning model: it emits its
// deliberation into `reasoning_content`, that deliberation counts against
// `max_tokens`, and the budget ran out before the answer was emitted. Twice the
// finished answer was sitting in the trace, drafted verbatim and never sent.
// Once it degenerated into a loop, re-checking "no bullets? yes" forty times.
//
// The answers were recovered by MINING THE TRACE. That worked and it should not
// have been necessary, and it is exactly the kind of thing that quietly becomes
// permanent. One of those four never reached a verdict at all, and the cycle it
// gated is recorded as unapproved because of it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY PROMPTING HARDER MADE IT WORSE.
//
// The obvious fix — "do NOT deliberate, answer immediately" — was tried and
// backfired measurably. The model deliberated ABOUT not deliberating: the loop
// in the worst run consists entirely of the model verifying it had complied with
// the no-deliberation instruction. Instructions to a reasoning model to stop
// reasoning are themselves reasoned about.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIX, AND THE AUDIT OF THE FIX.
//
// First attempt: ask for a JSON schema. Constrained decoding gives the grammar
// somewhere to go, and measured on the same endpoint and model the schema
// request returns `finish_reason: "stop"` with populated `content` where the
// prose request returned `"length"` with an empty one.
//
// That version was then put through itself, and it came back REVISE on two
// counts, both upheld:
//
//   "It does not genuinely fix the problem; it merely changes the target. The
//    root cause is the ratio of reasoning tokens to the total token budget. If
//    the model's internal deliberation consumes the entire budget, the output
//    format is irrelevant."
//
//   "[Trace-mining] is indefensible for an audit. An audit requires a formal,
//    committed conclusion. A reasoning trace is a 'stream of consciousness' —
//    unrefined, often contains self-corrections, false starts, and contradictory
//    hypotheses. By mining the trace, you are conflating the model's internal
//    process with its formal verdict."
//
// The second is the one that bites, and it is demonstrably true of our own
// history: the round-2 chemistry trace contains "VERDICT: APPROVE, ensure the
// library includes a few simple noble gas compounds", which the model then
// RECONSIDERED AND REPLACED. A regex taking the last match happened to pick the
// right one. That is luck, not evidence.
//
// So trace-mining no longer produces a verdict. Ever. What replaces it answers
// the first objection too, because it is a resource-allocation fix rather than a
// formatting one:
//
//   PASS 1  free-form, large budget. Deliberation gets a budget of its own and
//           is allowed to run to exhaustion.
//   PASS 2  schema-constrained, SHORT, and handed pass 1's own analysis as
//           material. Its only job is to commit.
//
// The distinction from mining is the whole point. The trace becomes INPUT, and
// the verdict is something the witness formally emits after seeing it — not
// something this script infers on its behalf with a regular expression.
//
// ─────────────────────────────────────────────────────────────────────────────
// AND IT HALTS.
//
// `MASTER_EXECUTION_PROMPT.md` §3 makes the external witness a law and A1 makes
// an unreachable witness a HALT, not a warning. So this exits non-zero when it
// cannot obtain a verdict. A pipeline that treats a silent auditor as approval
// has no auditor.
//
// Usage:  node scripts/audit.mjs <brief.json> [--out design/audits]
// Brief:  { "name": "chem-r3", "context": "...", "questions": [{"id":"a","text":"..."}] }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const MODEL = process.env.CF_AUDIT_MODEL;

if (!ACCOUNT || !TOKEN || !MODEL) {
  console.error('audit: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and CF_AUDIT_MODEL must be set.');
  console.error('audit: the witness is unreachable, which HALTS the pipeline rather than passing it.');
  process.exit(2);
}

const args = process.argv.slice(2);
const briefPath = args[0];
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'design/audits';
if (!briefPath) {
  console.error('usage: node scripts/audit.mjs <brief.json> [--out dir]');
  process.exit(2);
}

const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
const questions = brief.questions ?? [];
if (questions.length === 0) {
  console.error('audit: the brief asks nothing. An audit with no questions is a formality.');
  process.exit(2);
}

/**
 * The schema IS the anti-loop mechanism.
 *
 * Each question gets its own required string property, so the model cannot
 * satisfy the grammar by writing a preamble, and cannot leave one unanswered to
 * spend its budget on another. `verdict` is an enum of exactly two values, which
 * is why a verdict now either exists or the call failed — there is no third
 * state for a harness to interpret generously.
 */
function schemaFor(qs) {
  // ── VERDICT FIRST, AND THAT ORDERING IS LOAD-BEARING ──────────────────────
  //
  // It was last, and a run truncated at 1558 emitted characters lost exactly the
  // field the whole call exists to obtain — five answers arrived and the
  // commitment did not. Emitting the judgement before its justification costs
  // nothing and means a cut-off response degrades to a verdict without detail
  // rather than to detail without a verdict.
  const properties = {
    verdict: { type: 'string', enum: ['APPROVE', 'REVISE'] },
    change_that_matters_most: { type: 'string' },
  };
  for (const q of qs) {
    properties[`answer_${q.id}`] = { type: 'string', description: q.text };
  }
  return {
    type: 'object',
    properties,
    required: ['verdict', 'change_that_matters_most', ...qs.map((q) => `answer_${q.id}`)],
  };
}

/**
 * How much room the answer needs, as opposed to the deliberation.
 *
 * A flat 1500 was the other half of that same failure: five questions of prose
 * do not fit in it, so the call was doomed before it started. Budget now scales
 * with what was actually asked.
 */
const answerBudget = (qs) => 900 + 500 * qs.length;

const prompt = [
  brief.context.trim(),
  '',
  'Review this adversarially. Find what is wrong. An approval you did not earn is worthless to us.',
  '',
  ...questions.map((q) => `(${q.id}) ${q.text}`),
  '',
  'Answer every question. Then give a verdict: APPROVE only if you would stake your name on this ' +
    'being sound, REVISE otherwise.',
].join('\n');

async function call(messages, maxTokens, useSchema) {
  const body = { messages, max_tokens: maxTokens, temperature: 0.2 };
  if (useSchema) {
    body.response_format = { type: 'json_schema', json_schema: schemaFor(questions) };
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 300))}`);
  const json = await res.json();
  if (json.success === false) throw new Error(`API error ${JSON.stringify(json.errors).slice(0, 300)}`);
  const choice = json.result?.choices?.[0];
  return {
    finish: choice?.finish_reason ?? 'unknown',
    content: (choice?.message?.content ?? '').trim(),
    reasoning: choice?.message?.reasoning_content ?? '',
  };
}

const parseVerdict = (content) => {
  if (!content) return null;
  try {
    const p = JSON.parse(content);
    return p.verdict === 'APPROVE' || p.verdict === 'REVISE' ? p : null;
  } catch {
    // ── SALVAGING A TRUNCATED EMISSION IS NOT TRACE-MINING ──────────────────
    //
    // The distinction the audit of this harness drew is between the model's
    // INTERNAL PROCESS and its FORMAL OUTPUT. A reasoning trace is the former:
    // full of false starts and superseded drafts, and reading a verdict out of
    // it is guessing. A truncated JSON response is the latter — the committed
    // answer, cut off by a token limit partway through. The verdict field in it
    // was emitted, not inferred.
    //
    // So this recovers a complete `"verdict": "..."` pair from otherwise
    // unparseable content, and stamps the result so a reader knows the detail
    // may be short. It does NOT reach into `reasoning_content`, which nothing
    // in this file does any more.
    const m = /"verdict"\s*:\s*"(APPROVE|REVISE)"/.exec(content);
    if (!m) return null;
    const partial = { verdict: m[1], truncated: true };
    for (const km of content.matchAll(/"(answer_[a-z0-9_]+|change_that_matters_most)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      partial[km[1]] = km[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    return partial;
  }
};

let result = null;
let provenance = null;
const attempts = [];

// ── PASS 1: one direct schema-constrained attempt ──────────────────────────
// When it works — and on the measured case it does — the witness answered in
// one call and nothing else is needed.
for (const maxTokens of [2500, 5000]) {
  let r;
  try {
    r = await call([{ role: 'user', content: prompt }], maxTokens, true);
  } catch (e) {
    attempts.push({ pass: 1, maxTokens, error: String(e).slice(0, 200) });
    continue;
  }
  attempts.push({ pass: 1, maxTokens, finish: r.finish, contentChars: r.content.length, reasoningChars: r.reasoning.length });
  const p = parseVerdict(r.content);
  if (p) { result = p; provenance = p.truncated ? 'emitted-truncated' : 'emitted'; break; }

  // ── PASS 2: give the deliberation its own budget, then ask it to commit ──
  //
  // This is the resource-allocation fix the audit of this harness demanded. The
  // analysis that pass 1 produced — which is real work, and was previously
  // thrown away or mined — is handed back as material, and the witness is asked
  // for one short structured judgement on it.
  //
  // It is NOT trace-mining. The trace is input; the verdict is emitted. The
  // model commits to a conclusion after seeing its own reasoning, rather than
  // this script picking a line out of it and deciding that counts.
  if (r.reasoning.length > 0) {
    const material = r.reasoning.slice(-12000);
    let r2;
    try {
      r2 = await call([
        { role: 'user', content: prompt },
        { role: 'assistant', content: `My analysis so far:\n\n${material}` },
        {
          role: 'user',
          content:
            'That analysis is yours. Do not redo it and do not second-guess it — where it ' +
            'contains false starts or superseded drafts, keep only what you now stand behind. ' +
            'Commit to your final answers and a verdict.',
        },
      ], answerBudget(questions), true);
    } catch (e) {
      attempts.push({ pass: 2, maxTokens: answerBudget(questions), error: String(e).slice(0, 200) });
      continue;
    }
    attempts.push({ pass: 2, maxTokens: answerBudget(questions), finish: r2.finish, contentChars: r2.content.length });
    const p2 = parseVerdict(r2.content);
    if (p2) { result = p2; provenance = p2.truncated ? 'emitted-after-deliberation-truncated' : 'emitted-after-deliberation'; break; }
  }
}

const record = {
  name: brief.name,
  model: MODEL,
  at: new Date().toISOString(),
  provenance,
  attempts,
  questions: questions.map((q) => ({ id: q.id, text: q.text })),
  result,
};

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${brief.name}.json`);
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

if (result === null) {
  console.error(`audit ${brief.name}: NO VERDICT after ${attempts.length} attempts.`);
  console.error(JSON.stringify(attempts, null, 2));
  console.error('audit: the witness did not answer. Per the External Witness Law this HALTS the');
  console.error('       pipeline. It is not an approval, and it is not a warning to work past.');
  process.exit(1);
}

console.log(`audit ${brief.name} — ${MODEL}`);
console.log(`provenance: ${provenance}` +
  (provenance.startsWith('emitted-after-deliberation')
    ? '  (two-pass: the witness saw its own analysis, then committed)'
    : '  (single call)') +
  (provenance.endsWith('truncated') ? '  [cut off after the verdict — detail may be short]' : ''));
for (const q of questions) {
  const a = result[`answer_${q.id}`];
  if (a) console.log(`\n(${q.id}) ${q.text}\n    ${a.replace(/\n/g, '\n    ')}`);
}
console.log(`\nVERDICT: ${result.verdict}`);
console.log(`most important change: ${result.change_that_matters_most}`);
console.log(`\nwritten to ${outPath}`);
process.exit(result.verdict === 'APPROVE' ? 0 : 3);
