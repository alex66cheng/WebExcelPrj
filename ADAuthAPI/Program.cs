using Microsoft.AspNetCore.Authentication.Negotiate;

var builder = WebApplication.CreateBuilder(args);

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

        return Results.Json(new
        {
            success = true,
            authenticated = true,
            fullName = fullName,
            domain = domain,
            username = username,
            authenticationType = identity.AuthenticationType
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
