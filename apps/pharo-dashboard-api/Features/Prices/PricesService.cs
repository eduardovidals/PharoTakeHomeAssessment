using System.Collections.Frozen;
using System.Collections.Immutable;
using System.Diagnostics.CodeAnalysis;
using PharoDashboard.Api.Data;
using PharoDashboard.Api.Features.Instruments;

namespace PharoDashboard.Api.Features.Prices;

/// <summary>
/// Materializes immutable response series and statistics once for the process dataset.
/// Request lookups perform no file access, mapping or statistical recalculation.
/// </summary>
public sealed class PricesService
{
    private readonly FrozenDictionary<string, PriceSnapshot> _snapshots;

    public PricesService(MarketDataStore store)
    {
        ArgumentNullException.ThrowIfNull(store);

        var snapshots = new Dictionary<string, PriceSnapshot>(StringComparer.Ordinal);

        foreach (var ticker in store.Tickers)
        {
            if (!store.TryGetPrices(ticker, out var prices))
            {
                throw new InvalidOperationException("The market dataset contains an unavailable series.");
            }

            var points = prices.Select(point => new PricePointDto(point.Date, point.Price)).ToImmutableArray();
            var statistics = PriceStatisticsCalculator.Calculate(prices);
            var stats = new PriceStatsDto(
                statistics.TotalReturnPercent,
                statistics.DailyVolatilityPercent,
                statistics.MaxDrawdownPercent);

            snapshots.Add(ticker, new PriceSnapshot(points, stats));
        }

        _snapshots = snapshots.ToFrozenDictionary(StringComparer.Ordinal);
    }

    /// <summary>Returns a cached chronological series for a canonicalizable known ticker.</summary>
    public bool TryGetPrices(string? ticker, out ImmutableArray<PricePointDto> prices)
    {
        if (Ticker.TryNormalize(ticker, out var canonical) && _snapshots.TryGetValue(canonical, out var snapshot))
        {
            prices = snapshot.Points;
            return true;
        }

        prices = ImmutableArray<PricePointDto>.Empty;
        return false;
    }

    /// <summary>Returns precomputed statistics; invalid and unknown identifiers return false.</summary>
    public bool TryGetStats(string? ticker, [NotNullWhen(true)] out PriceStatsDto? stats)
    {
        if (Ticker.TryNormalize(ticker, out var canonical) && _snapshots.TryGetValue(canonical, out var snapshot))
        {
            stats = snapshot.Statistics;
            return true;
        }

        stats = null;
        return false;
    }

    private sealed record PriceSnapshot(ImmutableArray<PricePointDto> Points, PriceStatsDto Statistics);
}
