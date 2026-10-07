var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var app = builder.Build();

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
