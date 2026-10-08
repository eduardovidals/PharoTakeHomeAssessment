using PharoDashboard.Api.Data;
using PharoDashboard.Api.Features.Instruments;
using PharoDashboard.Api.Features.Prices;

// Runtime data and settings travel with the application, independent of the shell's directory.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});

builder.Services.AddControllers();

builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        if (context.ProblemDetails.Status >= StatusCodes.Status500InternalServerError)
        {
            context.ProblemDetails.Title = "An unexpected error occurred.";
            context.ProblemDetails.Detail = "The request could not be completed.";
            context.ProblemDetails.Type = "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.1";
            context.ProblemDetails.Instance = null;
        }
    };
});

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

builder.Services.AddSingleton<InstrumentsService>();
builder.Services.AddSingleton<PricesService>();

var app = builder.Build();

// Resolve the singleton before serving: invalid or unavailable data prevents readiness.
_ = app.Services.GetRequiredService<MarketDataStore>();
_ = app.Services.GetRequiredService<PricesService>();

// Keep client errors safe in both local development and published hosting.
app.UseExceptionHandler();

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
