#!/usr/bin/env bash
#
# The visual baselines, in the one place they mean anything.
#
# A screenshot baseline records a machine's text rasterisation as much as the
# application's rendering, so baselines taken on a laptop and checked on a CI runner
# compare two things that were never going to agree. CEE measured that boundary on
# 2026-08-16 and found 7 of 106 baselines differing by 124 to 393 pixels of glyph
# antialiasing against a budget of 120 — every failure marginal, none of them a
# rendering change, and no way to tell those apart from a real one. Its answer is this
# script, and this is the same script: the argument does not change because the
# component does.
#
# So both sides run the same container. Playwright publishes an image per release
# carrying the browsers that release drives and the fonts they rasterise with, and
# `v1.62.1-noble` matches the version `browser/package.json` resolves. Move that pin
# and the baselines move with it, exactly as an OS upgrade used to.
#
# CED's CI already runs on `ubuntu-24.04-arm`, so neither side emulates. A runner
# label resolving to x86_64 would rasterise differently and the baselines would be
# wrong again, quietly.
#
# `node_modules` is a named volume rather than the host's directory: the host's is
# built for darwin-arm64 and its binaries do not run here.
#
# The behaviour suite does not need any of this and should not pay for it — run it
# with `npm run test:browser`. This is only for the pixels.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! docker info >/dev/null 2>&1; then
  echo "The visual baselines run in a container, and the Docker daemon is not up." >&2
  echo "Start Docker and run this again." >&2
  exit 1
fi

if [ ! -f "$REPO/dist-bundle/cedar-embeddable-designer.js" ]; then
  echo "No bundle to photograph: run 'npm run dist' first." >&2
  exit 1
fi

exec docker run --rm --init \
  --platform linux/arm64 \
  --ipc=host \
  -v "$REPO":/repo \
  -v ced-browser-node-modules:/repo/browser/node_modules \
  -w /repo/browser \
  -e CI="${CI:-}" \
  -e CED_VISUAL=1 \
  "$IMAGE" \
  bash -lc 'npm ci --no-audit --no-fund && npx playwright test visual.spec.ts "$@"' -- "$@"
