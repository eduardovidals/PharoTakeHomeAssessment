using System.Globalization;
using System.Text.Json;
using PharoDashboard.Api.Data;
using PharoDashboard.Api.Features.Prices;
using Xunit;

namespace PharoDashboard.Api.Tests.Prices;

public sealed class PriceStatisticsDatasetTests
{
    [Fact]
    public void EverySuppliedTickerMatchesTheIndependentExpectedStatistics()
    {
        // Committed expectations use an independent Welford variance and exhaustive earlier/later
        // price-pair drawdown oracle. This test never regenerates them from the production calculator.
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "price-statistics.expected.json");
        var fixture = JsonSerializer.Deserialize<ExpectedStatistics[]>(File.ReadAllText(fixturePath),
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(fixture);
        Assert.Equal(200, fixture.Length);
        Assert.Equal(200, fixture.Select(item => item.Ticker).Distinct(StringComparer.Ordinal).Count());

        var store = CsvMarketDataLoader.Load(Path.Combine(AppContext.BaseDirectory, "Data", "market_data.csv"));

        Assert.Equal(store.Tickers, fixture.Select(item => item.Ticker).Order(StringComparer.Ordinal));

        foreach (var expected in fixture)
        {
            Assert.True(store.TryGetPrices(expected.Ticker, out var prices), expected.Ticker);

            var actual = PriceStatisticsCalculator.Calculate(prices);

            Close(expected.Ticker, nameof(actual.TotalReturnPercent), expected.TotalReturnPercent, actual.TotalReturnPercent);
            Close(expected.Ticker, nameof(actual.DailyVolatilityPercent),
                Assert.IsType<double>(expected.DailyVolatilityPercent), Assert.IsType<double>(actual.DailyVolatilityPercent));
            Close(expected.Ticker, nameof(actual.MaxDrawdownPercent), expected.MaxDrawdownPercent, actual.MaxDrawdownPercent);
        }
    }

    private static void Close(string ticker, string field, double expected, double actual)
    {
        Assert.True(double.IsFinite(expected));
        Assert.True(double.IsFinite(actual));
        Assert.True(Math.Abs(expected - actual) <= 1e-10,
            string.Create(CultureInfo.InvariantCulture, $"{ticker} {field}: expected {expected:R}, actual {actual:R}; absolute tolerance 1e-10."));
    }

    private sealed record ExpectedStatistics(
        string Ticker,
        double TotalReturnPercent,
        double? DailyVolatilityPercent,
        double MaxDrawdownPercent);
}
