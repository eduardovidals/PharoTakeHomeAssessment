using System.Collections.Frozen;
using System.Collections.Immutable;
using PharoDashboard.Api.Features.Instruments;
using PharoDashboard.Api.Features.Prices;

namespace PharoDashboard.Api.Data;

/// <summary>
/// One validated dataset generation, with immutable chronological series and cached sorted tickers.
/// Lookup performs no file access; serialization remains proportional to the returned series.
/// </summary>
public sealed class MarketDataStore
{
    private readonly FrozenDictionary<string, ImmutableArray<PricePoint>> _series;

    internal MarketDataStore(Dictionary<string, List<PricePoint>> series)
    {
        _series = series.ToFrozenDictionary(
            item => item.Key,
            item => item.Value.OrderBy(point => point.Date).ToImmutableArray(),
            StringComparer.Ordinal);
        Tickers = _series.Keys.Order(StringComparer.Ordinal).ToImmutableArray();
    }

    /// <summary>The ordinally sorted canonical identifiers, materialized once at initialization.</summary>
    public ImmutableArray<string> Tickers { get; }

    /// <summary>
    /// Returns the same immutable series for repeated or concurrent reads.
    /// Invalid and unknown identifiers return false instead of a fabricated successful empty series.
    /// </summary>
    public bool TryGetPrices(string? ticker, out ImmutableArray<PricePoint> prices)
    {
        if (Ticker.TryNormalize(ticker, out var canonical) && _series.TryGetValue(canonical, out prices))
        {
            return true;
        }

        prices = ImmutableArray<PricePoint>.Empty;
        return false;
    }
}
