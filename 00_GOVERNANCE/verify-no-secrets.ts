/**
 * 00_GOVERNANCE/verify-no-secrets.ts — §14 #25, repo-wide.
 * "Fails when any credential pattern appears in tracked files."
 *
 * §10.0: this check runs in CI from P1 onward, not from P9 — it does not
 * assume any provider key exists yet, it just refuses to let one leak in
 * once they do.
 *
 * Scope: `git ls-files` (tracked, non-ignored files only — .env* is
 * gitignored per §10.1 and is correctly invisible to this scan).
 *
 * Run: npm run verify:no-secrets   ·   Exit 0 = clean.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const PATTERNS: SecretPattern[] = [
  { name: 'aws-access-key-id', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'jwt-like-token', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'postgres-url-with-embedded-password', regex: /postgres(?:ql)?:\/\/[^:/\s'"]+:[^@/\s'"]{4,}@/ },
  { name: 'generic-private-key-block', regex: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  // *_API_KEY / *_SECRET / *_TOKEN / *_PASSWORD assigned a non-empty, non-placeholder literal.
  {
    name: 'assigned-credential-literal',
    regex: /\b(?:[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\s*[:=]\s*["']([A-Za-z0-9_\-./+]{12,})["']/,
  },
];

const PLACEHOLDER = /^(changeme|placeholder|xxx+|todo|your[-_]?key|example|test|dummy)$/i;

function scanFile(path: string): string[] {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const hits: string[] = [];
  for (const p of PATTERNS) {
    const m = p.regex.exec(content);
    if (!m) continue;
    if (p.name === 'assigned-credential-literal') {
      const value = m[1] ?? '';
      if (PLACEHOLDER.test(value) || value.startsWith('process.env') || value.startsWith('$')) continue;
    }
    // A connection string pointed at localhost/127.0.0.1 cannot be a leaked
    // remote credential — this is how the throwaway Docker Postgres
    // containers in core/store/verify-store.ts are addressed. The regex
    // match ends at "@"; the host follows immediately after in the source.
    if (p.name === 'postgres-url-with-embedded-password') {
      const afterMatch = content.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (/^(localhost|127\.0\.0\.1)[:/]/.test(afterMatch)) continue;
    }
    hits.push(p.name);
  }
  return hits;
}

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot }).toString();
  return out
    .split('\n')
    .filter(Boolean)
    .map((f) => join(repoRoot, f));
}

let failures = 0;
const checkNames: string[] = [];
const check = (name: string, cond: boolean, detail: string) => {
  checkNames.push(name);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!cond) failures++;
};

// fixture: the scanner must actually catch a planted secret shape. Built by
// concatenation, not a literal assignment, so this line doesn't trip the
// scanner's own self-scan once this file is tracked by git — the fixture
// only needs to match the pattern at runtime, not appear as source text
// shaped like one.
const plantedSecret = ['const ANTHROPIC', '_API_KEY', ' = "sk-ant-', 'realtokenlookingvalue1234567890', '";'].join('');
const plantedHits = PATTERNS.filter((p) => p.regex.test(plantedSecret) && !(p.name === 'assigned-credential-literal' && PLACEHOLDER.test('sk-ant-realtokenlookingvalue1234567890')));
check('verify-no-secrets-scanner-catches-planted-secret', plantedHits.length > 0, 'scanner recognizes a hardcoded credential-literal fixture');

const emptyAssignment = 'ANTHROPIC_API_KEY=';
check(
  'verify-no-secrets-scanner-ignores-empty-value',
  !PATTERNS.some((p) => p.regex.test(emptyAssignment)),
  '.env.example lines like ANTHROPIC_API_KEY= (empty) must not trip the scanner',
);

// built by concatenation for the same self-scan reason as plantedSecret above.
// Host kept vendor-neutral so this fixture doesn't also trip verify-no-vendor-leak.
const remoteConnString = ['postgres://postgres:', 'RealLeakedPassw0rd', '@db.example-project.example-host.internal:5432/postgres'].join('');
check(
  'verify-no-secrets-scanner-catches-remote-connection-string',
  PATTERNS.find((p) => p.name === 'postgres-url-with-embedded-password')!.regex.test(remoteConnString),
  'a connection string with a remote host and embedded password must still match',
);
const scratchDir = mkdtempSync(join(tmpdir(), 'verify-no-secrets-fixture-'));
const scratchFile = join(scratchDir, 'fixture.ts');
writeFileSync(scratchFile, "const url = 'postgres://postgres:glassbox@localhost:54329/glassbox_admin';\n");
check(
  'verify-no-secrets-scanner-ignores-localhost-connection-string',
  !scanFile(scratchFile).includes('postgres-url-with-embedded-password'),
  'a throwaway localhost Docker connection string (any password) must not trip the scanner',
);
rmSync(scratchDir, { recursive: true, force: true });

const offenders: Array<{ file: string; patterns: string[] }> = [];
for (const file of trackedFiles()) {
  const hits = scanFile(file);
  if (hits.length > 0) offenders.push({ file: file.slice(repoRoot.length + 1), patterns: hits });
}
check(
  'verify-no-secrets',
  offenders.length === 0,
  offenders.length === 0 ? 'no credential pattern found in any tracked file' : offenders.map((o) => `${o.file} (${o.patterns.join(', ')})`).join('; '),
);

console.log('');
console.log(`${checkNames.length} named checks exercised.`);
if (failures === 0) {
  console.log('verify-no-secrets HELD.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
