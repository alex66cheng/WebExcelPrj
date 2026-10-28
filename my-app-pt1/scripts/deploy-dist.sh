#!/usr/bin/env bash
# Build the frontend locally and upload only dist/ (~8 MB) to the cloud server,
# instead of shipping the source + node_modules (~700 MB).
#
# The server's pm2 "frontend" app serves dist/ with serve-dist.mjs (see
# ecosystem.config.js), so only dist/ and serve-dist.mjs have to exist there.
#
# Usage (from anywhere):   my-app-pt1/scripts/deploy-dist.sh
#   DEPLOY_HOST=user@host  ssh target        (default alex@www.mygwsite.com)
#   DEPLOY_DIR=path        project dir on it (default WebExcelPrj, relative to ~)
#   SKIP_BUILD=1           upload the existing dist/ without rebuilding
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-alex@www.mygwsite.com}"
DEPLOY_DIR="${DEPLOY_DIR:-WebExcelPrj}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "🔨 Building..."
  npm run build
fi
[[ -f dist/index.html ]] || { echo "❌ dist/index.html not found"; exit 1; }

REMOTE="$DEPLOY_DIR/my-app-pt1"
echo "📤 Uploading dist/ to $DEPLOY_HOST:$REMOTE ..."
ssh "$DEPLOY_HOST" "mkdir -p '$REMOTE/dist.new'"
# Upload to dist.new then swap, so a restart mid-upload never sees a half-copied dist/.
rsync -az --delete --info=stats1 dist/ "$DEPLOY_HOST:$REMOTE/dist.new/"
rsync -az serve-dist.mjs "$DEPLOY_HOST:$REMOTE/serve-dist.mjs"
ssh "$DEPLOY_HOST" "cd '$REMOTE' && rm -rf dist.old && { [ -d dist ] && mv dist dist.old || true; } && mv dist.new dist && rm -rf dist.old && pm2 restart frontend --update-env"

echo "✅ Deployed. index.html is served no-cache, so browsers pick up the new build on next load."
