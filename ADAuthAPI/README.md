# ADAuthAPI - Active Directory Authentication API

A C# ASP.NET Core Web API that provides Windows Authentication to get the current AD user's domain and username.

## Prerequisites

1. **Windows Server or Windows 10/11** with IIS installed
2. **.NET 8.0 SDK** for building
3. **ASP.NET Core Hosting Bundle** for IIS deployment
   - Download from: https://dotnet.microsoft.com/download/dotnet/8.0
4. **IIS Features enabled:**
   - Windows Authentication
   - ASP.NET Core Module (installed with Hosting Bundle)

## IIS Feature Installation (PowerShell as Admin)

```powershell
# Enable IIS features
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WindowsAuthentication
Enable-WindowsOptionalFeature -Online -FeatureName IIS-ASPNET45
```

## Deployment Steps

### Option 1: Using the Deployment Script

1. Open **Command Prompt as Administrator**
2. Navigate to the ADAuthAPI folder
3. Run:
   ```cmd
   deploy-to-iis.bat
   ```

### Option 2: Manual Deployment

1. **Publish the application:**
   ```cmd
   dotnet publish -c Release -o C:\inetpub\wwwroot\ADAuthAPI
   ```

2. **Create IIS Application Pool:**
   - Open IIS Manager
   - Right-click "Application Pools" → "Add Application Pool"
   - Name: `ADAuthAPIPool`
   - .NET CLR Version: `No Managed Code`
   - Managed Pipeline Mode: `Integrated`

3. **Create IIS Website:**
   - Right-click "Sites" → "Add Website"
   - Site name: `ADAuthAPI`
   - Physical path: `C:\inetpub\wwwroot\ADAuthAPI`
   - Port: `5000`
   - Application Pool: `ADAuthAPIPool`

4. **Configure Authentication:**
   - Select the site in IIS Manager
   - Double-click "Authentication"
   - **Disable** "Anonymous Authentication"
   - **Enable** "Windows Authentication"

5. **Set folder permissions:**
   - Right-click `C:\inetpub\wwwroot\ADAuthAPI`
   - Properties → Security → Edit
   - Add `IIS_IUSRS` with Read & Execute permissions

## API Endpoints

### GET /api/findAD
Returns the authenticated AD user information.

**Response (authenticated):**
```json
{
  "success": true,
  "authenticated": true,
  "fullName": "DOMAIN\\username",
  "domain": "DOMAIN",
  "username": "username",
  "authenticationType": "Negotiate"
}
```

### GET /api/health
Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "service": "ADAuthAPI"
}
```

## Testing

1. Open browser and navigate to: `http://localhost:5000/api/findAD`
2. You should see your AD username in the response

## Troubleshooting

### 500.19 Error
- Install ASP.NET Core Hosting Bundle
- Restart IIS: `iisreset`

### 401 Unauthorized
- Ensure Windows Authentication is enabled in IIS
- Ensure Anonymous Authentication is disabled
- Check that the browser supports Windows Auth (Edge, Chrome, Firefox)

### 502.5 Error
- Check stdout logs in `C:\inetpub\wwwroot\ADAuthAPI\logs\`
- Verify .NET 8.0 Runtime is installed

### CORS Errors
- The API is configured to allow requests from:
  - `http://localhost:5173` (Vite dev server)
  - `http://localhost:3000` (Node.js backend)
- Add additional origins in `Program.cs` if needed

## Frontend Integration

The React frontend (`likeexcelAD.tsx`) calls this API:

```typescript
fetch('http://localhost:5000/api/findAD', {
  credentials: 'include'  // Required for Windows Auth
})
```

The `credentials: 'include'` is essential for sending Windows authentication tokens.
