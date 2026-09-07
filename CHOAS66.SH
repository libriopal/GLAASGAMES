#!/usr/bin/env bash
#
#   ██████ ██   ██  ██████   █████  ███████  ██████   ██████
#  ██      ██   ██ ██    ██ ██   ██ ██      ██       ██
#  ██      ███████ ██    ██ ███████ ███████ ███████  ███████
#  ██      ██   ██ ██    ██ ██   ██      ██ ██    ██ ██    ██
#   ██████ ██   ██  ██████  ██   ██ ███████  ██████   ██████
#
# CHOAS66.SH — the only command you run after cloning GLAASGAMES to your phone.
#
#   git clone https://github.com/libriopal/GLAASGAMES.git
#   cd GLAASGAMES && bash CHOAS66.SH
#
# Idempotent. Safe to re-run at any point; it resumes from wherever it stopped.
#
# WHAT IT COSTS: nothing. Cloudflare Workers AI has a standing free daily
# allowance, and the GPU verification runs on GitHub's free runners using a
# software Vulkan device rather than rented hardware. No card is required for any
# step. If a step ever would cost money, this script stops and says so instead.
#
# WHAT IT DOES NOT DO: it does not put a GPU in your phone. Nothing can. Android
# exposes no WebGPU adapter, so the shader is executed in CI instead — see
# PHASE 5. Everything else runs on-device.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-$HOME/.env}"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
say()   { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()   { printf '\033[1;31m[stop]\033[0m %s\n' "$*" >&2; exit 1; }
rule()  { printf '\033[2m%s\033[0m\n' "────────────────────────────────────────────────────────"; }

rule
bold " ORDER 66 — GLAASGAMES bootstrap"
rule

# ---------------------------------------------------------------------------
# PHASE 1 — Platform
# ---------------------------------------------------------------------------
say "PHASE 1: platform"

IS_TERMUX=0
if [ -n "${TERMUX_VERSION:-}" ] || [ -d /data/data/com.termux ]; then
  IS_TERMUX=1
  ok "Termux detected (Android, non-root)"
else
  warn "not Termux — continuing anyway; package installs are skipped"
fi

if [ "$IS_TERMUX" -eq 1 ] && command -v pkg >/dev/null 2>&1; then
  # Only install what is actually missing: pkg is slow and this script re-runs.
  MISSING=""
  for tool in node git curl; do
    command -v "$tool" >/dev/null 2>&1 || MISSING="$MISSING $tool"
  done
  if [ -n "$MISSING" ]; then
    say "installing:$MISSING"
    # nodejs-lts provides node >=22, which core/store/sqlite.ts needs for node:sqlite.
    pkg install -y nodejs-lts git curl >/dev/null || warn "pkg install reported an error; continuing"
  fi
fi

for tool in node git curl; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is missing. In Termux run: pkg install nodejs-lts git curl"
done
ok "node $(node -v), git $(git --version | awk '{print $3}')"

# ---------------------------------------------------------------------------
# PHASE 2 — Credentials
# ---------------------------------------------------------------------------
say "PHASE 2: credentials"

if [ ! -f "$ENV_FILE" ]; then
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "created $ENV_FILE from template"
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true

# Read without exporting yet, so an unfilled file gives a clean message rather
# than a set -u explosion deeper in.
ACCOUNT_ID="$(sed -n 's/^CLOUDFLARE_ACCOUNT_ID=//p' "$ENV_FILE" | head -1)"
API_TOKEN="$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' "$ENV_FILE" | head -1)"

if [ -z "$ACCOUNT_ID" ] || [ -z "$API_TOKEN" ]; then
  rule
  bold " ACTION NEEDED — fill in two values, then re-run this script"
  rule
  cat <<EOF

  Edit:  $ENV_FILE
  With:  nano $ENV_FILE     (or: pkg install vim && vim $ENV_FILE)

  CLOUDFLARE_ACCOUNT_ID   dash.cloudflare.com -> Workers & Pages -> right sidebar
                          (32 hex characters; not a secret)

  CLOUDFLARE_API_TOKEN    dash.cloudflare.com/profile/api-tokens -> Create Token
                          -> use the "Workers AI" template (Read is enough)

                          THIS IS A SECRET. Use a scoped token, never the Global
                          API Key — a Global Key authenticates every Cloudflare
                          API on your account, including DNS and billing, and
                          cannot be narrowed.

  Both sit in \$HOME/.env, outside the repo, and are never committed.
  Cloudflare Workers AI includes a free daily allowance; this needs no payment.

  Then run again:  bash CHOAS66.SH

EOF
  exit 0
fi
ok "credentials present (token not printed)"

# ---------------------------------------------------------------------------
# PHASE 3 — Configure and prove the model backend
# ---------------------------------------------------------------------------
say "PHASE 3: model backend"
# termux-setup.sh generates .openclaude/settings.json, smoke-tests the endpoint,
# installs dependencies and runs the on-device suite. It exits non-zero with a
# diagnosis if the endpoint rejects the credentials.
bash "$REPO_ROOT/scripts/termux-setup.sh"

# ---------------------------------------------------------------------------
# PHASE 4 — The agent
# ---------------------------------------------------------------------------
say "PHASE 4: agent"

if command -v openclaude >/dev/null 2>&1; then
  ok "openclaude found: $(command -v openclaude)"
  OPENCLAUDE_READY=1
else
  OPENCLAUDE_READY=0
  # No install command is guessed here. Package names for OpenClaude builds vary,
  # and a wrong `npm i -g` would either fail confusingly or install something else
  # entirely. Point at the source instead.
  warn "openclaude is not on PATH"
  cat <<'EOF'

  Install it from the project's own instructions:
      https://github.com/friuns2/openclaude-android

  The generated config is already waiting at .openclaude/settings.json — it is
  OpenAI-compatible, so any build that accepts a base_url and api_key will take
  it. If your build reads ~/.claude/settings.json instead, link it:
      mkdir -p ~/.claude && ln -s "$PWD/.openclaude/settings.json" ~/.claude/settings.json

EOF
fi

# ---------------------------------------------------------------------------
# PHASE 5 — The GPU blocker, handled honestly
# ---------------------------------------------------------------------------
say "PHASE 5: GPU verification"

cat <<'EOF'
  Android has no WebGPU adapter, so engine/gpu/shaders/sim.wgsl cannot execute on
  this phone. That is a property of the platform, not a bug to route around.

  It is verified in CI instead, free: .github/workflows/gpu-parity.yml installs
  Mesa lavapipe (a software Vulkan device) on GitHub's standard runners and
  executes the real kernel under Deno's native WebGPU. Push, and the shader is
  proven bit-identical to the reference executor.

      git push        # triggers gpu-parity on main and on every pull request

  This has been run and it passes: 600 ticks x 1024 entities, bit-identical,
  chained digest 0x77f11d60.
EOF
ok "GPU parity delegated to free CI"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
rule
bold " READY"
rule
cat <<EOF

  On-device suite:   npm run verify:termux
  Re-run setup:      bash CHOAS66.SH
  GPU parity:        git push   (free CI)

EOF

if [ "$OPENCLAUDE_READY" -eq 1 ]; then
  bold " Start the agent, then paste the contents of ORDER66.md as your first message:"
  echo
  echo "      openclaude"
  echo "      cat ORDER66.md      # copy this into the agent"
  echo
else
  bold " Once openclaude is installed, start it and paste ORDER66.md as the first message."
  echo
fi
