#!/usr/bin/env bash
# start-claude.sh — load .env into this shell, sanity-check the repo, launch Claude Code.
#
#   chmod +x start-claude.sh && ./start-claude.sh

set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

[ -f .env ] || die "No .env found. Run ./setup-env.sh first."

set -a; . ./.env; set +a
ok "Environment loaded"

for k in DATABASE_URL_ADMIN SUPABASE_URL_ADMIN SUPABASE_ANON_KEY_ADMIN SUPABASE_SERVICE_ROLE_KEY_ADMIN \
         DATABASE_URL_USER SUPABASE_URL_USER SUPABASE_ANON_KEY_USER SUPABASE_SERVICE_ROLE_KEY_USER; do
  [ -n "${!k:-}" ] || warn "$k is empty — P1 will fail at runtime"
done

llm_set=0
for k in GROQ_API_KEY GEMINI_API_KEY COHERE_API_KEY ANTHROPIC_API_KEY; do
  [ -n "${!k:-}" ] && llm_set=$((llm_set+1))
done
printf '%s%s of 4 LLM keys set%s %s(only needed at P9)%s\n' "$DIM" "$llm_set" "$RESET" "$DIM" "$RESET"

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  die ".env is tracked by git. Run: git rm --cached .env && git commit -m 'remove env'"
fi
ok ".env is not tracked by git"

printf '\n%sChecking Phase 1 still passes...%s\n' "$DIM" "$RESET"
if [ -d node_modules ]; then
  if npm run verify >/tmp/glassbox-verify.log 2>&1; then
    ok "npm run verify — exit 0"
  else
    warn "npm run verify FAILED — see /tmp/glassbox-verify.log"
    warn "Tell Claude Code this before it builds anything."
  fi
else
  warn "node_modules missing — run: npm install"
fi

cat <<EOF

${BOLD}Paste this as your first message to Claude Code:${RESET}
${DIM}────────────────────────────────────────────────────────────${RESET}
This repo is libriopal/Glassbox_Labs. Phase 1 (W1-W9) is already built --
run \`npm install && npm run verify\` and confirm it exits 0 at 143 checks.
If it doesn't, stop and tell me before building anything.

Your task is Phase 2. Read design_handoff_glassbox_v6_phase2/
17_PHASE2_HANDOFF_COMPLETE.md top to bottom before writing any code.
It is self-contained: agent contract, authorization, build order P1-P11,
and full specification for every work item.

So you know that I know them:
- You are Tier 2. You may never sign a Tier 1 gate (Immutable Directive 6).
- Halt conditions H1-H10. H10 especially: never synthesise a human
  judgment, for any reason, however clearly labelled.
- Every artifact is complete or not delivered. No elided bodies, no TODOs.
- Elections E1-E11 are recorded in 11_TIER1_ELECTIONS_DECISION_RECORD.md.
  Don't re-litigate them; if one looks wrong, raise it and stop.
- 20_SELF_SERVICE_LAYER.md is binding scope, not a nice-to-have.

Start with P1. Report in the section 15 format when its gate passes,
then stop and wait for me before starting P2.
${DIM}────────────────────────────────────────────────────────────${RESET}

Launching Claude Code...

EOF

exec claude
