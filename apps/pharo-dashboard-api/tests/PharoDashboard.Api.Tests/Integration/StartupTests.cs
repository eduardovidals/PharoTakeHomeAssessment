using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PharoDashboard.Api.Tests.Integration;

/// <summary>
/// Exercises the running ASP.NET pipeline through its actual integration host.
/// </summary>
public sealed class StartupTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _application;

    public StartupTests(WebApplicationFactory<Program> application)
    {
        _application = application;
    }

    [Fact]
    public async Task HealthEndpointReportsReadyStartup()
    {
        using var client = _application.CreateClient();
        using var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ready", document.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task AnUnmappedRouteReturnsNotFound()
    {
        using var client = _application.CreateClient();
        using var response = await client.GetAsync("/not-a-mapped-route");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
