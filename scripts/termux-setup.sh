#!/usr/bin/env bash
# scripts/termux-setup.sh — bootstrap GLAASGAMES for OpenClaude on Android/Termux.
#
# Idempotent: safe to re-run. Reads $HOME/.env, generates .openclaude/settings.json,
# proves the Cloudflare Workers AI endpoint actually answers, and runs the subset of
# the verify suite that can pass on a phone.
#
# WHY A SUBSET: this repo's full `npm run verify` includes a Postgres store suite and
# a GPU parity pass. Neither can succeed on stock Android — there is no database and
# no WebGPU adapter — and the governance rules correctly refuse to count an
# unreachable dependency as a pass. Running the full suite here would fail for
# environmental reasons and teach you to ignore a red build, which is worse than
# not running it. `npm run verify:termux` runs exactly what is provable on-device.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$HOME/.env}"
TEMPLATE="$REPO_ROOT/.openclaude/settings.template.json"
SETTINGS="$REPO_ROOT/.openclaude/settings.json"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Environment
# ---------------------------------------------------------------------------
say "Reading $ENV_FILE"
[ -f "$ENV_FILE" ] || die "no $ENV_FILE. Copy .env.example there and fill it in:
    cp '$REPO_ROOT/.env.example' '$ENV_FILE' && chmod 600 '$ENV_FILE'"

# `set -a` exports everything the file defines, so child processes inherit it.
# Sourcing rather than parsing means the file follows normal shell quoting rules.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${CLOUDFLARE_ACCOUNT_ID:?not set in $ENV_FILE}"
: "${CLOUDFLARE_API_TOKEN:?not set in $ENV_FILE}"
MODEL="${OPENCLAUDE_MODEL:-@cf/google/gemma-4-26b-a4b-it}"

# A world-readable file holding an API token is a real exposure on a shared device.
PERMS="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo '')"
case "$PERMS" in
  600|400) ;;
  '') warn "could not stat $ENV_FILE permissions" ;;
  *) warn "$ENV_FILE is mode $PERMS — it holds an API token. Tightening to 600."
     chmod 600 "$ENV_FILE" ;;
esac

# ---------------------------------------------------------------------------
# 2. Toolchain
# ---------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "node not found. In Termux: pkg install nodejs-lts"
command -v git  >/dev/null 2>&1 || die "git not found.  In Termux: pkg install git"
command -v curl >/dev/null 2>&1 || die "curl not found. In Termux: pkg install curl"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
say "node $(node -v)"
# package.json declares engines.node >=22.5.0 because core/store/sqlite.ts uses the
# built-in node:sqlite module, which does not exist before 22.5.
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  warn "node >=22.5.0 is required for node:sqlite (core/store). The engine suite will
       still run; verify:store will not. Upgrade with: pkg install nodejs-lts"
fi

# ---------------------------------------------------------------------------
# 3. Generate .openclaude/settings.json from the template
# ---------------------------------------------------------------------------
say "Generating .openclaude/settings.json"
[ -f "$TEMPLATE" ] || die "missing $TEMPLATE"

# Substitution is done in node rather than sed: an API token can contain characters
# that are metacharacters to sed (& and / especially), which would corrupt the value
# silently. JSON.parse/stringify also guarantees the output is valid JSON.
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
OPENCLAUDE_MODEL="$MODEL" \
TEMPLATE_PATH="$TEMPLATE" \
SETTINGS_PATH="$SETTINGS" \
node <<'NODE'
const fs = require('node:fs');
const template = JSON.parse(fs.readFileSync(process.env.TEMPLATE_PATH, 'utf8'));
delete template.$comment;

const entry = template.agentModels['cf-gemma4'];
entry.base_url = entry.base_url.replace('__CLOUDFLARE_ACCOUNT_ID__', process.env.CLOUDFLARE_ACCOUNT_ID);
entry.api_key = process.env.CLOUDFLARE_API_TOKEN;
entry.model = process.env.OPENCLAUDE_MODEL;

fs.writeFileSync(process.env.SETTINGS_PATH, JSON.stringify(template, null, 2) + '\n', { mode: 0o600 });
console.log(`    base_url ${entry.base_url}`);
console.log(`    model    ${entry.model}`);
console.log(`    api_key  <${process.env.CLOUDFLARE_API_TOKEN.length} chars, not printed>`);
NODE
chmod 600 "$SETTINGS"

# Some OpenClaude builds read ~/.claude/settings.json rather than the repo-local path.
#
# This script deliberately does NOT create that link itself. ~/.claude/settings.json is
# also Anthropic's Claude Code config: silently pointing it at this repo would hijack a
# real Claude Code install on the same machine, with a Cloudflare token in place of its
# settings, and the user would have no idea why their other tool started misbehaving.
# An automated setup script may not quietly repurpose another program's config file.
#
# So: detect, explain, let the operator decide.
if [ -e "$HOME/.claude/settings.json" ]; then
  say "Note: ~/.claude/settings.json already exists — left untouched."
  say "      If your OpenClaude build reads that path, merge the agentModels and"
  say "      agentRouting blocks from $SETTINGS into it by hand."
else
  say "Note: if your OpenClaude build reads ~/.claude/settings.json rather than the"
  say "      repo-local path, link it yourself:"
  say "        mkdir -p ~/.claude && ln -s '$SETTINGS' ~/.claude/settings.json"
  say "      Do NOT do this on a machine that also runs Anthropic's Claude Code — the"
  say "      two tools share that filename."
fi

# ---------------------------------------------------------------------------
# 4. Prove the endpoint answers
# ---------------------------------------------------------------------------
say "Smoke-testing Cloudflare Workers AI"
BASE_URL="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

HTTP_CODE="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  --max-time 90 \
  --request POST "$BASE_URL/chat/completions" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data "$(MODEL="$MODEL" node -e '
    process.stdout.write(JSON.stringify({
      model: process.env.MODEL,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      max_tokens: 16,
    }));
  ')" || echo 000)"

case "$HTTP_CODE" in
  200)
    REPLY="$(node -e '
      const fs = require("node:fs");
      try {
        const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        process.stdout.write((body.choices?.[0]?.message?.content ?? "(no content field)").trim());
      } catch { process.stdout.write("(unparseable body)"); }
    ' "$RESPONSE_FILE")"
    say "Model responded: ${REPLY:0:80}"
    ;;
  401|403)
    die "HTTP $HTTP_CODE — the token was rejected. Check CLOUDFLARE_API_TOKEN has the
     Workers AI permission, and that CLOUDFLARE_ACCOUNT_ID matches the account that
     issued it. A token valid for a different account returns exactly this."
    ;;
  404)
    die "HTTP 404 — endpoint or model not found. Either CLOUDFLARE_ACCOUNT_ID is wrong,
     or '$MODEL' is not in the Workers AI catalog. Check:
     https://developers.cloudflare.com/workers-ai/models/"
    ;;
  000)
    die "no response — the request timed out or DNS failed. Check connectivity; Termux
     needs no proxy config for this endpoint."
    ;;
  *)
    warn "HTTP $HTTP_CODE from Workers AI. Body follows:"
    head -c 600 "$RESPONSE_FILE" >&2; echo >&2
    die "endpoint did not return 200 — fix this before running the agent"
    ;;
esac

# ---------------------------------------------------------------------------
# 5. Dependencies and on-device verification
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
say "Installing dependencies"
npm install --no-audit --no-fund

say "Running the on-device verify subset"
npm run verify:termux

say "Setup complete. Start the agent from $REPO_ROOT with: openclaude"
