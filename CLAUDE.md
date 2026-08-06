# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is not a single app — it's two independently-run projects that talk to each other over HTTP/WebSocket on `localhost`. There is no root package.json, no workspace tooling, and no git repo initialized at the root.

- `my-app-pt1/` — React 19 + TypeScript + Vite frontend (the "Web" in WebExcelPrj).
- `WebSideAPI/` — Express backend (the "API"), talking to MSSQL, MongoDB, and a WebSocket server, on port 3000.

Both must be running simultaneously for the app to function: the frontend hardcodes `http://localhost:3000` / `ws://localhost:3000` as the API base everywhere (no env vars, no `.env` files, no `import.meta.env` usage anywhere in the codebase — API URLs and DB credentials are literal strings in source).

## Commands

Frontend (`my-app-pt1/`):
```
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # preview production build
```
No test runner is configured for the frontend.

Backend (`WebSideAPI/`):
```
node index.js     # starts the API + WebSocket server on port 3000
```
`npm test` is a stub (`no test specified`) — there is no test suite in either project.

## Backend architecture (`WebSideAPI/index.js`)

Single-file Express app (~1300 lines) that is the current, live server. Key things to know before editing it:

- **`indexV1.js` in the same directory is an older, superseded version** (serves the Vite `dist` build statically, uses `xlsx-js-style` + Mongoose `Customer` model instead of raw `mongoose`/`mssql` calls). It is not run by anything — treat it as historical reference only, don't assume it's wired up.
- **Two separate databases, both hardcoded, no connection string config file:**
  - MSSQL (`mssql` package) — used for structured template configs (`xlsx2dbsetL1/L2/L3` tables) and for writing imported Excel data into arbitrary target tables the user names at runtime.
  - MongoDB (`mongodb` native driver, not the `mongoose`/`Customer` model — that model lives in `models/Customer.js` but is only used by the retired `indexV1.js`) — database `excel_import_system`, collection `templates` stores the visual mapping-setup configs (see `setting.json` for the shape of one).
- **Dynamic MSSQL connection pooling**: `getPool(customConfig)` builds a cache key from `host_user_database` and keeps a `Map` of live `sql.ConnectionPool` instances, because the frontend lets a user point at a *different* SQL Server host/user/password per request (see `/api/spreadsheet/test-connection`, `/api/spreadsheet/check-table`, `/api/spreadsheet/get-table-columns`). Don't assume a single global pool — always go through `getPool()`.
- **Excel <-> DB unpivot/transpose engine**: several routes (`/api/spreadsheet/save-excel-to-mssql-by-template`, `/api/spreadsheet/execute-import`) implement the same general algorithm: read a "fixed dimension" set of columns (`rowHeaders`) plus a horizontal "timeline" block of columns (`timeline.startColumn`..`endColumn`, holding year/item headers in specific rows), then unpivot each timeline column into its own row before inserting. `letterToColumnIndex()` converts Excel column letters (A, Z, AH, ...) to 1-based indices for this. When editing import logic, changes usually need to be mirrored across the MSSQL-target and MongoDB-target versions of this same route.
- **Real-time collaborative spreadsheet editing** via `yjs` + `y-websocket` + raw `ws`: the HTTP `server` upgrades WebSocket connections only on paths starting with `/excel-room-` (see `server.on('upgrade', ...)`), routed into a shared `WebSocket.Server({ noServer: true })`. Room names are `excel-room-${templateCode}` — one Yjs doc per template, not per open tab.
- **Dead code**: `verifyGoogleToken()` / `oAuth2Client` near the bottom of the file reference an undefined `GOOGLE_CLIENT_ID` and are never called from any route — Google OAuth login is not actually wired up despite `@react-oauth/google` and `google-auth-library` being dependencies.
- Cell values coming back from `exceljs` need `parseCellValue()` to unwrap rich text / formula-result / object-shaped cells before use — this dance is repeated in nearly every route; follow the existing pattern rather than reading `cell.value` directly.

## Frontend architecture (`my-app-pt1/src/`)

- `App.tsx` defines all routes and is the single source of truth for **which pages are actually live**. `src/pages/` contains many historical/experimental variants of the same screen that are *not* routed anywhere — check `App.tsx` before assuming a file in `pages/` is reachable. Known orphaned files (not imported by `App.tsx`): `Dashboard_v2.tsx`, `Dashboard_v3.tsx`, `Dashboard_711.tsx`, `Dashboard_711_2.tsx`, `DashboardY.tsx`, `Home_v1.tsx`, `faquo_v1.tsx`, `ExcelMappingSetup2.tsx`, `ExcelMappingSetup3.tsx`.
- `src/pages/index.js` is **not a React page** — it's a stray/backup copy of an old version of the Express backend that was accidentally left inside the frontend `src/pages` directory. It is not imported by anything in the frontend and is not run by Vite; don't confuse it with the real backend in `WebSideAPI/index.js`.
- `Layout.tsx` renders the persistent sidebar (`Dashboard` / "New Form" / "Forms" / "Setup" sections) with `<Outlet />` for routed pages; `Home` is intentionally rendered *outside* `Layout` (no sidebar on the landing page).
- The spreadsheet UI is built on Syncfusion's `@syncfusion/ej2-react-spreadsheet` (`SpreadsheetComponent`), licensed via `registerLicense()` called once in `App.tsx`. Pages named `likeexcel*` are different iterations of a Syncfusion-spreadsheet-based Excel clone; `likeexcelG.tsx` is the one with live multi-user collaboration wired in (Yjs `WebsocketProvider` connecting to `ws://localhost:3000` + `excel-room-${templateCode}`).
- `ExcelMappingSetup.tsx` is the live "template designer" UI: it builds the same config shape persisted server-side to MongoDB (`templateId`, `mappingFields`, `matrixConfig` with `startColumn`/`endColumn`/axes — see `WebSideAPI/setting.json` for a concrete example) and posted to `/api/spreadsheet/save-template`.
- Tailwind v4 is wired through `@tailwindcss/vite` (not a PostCSS plugin) — see `vite.config.ts`. `tailwind.config.js` still exists for the `safelist` (dynamic `text-[#xxxxxx]` classes) and content globs, but no separate `postcss.config` step is needed for Tailwind itself.
- `recharts` is used for the "New" `Dashboard.tsx`; Syncfusion charts (`@syncfusion/ej2-react-charts`) appear in the orphaned dashboard variants — don't assume both charting libraries are in active use.
