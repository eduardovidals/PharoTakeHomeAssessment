using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace PharoDashboard.Api.Tests.Integration;

public sealed class ApiErrorTests(WebApplicationFactory<Program> application)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData("MISSING")]
    [InlineData("bad%20ticker")]
    [InlineData("%20")]
    [InlineData("%24invalid")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    public async Task BothUnknownAndInvalidTickerRoutesReturnTheSameSafeNotFoundContract(string ticker)
    {
        using var client = application.CreateClient();
        foreach (var suffix in new[] { "", "/stats" })
        {
            using var response = await client.GetAsync($"/api/prices/{ticker}{suffix}");
            var body = await response.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
            using var document = JsonDocument.Parse(body);
            AssertProblem(document.RootElement, 404, "Instrument not found",
                "No market data is available for the requested instrument.",
                "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.5");
            AssertNoDiagnosticDetails(body);
            Assert.DoesNotContain("/api/prices/", body, StringComparison.Ordinal);
            if (!string.IsNullOrWhiteSpace(Uri.UnescapeDataString(ticker)))
                Assert.DoesNotContain(Uri.UnescapeDataString(ticker), body, StringComparison.Ordinal);
        }
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("Production")]
    public async Task UnexpectedControllerFailuresAreSafeInEveryHostingEnvironment(string environment)
    {
        using var failingApplication = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.ConfigureTestServices(services => services.Configure<MvcOptions>(options =>
                options.Filters.Add(new ThrowingActionFilter())));
        });
        using var client = failingApplication.CreateClient();
        using var response = await client.GetAsync("/api/instruments?diagnostic=api-request-marker");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var document = JsonDocument.Parse(body);
        AssertProblem(document.RootElement, 500, "An unexpected error occurred.",
            "The request could not be completed.",
            "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.1");
        AssertNoDiagnosticDetails(body);
        Assert.DoesNotContain("api-error-test-secret", body, StringComparison.Ordinal);
        Assert.DoesNotContain("api-request-marker", body, StringComparison.Ordinal);
        Assert.DoesNotContain("/server/internal/", body, StringComparison.Ordinal);
    }

    private static void AssertProblem(JsonElement problem, int status, string title, string detail, string type)
    {
        Assert.Equal(status, problem.GetProperty("status").GetInt32());
        Assert.Equal(title, problem.GetProperty("title").GetString());
        Assert.Equal(detail, problem.GetProperty("detail").GetString());
        Assert.Equal(type, problem.GetProperty("type").GetString());
        Assert.False(problem.TryGetProperty("instance", out _));
        Assert.All(problem.EnumerateObject(), property =>
            Assert.Contains(property.Name, new[] { "status", "title", "detail", "type", "traceId" }));
    }

    private static void AssertNoDiagnosticDetails(string body)
    {
        foreach (var forbidden in new[] { "stackTrace", "InvalidOperationException", "System.", ".cs:line", AppContext.BaseDirectory })
            Assert.DoesNotContain(forbidden, body, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class ThrowingActionFilter : IActionFilter
    {
        public void OnActionExecuting(ActionExecutingContext context) =>
            throw new InvalidOperationException("api-error-test-secret at /server/internal/market.csv");

        public void OnActionExecuted(ActionExecutedContext context) { }
    }
}
