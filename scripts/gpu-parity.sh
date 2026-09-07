#!/usr/bin/env bash
# scripts/gpu-parity.sh — execute the WGSL kernel and prove it matches the reference.
#
# Runs anywhere with a Vulkan device, real or software. On a machine with no GPU it
# installs Mesa lavapipe (a CPU Vulkan implementation) and uses that, so the shader
# is genuinely executed rather than skipped. Verified working on lavapipe: 600 ticks
# x 1024 entities, bit-identical, chained digest 0x77f11d60.
#
# NOT FOR ANDROID. Termux has no Vulkan loader Deno can bind to and no lavapipe
# package. On the phone this exits with an explanation rather than a confusing
# adapter error — push instead, and let .github/workflows/gpu-parity.yml run it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

if [ -n "${TERMUX_VERSION:-}" ] || [ -d /data/data/com.termux ]; then
  die "Android/Termux has no WebGPU adapter, so this cannot run here.
     Push your branch instead — .github/workflows/gpu-parity.yml executes the
     shader on GitHub's free runners using software Vulkan, and reports back.
     On-device, 'npm run verify:termux' proves everything that is provable."
fi

# --- A Vulkan device, real or software -------------------------------------
if ! command -v vulkaninfo >/dev/null 2>&1 || ! vulkaninfo --summary >/dev/null 2>&1; then
  say "No Vulkan device found — installing Mesa lavapipe (software Vulkan)"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq mesa-vulkan-drivers vulkan-tools
  else
    die "no apt-get. Install a Vulkan ICD yourself: Mesa lavapipe on Linux, or use
     real GPU drivers. Then re-run."
  fi
fi

say "Vulkan device:"
vulkaninfo --summary 2>/dev/null | grep -E 'deviceName|driverName' | sed 's/^/    /'

# --- Deno provides WebGPU natively; Node would need a separate Dawn binding --
if ! command -v deno >/dev/null 2>&1; then
  say "Installing Deno"
  curl -fsSL https://deno.land/install.sh | sh -s -- -y
  export PATH="$HOME/.deno/bin:$PATH"
fi
command -v deno >/dev/null 2>&1 || die "deno still not on PATH — add \$HOME/.deno/bin"

say "deno $(deno --version | head -1)"

# --- Execute -----------------------------------------------------------------
# --require-gpu makes a missing adapter fatal. Without it a machine with no device
# would print a skip and exit 0, which is exactly the false green this script exists
# to prevent.
say "Executing the WGSL kernel against the reference executor"
deno run --allow-all --unstable-sloppy-imports engine/verify/verify-parity.ts --require-gpu

say "GPU parity proven."
