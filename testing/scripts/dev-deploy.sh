#!/usr/bin/env bash
# Deterministic dev deploy: build the CURRENT checkout, restart the test
# Grafana, and verify the served bundle is byte-identical to the fresh build.
#
# Why this exists: the plugin is volume-mounted from ../dist, so whatever was
# built LAST is what Grafana serves — switching branches without rebuilding
# silently serves the previous branch's bundle, and testers end up testing
# stale code (this happened during #334 review). This script makes the
# deployed state provable.
#
# Usage: from the repo root or testing/:   bash testing/scripts/dev-deploy.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git rev-parse --short HEAD)
DIRTY=$(git status --porcelain -uno | grep -vc '^$' || true)

echo "==> Building ${BRANCH}@${COMMIT} (${DIRTY} modified tracked files)"
rm -rf dist
npm run build >/dev/null

LOCAL_HASH=$(shasum -a 256 dist/module.js | cut -d' ' -f1)
echo "==> dist/module.js sha256: ${LOCAL_HASH:0:16}…"

echo "==> Restarting test Grafana (plugin asset cache)"
docker restart testing-grafana-1 >/dev/null

for i in $(seq 1 40); do
  curl -sf http://localhost:3102/api/health >/dev/null 2>&1 && break
  sleep 3
done
curl -sf http://localhost:3102/api/health >/dev/null || { echo "!! Grafana did not come up"; exit 1; }

SERVED_HASH=$(curl -sf "http://localhost:3102/public/plugins/tamirsuliman-weathermap-panel/module.js" | shasum -a 256 | cut -d' ' -f1)
if [ "$SERVED_HASH" = "$LOCAL_HASH" ]; then
  echo "==> VERIFIED: Grafana is serving this exact build (${BRANCH}@${COMMIT})"
else
  echo "!! MISMATCH: served bundle differs from the local build"
  echo "   local : $LOCAL_HASH"
  echo "   served: $SERVED_HASH"
  exit 1
fi

echo "==> Test at: http://localhost:3102/d/wm-polyline-links?editPanel=1"
echo "    (hard-refresh the browser: Cmd+Shift+R — the BROWSER cache is yours to bust)"
