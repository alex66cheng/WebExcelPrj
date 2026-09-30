# Enterprise deployment: Windows Server + IIS

One IIS site serves everything from a single origin, so there's no CORS, only one
port to open, and one certificate for HTTPS:

| URL                          | Served by                                                         |
|------------------------------|-------------------------------------------------------------------|
| `/`, `/like-excel`, …        | IIS static files: built frontend (`C:\WebExcel\web`), SPA fallback to `index.html` |
| `/api/*`                     | IIS → ARR reverse proxy → WebSideAPI (Node, Windows service `WebExcelAPI`, `127.0.0.1:3000`) |
| `/excel-room-*` (WebSocket)  | same proxy → WebSideAPI (Yjs collaboration)                       |
| `/adauth/*`                  | ADAuthAPI (.NET 8, IIS application, **Windows Authentication only**) |

Login flow: the browser calls `/adauth/api/findAD` → IIS negotiates Kerberos/NTLM →
ADAuthAPI looks up the AD user (mail, display name) and signs a JWT → the frontend
sends it as `Authorization: Bearer` to `/api/*`. WebSideAPI verifies it with the same
shared secret. `Deploy-Enterprise.ps1` generates that secret once, stores it in
`C:\WebExcel\jwt-secret.txt` (admins only), and passes it to both services.

## 1. Prerequisites (install once, as Administrator)

The server should be **domain-joined** (ADAuthAPI queries AD as the machine account).

1. **Node.js 24 LTS** (at least 22.13, because WebSideAPI uses the built-in `node:sqlite`): https://nodejs.org
2. **.NET 8 SDK** and the **ASP.NET Core 8 Hosting Bundle**: https://dotnet.microsoft.com/download/dotnet/8.0
   Install the Hosting Bundle *after* IIS, or run its repair afterwards.
3. **IIS URL Rewrite 2.1**: https://www.iis.net/downloads/microsoft/url-rewrite
4. **IIS Application Request Routing 3.0**: https://www.iis.net/downloads/microsoft/application-request-routing
5. **NSSM** (runs Node as a Windows service): https://nssm.cc/download. Copy `win64\nssm.exe` into a folder on `PATH`, e.g. `C:\Windows\System32`.
6. **MongoDB Community Server** MSI with "Install MongoDB as a Service" ticked (listens on `127.0.0.1:27017`): https://www.mongodb.com/try/download/community
7. **Git**, to check out the `enterprise` branch.

The script enables the IIS role/features itself (static content, compression, WebSocket
Protocol, Windows Authentication, …). If IIS wasn't installed before, install the
Hosting Bundle / URL Rewrite / ARR after the first run, then re-run it.

## 2. Deploy

```powershell
git clone -b enterprise <repo-url> C:\src\WebExcelPrj
cd C:\src\WebExcelPrj
powershell -ExecutionPolicy Bypass -File deploy\iis\Deploy-Enterprise.ps1 -HostName webexcel.corp.local
```

Parameters (all optional):

| Parameter         | Default        | Notes |
|-------------------|----------------|-------|
| `-HostName`       | *(any)*        | Host header for the binding. Leave empty to answer on any name/IP. |
| `-Port`           | `80`           | If `Default Web Site` already has `*:80:`, stop it or pass a host name. |
| `-CertThumbprint` | *(none)*       | Cert in `LocalMachine\My`: adds an `https` binding on 443 (SNI when `-HostName` is set). |
| `-InstallRoot`    | `C:\WebExcel`  | `web\`, `adauth\`, `app\WebSideAPI\`, `app\Excels\`, `logs\`, `jwt-secret.txt` |
| `-SiteName`       | `WebExcel`     | Also the app pool names: `WebExcel`, `WebExcel-ADAuth` |
| `-ServiceName`    | `WebExcelAPI`  | NSSM service running `node index.js` |

The run ends with a smoke test of `/`, an SPA route, `/api` (expects 401 without a
token, which proves the proxy works), and `/adauth/api/health` + `findAD`.

**Updating:** `git pull`, then re-run the same command. Code is rebuilt and replaced.
User data is left alone: `app\Excels`, `app\WebSideAPI\sqlite-dbs`, `uploads`,
`excel-pool-meta.json`, MongoDB, and the JWT secret.

## 3. Browser single sign-on

For users to be signed in silently (no password prompt), the site must be in the
**Local intranet** zone:

- GPO: *Computer/User Configuration → Administrative Templates → Windows Components →
  Internet Explorer → Internet Control Panel → Security Page → Site to Zone Assignment List*:
  `https://webexcel.corp.local` = `1`. Edge and Chrome follow this zone setting.
- Firefox: `network.negotiate-auth.trusted-uris` / `network.automatic-ntlm-auth.trusted-uris`.

**Kerberos:** if `-HostName` isn't the server's own computer name/FQDN (e.g. a DNS
alias), register an SPN for the machine account, otherwise browsers fall back to NTLM:
`setspn -S HTTP/webexcel.corp.local <SERVERNAME>`.

## 4. Moving existing data (optional)

From the Linux/cloud host, copy these into `C:\WebExcel\app\…`, with the service stopped
(`nssm stop WebExcelAPI`):
`Excels\`, `WebSideAPI\sqlite-dbs\`, `WebSideAPI\uploads\`, `WebSideAPI\excel-pool-meta.json`.
For MongoDB: `mongodump --db excel_cell_logs` and `mongodump --db excel_import_system` there, then `mongorestore dump\` here.
Per-user folders are keyed on the user's email. On this build that's the AD `mail`
attribute, so data only lines up if it matches the Google email used on the cloud build.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `/api/*` → 502.3 | The service isn't running: `Get-Service WebExcelAPI`, `C:\WebExcel\logs\websideapi.err.log` |
| `/api/*` → 404 served by IIS | ARR proxy not enabled / ARR not installed: re-run the script |
| Everything → 401 after login | Secret mismatch: the service env (`nssm get WebExcelAPI AppEnvironmentExtra`) vs `C:\WebExcel\adauth\appsettings.Production.json` |
| `/adauth` → 500.19 | Hosting Bundle missing, or auth sections locked: re-run the script (it unlocks them) |
| `/adauth` → 500.30 / 502.5 | `C:\WebExcel\adauth\logs\stdout_*.log` |
| "Access Denied" page in the app | Browser didn't send Windows credentials: see §3; test `https://<host>/adauth/api/findAD` directly |
| `findAD` smoke test 401 **on the server only** | Windows' NTLM loopback check when calling your own host name. Test from a client PC instead. |
| Collaboration doesn't sync | IIS "WebSocket Protocol" feature, then `iisreset` |
| Upload fails > 100 MB | `maxAllowedContentLength` in `web.config`; WebSideAPI itself caps uploads at 50 MB |

## Development

The frontend uses same-origin URLs (`API_BASE = window.location.origin`,
`AD_AUTH_BASE = origin + '/adauth'`). `npm run dev` proxies `/api`, `/excel-room-*`
and `/adauth` the same way IIS does (see `my-app-pt1/vite.config.ts`). ADAuthAPI only
works on Windows, so AD login needs a Windows box running it on `localhost:5000`.
