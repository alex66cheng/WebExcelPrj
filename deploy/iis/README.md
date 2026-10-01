# Enterprise deployment: Windows Server + IIS (3 parts)

Target: `https://faapp.pist.com.tw/WebExcelApp` on the existing **Default Web Site**.
The app is deployed as three separate parts, each with its own install script. The
Windows server only receives build output: no source code, and no npm, .NET SDK or
internet access needed.

| Part | What | Where | URL |
|------|------|-------|-----|
| 1 frontend | `dist/` (static) + `web.config` | `C:\inetpub\wwwroot\WebExcelApp`, IIS app, pool `WebExcelApp` | `/WebExcelApp/` |
| 2 backend  | WebSideAPI (Node.js), Windows service `WebExcelAPI` | `C:\WebExcel\app\WebSideAPI`, listens on `127.0.0.1:3000` only | reached via `/WebExcelApp/api/*` and `/WebExcelApp/excel-room-*` (WebSocket), which IIS proxies to it |
| 3 AD auth  | ADAuthAPI (C# .NET 8), Windows Authentication only | `C:\inetpub\wwwroot\WebExcelAuth`, IIS app, pool `WebExcelAuth` | `/WebExcelAuth/api/findAD` |

Login: the browser calls `/WebExcelAuth/api/findAD`. IIS negotiates Kerberos/NTLM,
ADAuthAPI reads the user's AD mail and display name, and returns a signed JWT. The
frontend sends that token to `/WebExcelApp/api/*`, and WebSideAPI verifies it. Parts 2
and 3 share the signing secret through `C:\WebExcel\jwt-secret.txt`, which is created
on first install and readable by admins only.

## 1. Prerequisites on the Windows server (once, as Administrator)

The server must be **domain-joined**.

| For | Install |
|-----|---------|
| Part 1 | **IIS URL Rewrite 2.1**: https://www.iis.net/downloads/microsoft/url-rewrite |
| Part 1 | **IIS Application Request Routing 3.0**: https://www.iis.net/downloads/microsoft/application-request-routing |
| Part 2 | **Node.js 24 LTS** (22.13 or newer): https://nodejs.org |
| Part 2 | **NSSM**: https://nssm.cc/download. Copy `win64\nssm.exe` to `C:\Windows\System32` |
| Part 2 | **MongoDB Community Server** MSI, with "Install MongoDB as a Service" ticked: https://www.mongodb.com/try/download/community |
| Part 3 | **ASP.NET Core 8 Hosting Bundle** (runtime only, not the SDK): https://dotnet.microsoft.com/download/dotnet/8.0. Install it *after* IIS, or run its repair afterwards. |

The scripts turn on the IIS features they need themselves (WebSocket Protocol, Windows
Authentication, compression, …).

## 2. Build the package (on the Linux build server)

```bash
cd ~/WebExcelPrj-enterprise && deploy/iis/build-packages.sh
```
→ `deploy/out/WebExcel-enterprise.zip`. To build for other paths, set them in front:
`APP_PATH=/X AUTH_PATH=/Y deploy/iis/build-packages.sh`. The paths are compiled into
the frontend.

## 3. Install (on the Windows server)

1. Download the zip to your PC: `scp alex@www.mygwsite.com:WebExcelPrj-enterprise/deploy/out/WebExcel-enterprise.zip .`
2. Copy it to the server and extract it, e.g. to `C:\deploy\WebExcel-enterprise`.
3. In an **Administrator** PowerShell:
   ```powershell
   cd C:\deploy\WebExcel-enterprise
   powershell -ExecutionPolicy Bypass -File .\Install-All.ps1
   ```

`Install-All.ps1` runs the three parts in this order: 2 backend, then 3 AD auth, then
1 frontend. To redeploy only one part, run its script instead:

```powershell
powershell -ExecutionPolicy Bypass -File .\1-frontend\Install-Frontend.ps1
powershell -ExecutionPolicy Bypass -File .\2-backend\Install-Backend.ps1
powershell -ExecutionPolicy Bypass -File .\3-adauth\Install-ADAuth.ps1
```

Every script can be re-run safely. Its parameters, each with a default, are:
`-SiteName "Default Web Site"`, `-SiteUrl https://faapp.pist.com.tw` (used only for the
smoke test), `-PhysicalPath`, `-AppPool`, `-InstallRoot C:\WebExcel`, `-ServiceName WebExcelAPI`.

A redeploy keeps user data: `C:\WebExcel\app\Excels`, `app\WebSideAPI\sqlite-dbs`, `uploads`,
`excel-pool-meta.json`, MongoDB, and the JWT secret.

**Server-wide changes:** Part 1 turns on the ARR proxy (`system.webServer/proxy`) for
the whole server, with a 10-minute timeout, and adds JSON to dynamic compression. Part 3
unlocks the `anonymousAuthentication` / `windowsAuthentication` sections so the app's
`web.config` can set them.

**If the old single-site script (`Deploy-Enterprise.ps1`) was run before:** remove its
site `WebExcel` and its `/adauth` app in IIS Manager. Data in `C:\WebExcel\app` stays where it is.

## 4. Browser single sign-on

For users to be signed in silently, `https://faapp.pist.com.tw` must be in the
**Local intranet** zone. Set it by GPO: *Administrative Templates → Windows Components →
Internet Explorer → Internet Control Panel → Security Page → Site to Zone Assignment List*,
value `1`. Edge and Chrome follow this setting.

**Kerberos:** if `faapp.pist.com.tw` is a DNS alias rather than the server's own name, register an SPN,
otherwise browsers fall back to NTLM: `setspn -S HTTP/faapp.pist.com.tw <SERVERNAME>`.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `/WebExcelApp/api/*` → 502.3 | Service not running: `Get-Service WebExcelAPI`, `C:\WebExcel\logs\websideapi.err.log` |
| `/WebExcelApp/api/*` → 404 | ARR not installed, or proxy not enabled: re-run Part 1 |
| Blank page, `/assets/...` 404 in the browser console | Build was made for another path: rebuild with the right `APP_PATH` |
| Page 500.19 | A `web.config` at the site root (`C:\inetpub\wwwroot\web.config`) conflicts, e.g. it has a duplicate rewrite rule or mimeMap. `<clear/>`/`<remove>` already handle the common cases. |
| Everything → 401 after login | Secret mismatch between `nssm get WebExcelAPI AppEnvironmentExtra` and `C:\inetpub\wwwroot\WebExcelAuth\appsettings.Production.json`. Re-run Parts 2 and 3. |
| `/WebExcelAuth` → 500.19 | Hosting Bundle missing, or auth sections locked: re-run Part 3 |
| `/WebExcelAuth` → 500.30 / 502.5 | `C:\inetpub\wwwroot\WebExcelAuth\logs\stdout_*.log` |
| "Access Denied" in the app | Browser didn't send Windows credentials: see §4. Test `/WebExcelAuth/api/findAD` directly. |
| `findAD` smoke test 401 **on the server only** | Windows' NTLM loopback check when the server calls its own host name. Test from a client PC. |
| Collaboration doesn't sync | IIS "WebSocket Protocol" feature, then `iisreset` |
| Upload fails > 100 MB | `maxAllowedContentLength` in `web.config`. WebSideAPI itself caps uploads at 50 MB. |

## Development

The frontend reads its base path from `vite build --base` (`import.meta.env.BASE_URL`,
used by the router, `API_BASE` and `WS_BASE`) and the ADAuthAPI path from
`VITE_AD_AUTH_PATH`. Under `npm run dev` the base is `/` and Vite proxies `/api`,
`/excel-room-*` and `/adauth` (see `my-app-pt1/vite.config.ts`). ADAuthAPI only works on
Windows, so AD login needs a Windows machine running it on `localhost:5000`.
