#!/usr/bin/env bash
# setup-env.sh — GLASSBOX v6 Phase 2 environment setup (admin/user DB split)
#
# Interactive. Asks for each key, hides what you type, writes a locked-down .env,
# and makes sure git can never commit it. Safe to re-run: existing values are kept
# unless you type a new one.
#
# Persistence is split across two physically separate Supabase projects
# (Tier 1 direct instruction, 2026-08-01): "admin" holds accounts, organisms,
# harvest_runs, gate_results, audit_log, converged_seeds — the secrets/security
# side. "user" holds sessions, session_events, telemetry_events,
# contested_states, rater_judgments — the side playtester/rater traffic
# actually reaches. See core/store/migrations/0001_init.postgres.admin.sql
# for the full rationale.
#
#   chmod +x setup-env.sh && ./setup-env.sh

set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'

say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# Keys, in prompt order. Parallel arrays — macOS ships bash 3.2, no associative arrays.
NAMES=(
  DATABASE_URL_ADMIN
  SUPABASE_URL_ADMIN
  SUPABASE_ANON_KEY_ADMIN
  SUPABASE_SERVICE_ROLE_KEY_ADMIN
  DATABASE_URL_USER
  SUPABASE_URL_USER
  SUPABASE_ANON_KEY_USER
  SUPABASE_SERVICE_ROLE_KEY_USER
  GROQ_API_KEY
  GEMINI_API_KEY
  COHERE_API_KEY
  ANTHROPIC_API_KEY
)
DESCS=(
  "ADMIN DB Postgres connection string — Glassbox_Labs/admin project > Settings > Database > Connection string (URI)"
  "ADMIN DB project URL — Glassbox_Labs/admin project > Settings > API"
  "ADMIN DB anon/publishable key — Settings > API. Public by design, safe in the client — but nothing client-side should ever call the admin project directly."
  "ADMIN DB SERVICE ROLE key — Settings > API. SERVER ONLY. Bypasses RLS and every access rule."
  "USER DB Postgres connection string — Glassbox_Labs/user project > Settings > Database > Connection string (URI)"
  "USER DB project URL — Glassbox_Labs/user project > Settings > API"
  "USER DB anon/publishable key — Settings > API. Public by design, safe in the client."
  "USER DB SERVICE ROLE key — Settings > API. SERVER ONLY. Bypasses RLS and every access rule."
  "Groq API key — 'format' tier"
  "Gemini API key — 'repair' tier"
  "Cohere API key — 'mutate' tier (the breeder's rewrite operator)"
  "Anthropic API key — 'strategy' tier"
)
# 1 = needed from P1 (week 1) · 0 = needed at P9 only (week 5), blank is fine now
REQUIRED=(1 1 1 1 1 1 1 1 0 0 0 0)

say ""
say "${BOLD}GLASSBOX v6 — environment setup (admin/user DB split)${RESET}"
say "${DIM}Nothing you type is displayed. Press Enter to skip a key or keep its current value.${RESET}"
say ""

# ── 1. Repo sanity ───────────────────────────────────────────────────────────
[ -d .git ] || die "No .git here. Run this from the root of the Glassbox_Labs repo."

# ── 2. gitignore BEFORE the file exists ──────────────────────────────────────
touch .gitignore
for rule in '.env' '.env.*' '!.env.example'; do
  grep -qxF "$rule" .gitignore || printf '%s\n' "$rule" >> .gitignore
done
if ! git check-ignore -q .env 2>/dev/null; then
  die ".gitignore is not ignoring .env — refusing to write a secret git could commit."
fi
ok ".env is gitignored"

# ── 3. Load existing values so a re-run is non-destructive ───────────────────
if [ -f .env ]; then
  set -a; . ./.env; set +a
  ok "Existing .env loaded — press Enter at any prompt to keep the current value"
fi
say ""

# ── 4. Prompt ────────────────────────────────────────────────────────────────
i=0
while [ $i -lt ${#NAMES[@]} ]; do
  name="${NAMES[$i]}"; desc="${DESCS[$i]}"; req="${REQUIRED[$i]}"
  current="${!name:-}"

  if [ $i -eq 4 ]; then
    say ""
    say "${BOLD}USER database — playtester/rater-facing.${RESET}"
    say ""
  fi
  if [ $i -eq 8 ]; then
    say ""
    say "${BOLD}LLM keys — needed at P9 only (about week 5).${RESET}"
    say "${DIM}Leave all four blank for now if you like; nothing in P1–P8 makes a model call.${RESET}"
    say ""
  fi

  if [ "$req" = "1" ]; then label="${BOLD}$name${RESET} ${DIM}(needed now)${RESET}";
  else label="${BOLD}$name${RESET} ${DIM}(P9)${RESET}"; fi

  say "$label"
  say "  ${DIM}$desc${RESET}"
  if [ -n "$current" ]; then say "  ${GREEN}currently set${RESET} — Enter keeps it"; fi

  printf '  > '
  IFS= read -rs value || true
  say ""

  # Trim whitespace/newlines — pasted keys routinely carry trailing space and
  # cause auth failures that look like nothing at all.
  value="$(printf '%s' "$value" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

  if [ -n "$value" ]; then
    eval "$name=\$value"
    ok "$name set"
  elif [ -n "$current" ]; then
    ok "$name unchanged"
  elif [ "$req" = "1" ]; then
    warn "$name left blank — P1 will fail at runtime until you set it"
  else
    say "  ${DIM}skipped${RESET}"
  fi
  say ""
  i=$((i+1))
done

# ── 5. Write .env ────────────────────────────────────────────────────────────
umask 077
{
  echo "# GLASSBOX v6 Phase 2 — generated by setup-env.sh"
  echo "# NEVER commit this file. Re-run ./setup-env.sh to change values."
  echo ""
  echo "# --- Persistence: ADMIN database (P1 onward) ---"
  echo "# accounts, organisms, harvest_runs, gate_results, audit_log, converged_seeds"
  for k in DATABASE_URL_ADMIN SUPABASE_URL_ADMIN SUPABASE_ANON_KEY_ADMIN SUPABASE_SERVICE_ROLE_KEY_ADMIN; do
    printf '%s=%s\n' "$k" "${!k:-}"
  done
  echo ""
  echo "# --- Persistence: USER database (P1 onward) ---"
  echo "# sessions, session_events, telemetry_events, contested_states, rater_judgments"
  for k in DATABASE_URL_USER SUPABASE_URL_USER SUPABASE_ANON_KEY_USER SUPABASE_SERVICE_ROLE_KEY_USER; do
    printf '%s=%s\n' "$k" "${!k:-}"
  done
  echo ""
  echo "# --- LLM (P9 only) ---"
  for k in GROQ_API_KEY GEMINI_API_KEY COHERE_API_KEY ANTHROPIC_API_KEY; do
    printf '%s=%s\n' "$k" "${!k:-}"
  done
} > .env
chmod 600 .env
ok "Wrote .env (permissions 600 — only you can read it)"

sed 's/=.*/=/' .env > .env.example
ok "Wrote .env.example (safe to commit)"

# ── 6. Report, without printing a single secret ──────────────────────────────
say ""
say "${BOLD}Status${RESET}"
i=0
while [ $i -lt ${#NAMES[@]} ]; do
  k="${NAMES[$i]}"
  if [ -n "${!k:-}" ]; then state="${GREEN}SET${RESET}"; else
    if [ "${REQUIRED[$i]}" = "1" ]; then state="${RED}MISSING${RESET}"; else state="${DIM}not set (fine until P9)${RESET}"; fi
  fi
  printf '  %-32s %b\n' "$k" "$state"
  i=$((i+1))
done

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  say ""
  die ".env is TRACKED BY GIT. Run: git rm --cached .env && git commit -m 'remove env'"
fi

say ""
say "${BOLD}Next:${RESET} ./start-claude.sh"
say "${DIM}(loads these into the shell, then launches Claude Code)${RESET}"
say ""
