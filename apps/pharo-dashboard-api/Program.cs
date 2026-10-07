using PharoDashboard.Api.Data;

// Runtime data and settings travel with the application, independent of the shell's directory.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});

builder.Services.AddControllers();
builder.Services.AddSingleton(services =>
{
    var configuration = services.GetRequiredService<IConfiguration>();
    var environment = services.GetRequiredService<IHostEnvironment>();
    var configuredPath = configuration["MarketData:Path"];
    if (string.IsNullOrWhiteSpace(configuredPath))
    {
        throw new InvalidOperationException("MarketData:Path must identify the market data CSV.");
    }

    return CsvMarketDataLoader.Load(Path.GetFullPath(configuredPath, environment.ContentRootPath));
});

var app = builder.Build();

// Resolve the singleton before serving: invalid or unavailable data prevents readiness.
_ = app.Services.GetRequiredService<MarketDataStore>();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ready" }))
    .WithName("Readiness");

app.Run();

/// <summary>
/// Exposes the application entry point to the ASP.NET integration test host.
/// </summary>
public partial class Program
{
}
