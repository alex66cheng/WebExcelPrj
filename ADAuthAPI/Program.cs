using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.IdentityModel.Tokens;
using System.DirectoryServices.AccountManagement;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;


// Looks up the signed-in user's AD email ('mail' attribute) and display name.
// WebSideAPI keys the Excel file pool, invites, edit deadlines and per-user
// SQLite DBs on an email, so this is what lets those features work on the
// enterprise build. Falls back to the UPN, then to username@domain, if the
// account has no mail attribute or AD can't be queried (e.g. the IIS app pool
// identity lacks directory read access).
(string Email, string DisplayName) LookupAdUser(string fullName, string domain, string username)
{
    string? email = null;
    string? displayName = null;
    // System.DirectoryServices is Windows-only; ADAuthAPI runs under IIS, but guard
    // anyway so a non-Windows host just uses the fallbacks instead of throwing.
    if (OperatingSystem.IsWindows()) try
    {
        using var ctx = new PrincipalContext(ContextType.Domain, string.IsNullOrEmpty(domain) ? null : domain);
        using var principal = UserPrincipal.FindByIdentity(ctx, fullName)
            ?? UserPrincipal.FindByIdentity(ctx, IdentityType.SamAccountName, username);
        email = principal?.EmailAddress ?? principal?.UserPrincipalName;
        displayName = principal?.DisplayName;
    }
    catch (Exception)
    {
        // AD lookup failed — fall through to the fallbacks below
    }

    if (string.IsNullOrWhiteSpace(email))
        email = fullName.Contains('@') ? fullName : $"{username}@{domain}";
    if (string.IsNullOrWhiteSpace(displayName))
        displayName = username;

    return (email.Trim().ToLowerInvariant(), displayName);
}

string GenerateAdToken(string jwtSharedSecret, string domain, string username, string email, string displayName)
{
    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSharedSecret));
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var token = new JwtSecurityToken(
        claims: new[]
        {
            new Claim("domain", domain),
            new Claim("username", username),
            new Claim("email", email),
            new Claim("name", displayName)
        },
        expires: DateTime.UtcNow.AddHours(8),
        signingCredentials: credentials
    );
    return new JwtSecurityTokenHandler().WriteToken(token);
}

var builder = WebApplication.CreateBuilder(args);

// Shared secret with WebSideAPI/index.js's JWT_SECRET — both sides must use the
// exact same string so Node can verify the token this service signs. The IIS
// deployment writes it to appsettings.Production.json (see
// deploy/iis/Deploy-Enterprise.ps1); the literal is only the dev fallback.
var jwtSharedSecret = builder.Configuration["Jwt:SharedSecret"] is { Length: > 0 } configured
    ? configured
    : "webexcelprj-enterprise-ad-jwt-secret-change-me";

// Add CORS - Allow credentials for Windows Auth
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",  // Vite dev server
                "http://localhost:3000",  // Node.js backend
                "http://127.0.0.1:5173",
                "http://127.0.0.1:3000"
              )
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();  // Required for Windows Auth
    });
});

// Add Windows Authentication
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();

// API endpoint to get AD user info
app.MapGet("/api/findAD", (HttpContext context) =>
{
    var user = context.User;

    if (user?.Identity?.IsAuthenticated == true)
    {
        var identity = user.Identity;
        var fullName = identity.Name ?? "Unknown";

        // Parse domain and username from "DOMAIN\\username" format
        string domain = "";
        string username = fullName;

        if (fullName.Contains('\\'))
        {
            var parts = fullName.Split('\\');
            domain = parts[0];
            username = parts[1];
        }
        else if (fullName.Contains('@'))
        {
            // Handle UPN format: username@domain.com
            var parts = fullName.Split('@');
            username = parts[0];
            domain = parts[1];
        }

        var (email, displayName) = LookupAdUser(fullName, domain, username);

        return Results.Json(new
        {
            success = true,
            authenticated = true,
            fullName = fullName,
            domain = domain,
            username = username,
            email = email,
            displayName = displayName,
            authenticationType = identity.AuthenticationType,
            token = GenerateAdToken(jwtSharedSecret, domain, username, email, displayName)
        });
    }

    return Results.Json(new
    {
        success = true,
        authenticated = false,
        fullName = (string?)null,
        domain = (string?)null,
        username = (string?)null,
        authenticationType = (string?)null
    });
})
.RequireAuthorization();

// Health check endpoint (no auth required)
app.MapGet("/api/health", () => Results.Json(new { status = "ok", service = "ADAuthAPI" }));

// For IIS deployment, don't specify URL - let IIS handle it
app.Run();
