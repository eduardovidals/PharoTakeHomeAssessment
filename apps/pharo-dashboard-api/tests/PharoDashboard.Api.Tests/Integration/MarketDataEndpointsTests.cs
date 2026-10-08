using System.Globalization;
using System.Net;
using System.Text.Json;
using CsvHelper;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PharoDashboard.Api.Data;
using PharoDashboard.Api.Features.Prices;
using Xunit;

namespace PharoDashboard.Api.Tests.Integration;

public sealed class MarketDataEndpointsTests(WebApplicationFactory<Program> application)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task InstrumentsReturnsEveryExpectedTickerInOrdinalOrder()
    {
        using var client = application.CreateClient();
        var body = await GetJson(client, "/api/instruments");

        Assert.Equal(JsonValueKind.Array, body.ValueKind);

        var tickers = body.EnumerateArray().Select(value => value.GetString()).ToArray();

        Assert.Equal(200, tickers.Length);
        Assert.Equal(200, tickers.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(ReadExpectedStatistics().Select(item => item.Ticker).Order(StringComparer.Ordinal), tickers);
    }

    [Theory]
    [InlineData("TICK0001")]
    [InlineData("TICK0100")]
    [InlineData("TICK0200")]
    public async Task PricesAndStatisticsMatchSourceObservationsAndIndependentConstants(string ticker)
    {
        using var client = application.CreateClient();

        var prices = await GetJson(client, $"/api/prices/{ticker}");
        var expectedPrices = ReadSourcePrices(ticker);

        Assert.Equal(JsonValueKind.Array, prices.ValueKind);
        Assert.Equal(30, prices.GetArrayLength());
        Assert.Equal(expectedPrices.Count, prices.GetArrayLength());

        for (var index = 0; index < expectedPrices.Count; index++)
        {
            Assert.Equal(new[] { "date", "price" }, PropertyNames(prices[index]));
            Assert.Equal(expectedPrices[index].Date, prices[index].GetProperty("date").GetString());
            Assert.Equal(expectedPrices[index].Price, prices[index].GetProperty("price").GetDecimal());
        }

        var statistics = await GetJson(client, $"/api/prices/{ticker}/stats");

        Assert.Equal(new[] { "dailyVolatilityPercent", "maxDrawdownPercent", "totalReturnPercent" }, PropertyNames(statistics));
        var expected = Assert.Single(ReadExpectedStatistics(), item => item.Ticker == ticker);
        Close(expected.TotalReturnPercent, statistics.GetProperty("totalReturnPercent").GetDouble());
        Close(expected.DailyVolatilityPercent, statistics.GetProperty("dailyVolatilityPercent").GetDouble());
        Close(expected.MaxDrawdownPercent, statistics.GetProperty("maxDrawdownPercent").GetDouble());
    }

    [Theory]
    [InlineData("tick0001")]
    [InlineData("TiCk0001")]
    [InlineData("%20tick0001%20")]
    public async Task BothTickerRoutesNormalizeCaseAndSurroundingWhitespace(string ticker)
    {
        using var client = application.CreateClient();

        foreach (var suffix in new[] { "", "/stats" })
        {
            var canonical = await GetBody(client, "/api/prices/TICK0001" + suffix);
            Assert.Equal(canonical, await GetBody(client, $"/api/prices/{ticker}{suffix}"));
        }
    }

    [Fact]
    public async Task UnrelatedQueryParametersDoNotChangeAnyResource()
    {
        using var client = application.CreateClient();

        foreach (var path in new[] { "/api/instruments", "/api/prices/TICK0001", "/api/prices/TICK0001/stats" })
        {
            var baseline = await GetBody(client, path);
            Assert.Equal(baseline, await GetBody(client, path + "?ticker=MISSING&from=1900-01-01&other=ignored"));
        }
    }

    [Fact]
    public async Task MultipleTickersAndResourcesStayConsistentAcrossConcurrentRequests()
    {
        using var client = application.CreateClient();
        var paths = new[] { "TICK0001", "TICK0100", "TICK0200" }
            .SelectMany(ticker => new[] { $"/api/prices/{ticker}", $"/api/prices/{ticker}/stats" })
            .Append("/api/instruments").ToArray();
        var baselines = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var path in paths) baselines.Add(path, await GetBody(client, path));

        await Task.WhenAll(Enumerable.Range(0, 8).SelectMany(_ => paths.Select(async path =>
            Assert.Equal(baselines[path], await GetBody(client, path)))));
    }

    [Theory]
    [InlineData("ONE", 1, 0, 0)]
    [InlineData("TWO", 2, -20, 20)]
    public async Task ShortSeriesSerializeNullVolatilityAndReuseEagerPrecomputationAfterDataDeletion(
        string ticker, int expectedCount, double totalReturn, double drawdown)
    {
        var directory = Directory.CreateTempSubdirectory("pharo-http-data-");
        var dataPath = Path.Combine(directory.FullName, "market.csv");
        File.WriteAllText(dataPath, "date,ticker,price\n2026-06-23,ONE,100\n2026-06-23,TWO,100\n2026-06-24,TWO,80\n");

        try
        {
            var loads = 0;
            var precomputations = 0;

            using var shortApplication = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((_, configuration) =>
                    configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["MarketData:Path"] = dataPath }));

                builder.ConfigureTestServices(services =>
                {
                    CountSingletonCreation<MarketDataStore>(services, () => Interlocked.Increment(ref loads));
                    CountSingletonCreation<PricesService>(services, () => Interlocked.Increment(ref precomputations));
                });
            });
            using var client = shortApplication.CreateClient();

            // The real host must initialize both services before its first HTTP request.
            Assert.Equal(1, Volatile.Read(ref loads));
            Assert.Equal(1, Volatile.Read(ref precomputations));

            var originalService = shortApplication.Services.GetRequiredService<PricesService>();
            File.Delete(dataPath);

            await Task.WhenAll(Enumerable.Range(0, 16).Select(async _ =>
            {
                var instruments = await GetJson(client, "/api/instruments");
                Assert.Equal(new[] { "ONE", "TWO" }, instruments.EnumerateArray().Select(value => value.GetString()));

                var prices = await GetJson(client, $"/api/prices/{ticker}");
                Assert.Equal(expectedCount, prices.GetArrayLength());
                Assert.Equal(100m, prices[0].GetProperty("price").GetDecimal());
                if (expectedCount == 2) Assert.Equal(80m, prices[1].GetProperty("price").GetDecimal());

                var statistics = await GetJson(client, $"/api/prices/{ticker}/stats");
                Assert.Equal(JsonValueKind.Null, statistics.GetProperty("dailyVolatilityPercent").ValueKind);
                Close(totalReturn, statistics.GetProperty("totalReturnPercent").GetDouble());
                Close(drawdown, statistics.GetProperty("maxDrawdownPercent").GetDouble());

                using var scope = shortApplication.Services.CreateScope();
                Assert.Same(originalService, scope.ServiceProvider.GetRequiredService<PricesService>());
            }));

            Assert.Equal(1, Volatile.Read(ref loads));
            Assert.Equal(1, Volatile.Read(ref precomputations));
        }
        finally
        {
            directory.Delete(true);
        }
    }

    private static void CountSingletonCreation<T>(IServiceCollection services, Action count) where T : class
    {
        var original = Assert.Single(services, service => service.ServiceType == typeof(T));
        Assert.Equal(ServiceLifetime.Singleton, original.Lifetime);

        var create = original.ImplementationFactory ?? (provider => ActivatorUtilities.CreateInstance(provider,
            original.ImplementationType ?? throw new InvalidOperationException("Expected a startup-created singleton.")));

        services.RemoveAll<T>();
        services.AddSingleton(provider =>
        {
            count();
            return (T)create(provider);
        });
    }

    private static async Task<string> GetBody(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        return await response.Content.ReadAsStringAsync();
    }

    private static async Task<JsonElement> GetJson(HttpClient client, string path)
    {
        using var document = JsonDocument.Parse(await GetBody(client, path));

        return document.RootElement.Clone();
    }

    private static IEnumerable<string> PropertyNames(JsonElement value) =>
        value.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal);

    private static List<SourcePrice> ReadSourcePrices(string ticker)
    {
        // Decode the supplied source directly rather than deriving expected HTTP rows from the store.
        using var reader = File.OpenText(Path.Combine(AppContext.BaseDirectory, "Data", "market_data.csv"));
        using var csv = new CsvReader(reader, CultureInfo.InvariantCulture);

        Assert.True(csv.Read());
        csv.ReadHeader();

        var prices = new List<SourcePrice>();

        while (csv.Read())
        {
            if (csv.GetField("ticker") == ticker)
                prices.Add(new SourcePrice(csv.GetField("date") ?? throw new InvalidDataException("Missing source date."),
                    csv.GetField<decimal>("price")));
        }

        return prices.OrderBy(point => point.Date, StringComparer.Ordinal).ToList();
    }

    private static ExpectedStatistics[] ReadExpectedStatistics() =>
        JsonSerializer.Deserialize<ExpectedStatistics[]>(
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "price-statistics.expected.json")),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidDataException("Missing statistics expectations.");

    private static void Close(double expected, double actual)
    {
        Assert.True(double.IsFinite(actual));
        Assert.InRange(Math.Abs(expected - actual), 0, 1e-10);
    }

    private sealed record SourcePrice(string Date, decimal Price);

    private sealed record ExpectedStatistics(string Ticker, double TotalReturnPercent, double DailyVolatilityPercent, double MaxDrawdownPercent);
}
