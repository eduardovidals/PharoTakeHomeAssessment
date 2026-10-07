using System.Text.Json;
using PharoDashboard.Api.Features.Prices;
using Xunit;

namespace PharoDashboard.Api.Tests.Prices;

public sealed class PriceStatisticsCalculatorTests
{
    private const double Tolerance = 1e-10;

    public static IEnumerable<object[]> KnownSeries()
    {
        // Literal expectations use simple returns, sample deviation, and earlier-peak declines.
        yield return [new decimal[] { 100m, 110m, 99m }, -1d, 14.142135623730950d, 10d];
        yield return [new decimal[] { 100m, 80m, 120m, 90m }, -10d, 41.932485418030414d, 25d];
        yield return [new decimal[] { 100m, 200m, 180m }, 80d, 77.781745930520227d, 10d];
        yield return [new decimal[] { 100m, 100m, 100m }, 0d, 0d, 0d];
        yield return [new decimal[] { 100m, 110m, 121m }, 21d, 0d, 0d];
        yield return [new decimal[] { 100m, 110m, 121m, 133.1m }, 33.1d, 0d, 0d];
        yield return [new decimal[] { 100m, 90m, 81m, 72.9m }, -27.1d, 0d, 27.1d];
        yield return [new decimal[] { 100m, 90m, 80m, 70m }, -30d, 1.252569375784137d, 30d];
        yield return [new decimal[] { 100m, 60m, 80m, 120m }, 20d, 47.881025392033874d, 40d];
    }

    [Theory]
    [MemberData(nameof(KnownSeries))]
    public void IndependentLiteralFixturesDefinePercentageValuedStatistics(
        decimal[] prices, double totalReturn, double volatility, double drawdown)
    {
        var result = PriceStatisticsCalculator.Calculate(Points(prices));
        Close(totalReturn, result.TotalReturnPercent);
        Close(volatility, Assert.IsType<double>(result.DailyVolatilityPercent));
        Close(drawdown, result.MaxDrawdownPercent);
    }

    [Fact]
    public void OneObservationHasDefinedReturnAndDrawdownButInsufficientSampleVolatility()
    {
        var result = PriceStatisticsCalculator.Calculate(Points(75.25m));
        Assert.Equal(0d, result.TotalReturnPercent);
        Assert.Null(result.DailyVolatilityPercent);
        Assert.Equal(0d, result.MaxDrawdownPercent);
    }

    [Theory]
    [InlineData(100, 80, -20, 20)]
    [InlineData(80, 100, 25, 0)]
    [InlineData(100, 100, 0, 0)]
    public void TwoObservationsDoNotInventASampleDeviation(
        int first, int last, double totalReturn, double drawdown)
    {
        var result = PriceStatisticsCalculator.Calculate(Points(first, last));
        Close(totalReturn, result.TotalReturnPercent);
        Assert.Null(result.DailyVolatilityPercent);
        Close(drawdown, result.MaxDrawdownPercent);
    }

    [Fact]
    public void ANewFuturePeakCannotBePairedWithAnEarlierTrough()
    {
        var result = PriceStatisticsCalculator.Calculate(Points(100m, 80m, 120m));
        Close(20d, result.TotalReturnPercent);
        Close(20d, result.MaxDrawdownPercent);
        Close(49.497474683058327d, Assert.IsType<double>(result.DailyVolatilityPercent));
    }

    [Fact]
    public void SubCentChangesRetainPrecisionUntilPresentation()
    {
        var result = PriceStatisticsCalculator.Calculate(Points(100m, 100.000001m, 100.000003m));
        Assert.InRange(result.TotalReturnPercent, 0.000003d - 1e-12, 0.000003d + 1e-12);
        var volatility = Assert.IsType<double>(result.DailyVolatilityPercent);
        Assert.InRange(volatility, 0.000000707106767044412d - 1e-12, 0.000000707106767044412d + 1e-12);
        Assert.NotEqual(Math.Round(result.TotalReturnPercent, 2), result.TotalReturnPercent);
        Assert.NotEqual(Math.Round(volatility, 2), volatility);
    }

    [Fact]
    public void TheFullPositiveDecimalRangeProducesFiniteDoubleStatistics()
    {
        const decimal smallest = 0.0000000000000000000000000001m;
        var result = PriceStatisticsCalculator.Calculate(Points(smallest, decimal.MaxValue, smallest));
        Assert.Equal(0d, result.TotalReturnPercent);
        var volatility = Assert.IsType<double>(result.DailyVolatilityPercent);
        Assert.True(double.IsFinite(volatility));
        Assert.True(volatility > 1e58);
        Assert.Equal(100d, result.MaxDrawdownPercent);

        var flat = PriceStatisticsCalculator.Calculate(Points(decimal.MaxValue, decimal.MaxValue, decimal.MaxValue));
        Assert.Equal(0d, flat.TotalReturnPercent);
        Assert.Equal(0d, Assert.IsType<double>(flat.DailyVolatilityPercent));
        Assert.Equal(0d, flat.MaxDrawdownPercent);
    }

    [Fact]
    public void CalculationDoesNotChangeTheProvidedSeries()
    {
        var points = Points(100m, 80m, 120m, 90m);
        var snapshot = points.ToArray();
        _ = PriceStatisticsCalculator.Calculate(points);
        Assert.Equal(snapshot, points);
    }

    [Fact]
    public void NullAndEmptySeriesAreRejected()
    {
        Assert.Throws<ArgumentNullException>(() => PriceStatisticsCalculator.Calculate(null!));
        Assert.ThrowsAny<ArgumentException>(() => PriceStatisticsCalculator.Calculate(Array.Empty<PricePoint>()));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void NonpositivePricesAreRejected(int price)
    {
        Assert.ThrowsAny<ArgumentException>(() => PriceStatisticsCalculator.Calculate(Points(100m, price, 110m)));
    }

    [Fact]
    public void NullObservationsAreRejected()
    {
        var points = Points(100m, 110m, 120m);
        points[1] = null!;
        Assert.ThrowsAny<ArgumentException>(() => PriceStatisticsCalculator.Calculate(points));
    }

    [Fact]
    public void UnsortedOrDuplicateDatesCannotBeSilentlyReinterpreted()
    {
        var sorted = Points(100m, 110m, 120m);
        PricePoint[] reversed = [sorted[2], sorted[1], sorted[0]];
        PricePoint[] duplicate = [sorted[0], sorted[1] with { Date = sorted[0].Date }, sorted[2]];
        Assert.ThrowsAny<ArgumentException>(() => PriceStatisticsCalculator.Calculate(reversed));
        Assert.ThrowsAny<ArgumentException>(() => PriceStatisticsCalculator.Calculate(duplicate));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void WebJsonPreservesInsufficientVolatilityAsNull(int count)
    {
        var result = PriceStatisticsCalculator.Calculate(Points(100m, 110m).Take(count).ToArray());
        var json = JsonSerializer.Serialize(result, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var document = JsonDocument.Parse(json);
        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("dailyVolatilityPercent").ValueKind);
        Assert.True(double.IsFinite(document.RootElement.GetProperty("totalReturnPercent").GetDouble()));
        Assert.True(double.IsFinite(document.RootElement.GetProperty("maxDrawdownPercent").GetDouble()));
    }

    [Fact]
    public void ExtremeButValidStatisticsSerializeAsFiniteJsonNumbers()
    {
        var result = PriceStatisticsCalculator.Calculate(Points(0.0000000000000000000000000001m, decimal.MaxValue, 1m));
        var json = JsonSerializer.Serialize(result, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var document = JsonDocument.Parse(json);
        foreach (var property in document.RootElement.EnumerateObject())
        {
            Assert.Equal(JsonValueKind.Number, property.Value.ValueKind);
            Assert.True(double.IsFinite(property.Value.GetDouble()));
        }
    }

    private static PricePoint[] Points(params decimal[] prices) => prices
        .Select((price, index) => new PricePoint(new DateOnly(2026, 6, 1).AddDays(index), price))
        .ToArray();

    private static void Close(double expected, double actual)
    {
        Assert.True(double.IsFinite(actual));
        Assert.InRange(Math.Abs(expected - actual), 0, Tolerance);
    }
}
