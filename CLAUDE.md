# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is not a single app — it's two independently-run projects that talk to each other over HTTP/WebSocket on `localhost`. There is no root package.json, no workspace tooling, and no git repo initialized at the root.

- `my-app-pt1/` — React 19 + TypeScript + Vite frontend (the "Web" in WebExcelPrj).
- `WebSideAPI/` — Express backend (the "API"), talking to MSSQL, MongoDB, local SQLite files, and a WebSocket server, on port 3000.

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
  - MSSQL (`mssql` package) — no longer used by the live `ExcelMappingSetup.tsx` workflow (see SQLite bullet below); the remaining live uses of `getPool()`/`sql.*` are the unrelated forecast-import routes around `save-excel-to-db`/`save-excel-to-dbX` (dead, MSSQL-template-config code) and the orphaned `/api/spreadsheet/get-table-columns` route (only called by the non-routed `ExcelMappingSetup2.tsx`/`ExcelMappingSetup3.tsx`). The old `xlsx2dbsetL1/L2/L3` tables are no longer queried by any live route. `likeexcel.tsx` calls `save-excel-to-mssql-by-template`, a route that doesn't exist in `index.js`.
  - Local SQLite (Node's built-in `node:sqlite`, `DatabaseSync`) — the live target database for `ExcelMappingSetup.tsx`'s "XLSX Template Setup" workflow, replacing the old remote-MSSQL-host/user/password flow. Each logged-in user gets their own `.db` file pool under `WebSideAPI/sqlite-dbs/<safeUserDirName(email)>/*.db` (mirroring the Excel file pool's per-user dirs below — `getUserSqliteDir(email)`), created/listed via `/api/spreadsheet/sqlite/create-db` and `/api/spreadsheet/sqlite/list-dbs` (see `resolveSqliteDbPath(dbFile, email)`, keyed off `req.user.email`), and are what `/api/spreadsheet/check-table`, `/api/table-columns`, and `/api/spreadsheet/execute-import` now read/write (keyed by a `dbFile` filename instead of a host/user/password — one user's `epsidemodb.db` is a different physical file from another user's file of the same name). A template's bound `.db` file is stored as `dbFile` on the MongoDB `Template` doc (see below) — i.e. an Excel mapping template is "bound" to one local SQLite file owned by its creator. `getSqliteDb(dbFile, email)` keeps one long-lived `DatabaseSync` per resolved (user-scoped) file path in a module-level `sqliteDbPool` Map (mirroring the MSSQL `pools`/`getPool()` pattern) instead of opening/closing a connection per request; `closeAllSqliteDbs()` releases them on process exit/SIGINT/SIGTERM.
  - MongoDB — via `mongoose` (not the native `mongodb` driver; not the `Customer` model in `models/Customer.js`, which is only used by the retired `indexV1.js`). The default connection (`excel_cell_logs` DB) holds `FileShare`/`User`/per-template cell-log collections; `mongoose.connection.useDb('excel_import_system')` holds the `templates` collection, which is what `ExcelMappingSetup.tsx` ("XLSX Template Setup") reads/writes via `/api/spreadsheet/get-templates` and `/api/spreadsheet/save-template` — this replaced the old MSSQL-backed template storage. `setting.json` shows an older, now-inaccurate field-naming convention for this; the live shape is whatever `configPayload` in `ExcelMappingSetup.tsx` sends (`templateCode`, `templateName`, `rowHeaders`, `timeline`, `dbFile`, etc.).
- **Dynamic MSSQL connection pooling**: `getPool(customConfig)` builds a cache key from `host_user_database` and keeps a `Map` of live `sql.ConnectionPool` instances, for the remaining MSSQL-backed routes (the forecast-import routes and the dead/orphaned `get-table-columns`). This is unrelated to the SQLite-backed `ExcelMappingSetup.tsx` workflow, which never calls `getPool()`. Don't assume a single global pool — always go through `getPool()` for whatever still uses MSSQL.
- **Excel <-> DB unpivot/transpose engine**: `/api/spreadsheet/execute-import` (SQLite-backed) and the dead `save-excel-to-mssql-by-template` implement the same general algorithm: read a "fixed dimension" set of columns (`rowHeaders`) plus a horizontal "timeline" block of columns (`timeline.startColumn`..`endColumn`, holding year/item headers in specific rows), then unpivot each timeline column into its own row before inserting. `letterToColumnIndex()` converts Excel column letters (A, Z, AH, ...) to 1-based indices for this.
- **Real-time collaborative spreadsheet editing** via `yjs` + `y-websocket` + raw `ws`: the HTTP `server` upgrades WebSocket connections only on paths starting with `/excel-room-` (see `server.on('upgrade', ...)`), routed into a shared `WebSocket.Server({ noServer: true })`. Room names are `excel-room-${templateCode}` — one Yjs doc per template, not per open tab.
- **Dead code**: `verifyGoogleToken()` / `oAuth2Client` near the bottom of the file reference an undefined `GOOGLE_CLIENT_ID` and are never called from any route — Google OAuth login is not actually wired up despite `@react-oauth/google` and `google-auth-library` being dependencies.
- Cell values coming back from `exceljs` need `parseCellValue()` to unwrap rich text / formula-result / object-shaped cells before use — this dance is repeated in nearly every route; follow the existing pattern rather than reading `cell.value` directly.

## Frontend architecture (`my-app-pt1/src/`)

- `App.tsx` defines all routes and is the single source of truth for **which pages are actually live**. `src/pages/` contains many historical/experimental variants of the same screen that are *not* routed anywhere — check `App.tsx` before assuming a file in `pages/` is reachable. Known orphaned files (not imported by `App.tsx`): `Dashboard_v2.tsx`, `Dashboard_v3.tsx`, `Dashboard_711.tsx`, `Dashboard_711_2.tsx`, `DashboardY.tsx`, `Home_v1.tsx`, `faquo_v1.tsx`, `ExcelMappingSetup2.tsx`, `ExcelMappingSetup3.tsx`.
- `src/pages/index.js` is **not a React page** — it's a stray/backup copy of an old version of the Express backend that was accidentally left inside the frontend `src/pages` directory. It is not imported by anything in the frontend and is not run by Vite; don't confuse it with the real backend in `WebSideAPI/index.js`.
- `Layout.tsx` renders the persistent sidebar (`Dashboard` / "New Form" / "Forms" / "Setup" sections) with `<Outlet />` for routed pages; `Home` is intentionally rendered *outside* `Layout` (no sidebar on the landing page).
- The spreadsheet UI is built on Syncfusion's `@syncfusion/ej2-react-spreadsheet` (`SpreadsheetComponent`), licensed via `registerLicense()` called once in `App.tsx`. `likeexcel.tsx` (route `/like-excel`) is the single live Syncfusion-spreadsheet-based Excel clone; it combines MongoDB-template mode, the Excel file-pool (`?poolFile=` query param), and live multi-user collaboration (Yjs `WebsocketProvider` connecting to `WS_BASE` + `excel-room-${templateCode}`). `likeexcelG.tsx` no longer exists — its collaboration features were merged into `likeexcel.tsx`.
- `ExcelMappingSetup.tsx` is the live "template designer" UI: it builds the same config shape persisted server-side to MongoDB (`templateId`, `mappingFields`, `matrixConfig` with `startColumn`/`endColumn`/axes — see `WebSideAPI/setting.json` for a concrete example) and posted to `/api/spreadsheet/save-template`. Its target database is a local SQLite `.db` file, not MSSQL: the page first creates/selects one via `/api/spreadsheet/sqlite/create-db` and `/api/spreadsheet/sqlite/list-dbs`, then binds the template to it (`dbFile` field) before checking/creating the target table (`/api/spreadsheet/check-table`) or fetching its columns (`/api/table-columns`).
- Tailwind v4 is wired through `@tailwindcss/vite` (not a PostCSS plugin) — see `vite.config.ts`. `tailwind.config.js` still exists for the `safelist` (dynamic `text-[#xxxxxx]` classes) and content globs, but no separate `postcss.config` step is needed for Tailwind itself.
- `recharts` is used for the "New" `Dashboard.tsx`; Syncfusion charts (`@syncfusion/ej2-react-charts`) appear in the orphaned dashboard variants — don't assume both charting libraries are in active use.
