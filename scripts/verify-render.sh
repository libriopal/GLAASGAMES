#!/usr/bin/env bash
# scripts/verify-render.sh — run the WGSL renderer check for real, or say so.
#
# THE PROBLEM THIS SOLVES. `verify-render` needs a WebGPU adapter. Node has
# none, so under `npm run verify:engine` it printed "verify-render: SKIPPED" and
# exited 0 — a line that sat in a column of PASSes and read like one. The
# renderer that draws the world went unproven inside a green suite.
#
# A skip is a decision. This script makes it an explicit one: it runs the check
# under Deno with a Vulkan device (Mesa lavapipe counts — it is a real
# implementation, just on the CPU), and if it cannot, it FAILS unless the caller
# states that skipping is acceptable by setting RENDER_SKIP_OK=1.
#
# Note the shipped APK does not use this shader at all: no .wgsl is staged, and
# build-app-assets deletes the WebGPU entry point. `verify-gl2` covers the
# renderer that actually reaches a phone.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DENO="$(command -v deno || true)"
if [ -z "$DENO" ]; then
  for candidate in "$HOME/.deno/bin/deno" /usr/local/bin/deno; do
    [ -x "$candidate" ] && DENO="$candidate" && break
  done
fi

if [ -z "$DENO" ]; then
  if [ "${RENDER_SKIP_OK:-0}" = "1" ]; then
    echo "verify-render: NOT RUN — no Deno on PATH, and RENDER_SKIP_OK=1 was set."
    echo "               The WGSL renderer is UNPROVEN in this run. This is not a pass."
    exit 0
  fi
  echo "verify-render: FAIL — no Deno on PATH, so the renderer could not be executed." >&2
  echo "               Install Deno, or set RENDER_SKIP_OK=1 to accept an unproven renderer." >&2
  exit 1
fi

# Prefer a real GPU; fall back to lavapipe, which is a genuine Vulkan
# implementation running on the CPU rather than a stub.
if [ -z "${VK_ICD_FILENAMES:-}" ] && [ -f /usr/share/vulkan/icd.d/lvp_icd.json ]; then
  export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
fi

"$DENO" run --allow-all --unstable-webgpu engine/verify/verify-render.ts
status=$?

# verify-render exits 0 when it skips internally, so a skip would still look
# green here. Catch that and refuse it for the same reason as above.
if [ $status -eq 0 ]; then
  if "$DENO" run --allow-all --unstable-webgpu engine/verify/verify-render.ts 2>&1 | grep -q "SKIPPED"; then
    if [ "${RENDER_SKIP_OK:-0}" = "1" ]; then
      echo "verify-render: NOT RUN — no WebGPU adapter, accepted via RENDER_SKIP_OK=1. Not a pass."
      exit 0
    fi
    echo "verify-render: FAIL — Deno found no WebGPU adapter, so the check skipped itself." >&2
    echo "               Provide a Vulkan device, or set RENDER_SKIP_OK=1." >&2
    exit 1
  fi
fi
exit $status
