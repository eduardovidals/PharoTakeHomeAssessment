using System.Collections.Immutable;
using PharoDashboard.Api.Data;

namespace PharoDashboard.Api.Features.Instruments;

/// <summary>Exposes the dataset's immutable, ordinally sorted canonical ticker list.</summary>
public sealed class InstrumentsService
{
    public InstrumentsService(MarketDataStore store)
    {
        ArgumentNullException.ThrowIfNull(store);

        Tickers = store.Tickers;
    }

    /// <summary>The cached ticker list; requests perform no file access or sorting.</summary>
    public ImmutableArray<string> Tickers { get; }
}
