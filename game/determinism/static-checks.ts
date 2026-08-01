// game/determinism/static-checks.ts — W8 (07_CLAUDE_CODE_HANDOFF_V6.md §5.2, §9)
// ESLint-equivalent static scan: Math.random() is banned in all seed and
// scoring paths. Implemented as a source-tree grep so it runs anywhere
// (verify:determinism, CI) without an ESLint config dependency.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export interface MathRandomScanResult {
  clean: boolean;
  offendingFiles: string[];
}

function listTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'game-autobuild-kit') continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (extname(full) === '.ts') out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * Strips comments and string/template literals so the scan only sees actual
 * code — otherwise every file that DOCUMENTS the ban (comments, error
 * messages quoting "Math.random()") would false-positive on itself.
 */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/.*$/gm, '') // line comments
    .replace(/`(?:[^`\\]|\\.)*`/g, '``') // template literals
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, "''"); // single-quoted strings
}

/** Scans families/, foundry/, corpus/, game/ for literal Math.random( CODE usage (not comments/strings). */
export function scanForMathRandom(roots: string[]): MathRandomScanResult {
  const offending: string[] = [];
  for (const root of roots) {
    for (const file of listTsFiles(root)) {
      const content = stripNonCode(readFileSync(file, 'utf8'));
      if (/Math\s*\.\s*random\s*\(/.test(content)) offending.push(file);
    }
  }
  return { clean: offending.length === 0, offendingFiles: offending };
}
