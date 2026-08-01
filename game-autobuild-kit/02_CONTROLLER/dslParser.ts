/**
 * DSL parser (Research -> Execution boundary, P2).
 *
 * Parses a program written in the grammar-restricted DSL (`01_RESEARCH/DSL_GRAMMAR.bnf`)
 * into an AST. Only whitelisted antecedents/actions are accepted — the grammar IS the
 * safety boundary (Tao et al. 2024, https://doi.org/10.3390/a17070287). Anything outside
 * it (arbitrary identifiers, dynamic constructs) is rejected before it can be compiled.
 */

export type Ante =
  | { t: "pred"; name: string; args: string[] }
  | { t: "and"; left: Ante; right: Ante }
  | { t: "or"; left: Ante; right: Ante }
  | { t: "not"; arg: Ante };

export interface Action {
  name: string;
  args: string[];
}

export type Rule =
  | { t: "mandatory"; action: Action }
  | { t: "conditional"; cond: Ante; action: Action };

export interface Program {
  rules: Rule[];
}

export class ParseError extends Error {}
export class BannedConstructError extends Error {}

const PREDICATES = new Set([
  "isSmaller",
  "isCardBetweenNumbers",
  "givesRacko",
  "hasRacko",
  "sum",
  "play",
]);
const ACTIONS = new Set(["draw", "show"]);
const KEYWORDS = new Set(["IF", "THEN", "DO", "AND", "OR", "NOT"]);

/** Runtime-resolved constructs that bypass static AST parsing — barred from deployment. */
const BANNED = [
  { re: /\beval\b/, name: "eval" },
  { re: /\bimport\s*\(/, name: "dynamic import()" },
  { re: /`/, name: "template-literal codegen" },
  { re: /\bFunction\s*\(/, name: "Function constructor" },
];

export function assertNoBannedConstructs(source: string): void {
  for (const b of BANNED) {
    if (b.re.test(source)) {
      throw new BannedConstructError(
        `Banned construct '${b.name}' found; it bypasses static AST parsing and violates replication safety.`,
      );
    }
  }
}

type Tok =
  | { k: "kw"; v: string }
  | { k: "id"; v: string }
  | { k: "num"; v: string }
  | { k: "("; }
  | { k: ")"; }
  | { k: ","; };

function stripComment(line: string): string {
  const i = line.indexOf("//");
  return i >= 0 ? line.slice(0, i) : line;
}

function tokenize(line: string): Tok[] {
  const toks: Tok[] = [];
  const re = /\s+|[(),]|[A-Za-z_][A-Za-z0-9_]*|\d+/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(line)) !== null) {
    const s = m[0];
    if (/^\s+$/.test(s)) {
      consumed += s.length;
      continue;
    }
    if (s === "(") toks.push({ k: "(" });
    else if (s === ")") toks.push({ k: ")" });
    else if (s === ",") toks.push({ k: "," });
    else if (/^\d+$/.test(s)) toks.push({ k: "num", v: s });
    else if (KEYWORDS.has(s)) toks.push({ k: "kw", v: s });
    else toks.push({ k: "id", v: s });
    consumed += s.length;
  }
  // Reject stray characters the tokenizer skipped over.
  const cleaned = line.replace(/\s|[(),]|[A-Za-z_][A-Za-z0-9_]*|\d+/g, "");
  if (cleaned.length > 0) {
    throw new ParseError(`Unexpected characters in DSL: ${JSON.stringify(cleaned)}`);
  }
  void consumed;
  return toks;
}

class Cursor {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}
  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  next(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw new ParseError("Unexpected end of rule.");
    return t;
  }
  expect(k: Tok["k"]): Tok {
    const t = this.next();
    if (t.k !== k) throw new ParseError(`Expected '${k}', got '${t.k}'.`);
    return t;
  }
  done(): boolean {
    return this.i >= this.toks.length;
  }
}

function parseArgs(c: Cursor): string[] {
  const args: string[] = [];
  c.expect("(");
  if (c.peek()?.k === ")") {
    c.next();
    return args;
  }
  for (;;) {
    const t = c.next();
    if (t.k !== "id" && t.k !== "num") throw new ParseError(`Expected argument, got '${t.k}'.`);
    args.push(t.v);
    const sep = c.next();
    if (sep.k === ")") break;
    if (sep.k !== ",") throw new ParseError(`Expected ',' or ')', got '${sep.k}'.`);
  }
  return args;
}

function parseAnte(c: Cursor): Ante {
  const t = c.peek();
  if (!t) throw new ParseError("Expected antecedent.");
  if (t.k === "(") {
    c.next();
    const left = parseAnte(c);
    const op = c.next();
    if (op.k !== "kw" || (op.v !== "AND" && op.v !== "OR")) {
      throw new ParseError("Expected AND/OR inside parentheses.");
    }
    const right = parseAnte(c);
    c.expect(")");
    return op.v === "AND" ? { t: "and", left, right } : { t: "or", left, right };
  }
  if (t.k === "kw" && t.v === "NOT") {
    c.next();
    return { t: "not", arg: parseAnte(c) };
  }
  if (t.k === "id") {
    c.next();
    if (!PREDICATES.has(t.v)) {
      throw new ParseError(`Unknown predicate '${t.v}' (not in grammar whitelist).`);
    }
    return { t: "pred", name: t.v, args: parseArgs(c) };
  }
  throw new ParseError(`Unexpected token '${t.k}' in antecedent.`);
}

function parseAction(c: Cursor): Action {
  const t = c.next();
  if (t.k !== "id" || !ACTIONS.has(t.v)) {
    throw new ParseError(`Expected action (draw/show), got '${t.k === "id" ? t.v : t.k}'.`);
  }
  return { name: t.v, args: parseArgs(c) };
}

function parseRule(toks: Tok[]): Rule {
  const c = new Cursor(toks);
  const head = c.next();
  if (head.k === "kw" && head.v === "DO") {
    const action = parseAction(c);
    if (!c.done()) throw new ParseError("Trailing tokens after mandatory rule.");
    return { t: "mandatory", action };
  }
  if (head.k === "kw" && head.v === "IF") {
    const cond = parseAnte(c);
    const then = c.next();
    if (then.k !== "kw" || then.v !== "THEN") throw new ParseError("Expected THEN.");
    const action = parseAction(c);
    if (!c.done()) throw new ParseError("Trailing tokens after conditional rule.");
    return { t: "conditional", cond, action };
  }
  throw new ParseError("Rule must begin with DO or IF.");
}

export function parseProgram(source: string): Program {
  assertNoBannedConstructs(source);
  const rules: Rule[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (line.length === 0) continue;
    rules.push(parseRule(tokenize(line)));
  }
  if (rules.length === 0) throw new ParseError("Empty program (no rules).");
  return { rules };
}
