#!/usr/bin/env bash
# Builds the enterprise IIS deployment package on Linux (or WSL/macOS) as three
# separate parts, so the Windows server gets build output only - no source, no npm,
# no .NET SDK, no internet needed there:
#   1-frontend/site        vite build of my-app-pt1 for $APP_PATH (+ web.config)
#   2-backend/WebSideAPI   WebSideAPI code + production node_modules (all pure JS)
#   3-adauth/app           dotnet publish of ADAuthAPI (framework-dependent, any OS)
# Output: deploy/out/WebExcel-enterprise.zip (extract on the server, run Install-All.ps1).
#
#   APP_PATH=/WebExcelApp    IIS application path of the frontend (baked into the build)
#   AUTH_PATH=/WebExcelAuth  IIS application path of ADAuthAPI (baked into the build)
set -euo pipefail

APP_PATH="${APP_PATH:-/WebExcelApp}"
AUTH_PATH="${AUTH_PATH:-/WebExcelAuth}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$REPO/deploy/out"
STAGE="$OUT/WebExcel-enterprise"
ZIP="$OUT/WebExcel-enterprise.zip"

for tool in node npm dotnet zip rsync; do
  command -v "$tool" >/dev/null || { echo "❌ $tool not found"; exit 1; }
done
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
rsync -a "$REPO/deploy/iis/package/" "$STAGE/"
cp "$REPO/deploy/iis/README.md" "$STAGE/README.md"

echo "🔨 1/3 frontend for $APP_PATH (AD auth at $AUTH_PATH)"
cd "$REPO/my-app-pt1"
[[ -d node_modules ]] || npm ci --no-audit --no-fund
# vite build, not `npm run build`: its `tsc -b` step fails on type errors in unrouted legacy pages
VITE_AD_AUTH_PATH="$AUTH_PATH" npx vite build --base="$APP_PATH/" --outDir "$STAGE/1-frontend/site" --emptyOutDir --logLevel warn
sed "s#__APP_PATH__#$APP_PATH#g" "$STAGE/1-frontend/web.config" > "$STAGE/1-frontend/site/web.config"
rm "$STAGE/1-frontend/web.config"

echo "🔨 2/3 backend"
API="$STAGE/2-backend/WebSideAPI"
rsync -a --exclude node_modules --exclude sqlite-dbs --exclude uploads --exclude excel-pool-meta.json \
  --exclude indexV1.js "$REPO/WebSideAPI/" "$API/"
cd "$API"
# Declared in package.json but never require()d by index.js: odbc is the only native
# module (it wouldn't load on Windows), @syncfusion/* alone is ~390 MB. Dropped from
# the staged copy only. Everything left is plain JavaScript, so node_modules installed
# here runs unchanged on Windows.
UNUSED=(@syncfusion/ej2-excel-export @syncfusion/ej2-file-utils @syncfusion/ej2-spreadsheet
        odbc bcryptjs xlsx-js-style y-websocket)
node -e '
  const fs = require("fs"), p = JSON.parse(fs.readFileSync("package.json"));
  for (const d of process.argv.slice(1)) delete p.dependencies[d];
  fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");' "${UNUSED[@]}"
npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
native="$(find node_modules -name '*.node' -o -name binding.gyp | head -5)"
[[ -z "$native" ]] || { echo "❌ native modules would not run on Windows:"; echo "$native"; exit 1; }

echo "🔨 3/3 ADAuthAPI"
dotnet publish "$REPO/ADAuthAPI/ADAuthAPI.csproj" -c Release -o "$STAGE/3-adauth/app" --nologo -v quiet -p:UseAppHost=false
rm -f "$STAGE/3-adauth/app/appsettings.Development.json"

# Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI; add a BOM so any
# non-ASCII text survives, and use CRLF line endings
find "$STAGE" -name '*.ps1' -print0 | while IFS= read -r -d '' f; do
  { printf '\xEF\xBB\xBF'; sed 's/\r$//; s/$/\r/' "$f"; } > "$f.tmp" && mv "$f.tmp" "$f"
done

cd "$OUT"
zip -qr "$ZIP" "$(basename "$STAGE")"
echo "✅ $ZIP ($(du -h "$ZIP" | cut -f1))"
