using PharoDashboard.Api.Data;
using PharoDashboard.Api.Features.Prices;
using Xunit;

namespace PharoDashboard.Api.Tests.Data;

public sealed class MarketDataStoreTests
{
    private const string Csv = "date,ticker,price\n2026-06-24,BBB,120\n" +
        "2026-06-23,AAA,20\n2026-06-23,BBB,100\n";

    [Fact]
    public void ExposedSeriesAndTickerCollectionsCannotMutateTheStoredGeneration()
    {
        using var reader = new StringReader(Csv);

        var store = CsvMarketDataLoader.Load(reader);
        var tickers = store.Tickers;

        Assert.True(store.TryGetPrices("BBB", out var prices));

        var changedTickers = tickers.SetItem(0, "CHANGED");
        var changedPrices = prices.SetItem(0, prices[0] with { Price = 999m });

        Assert.Equal("CHANGED", changedTickers[0]);
        Assert.Equal(999m, changedPrices[0].Price);

        IList<string> writableTickers = tickers;
        IList<PricePoint> writablePrices = prices;

        Assert.Throws<NotSupportedException>(() => writableTickers[0] = "CHANGED");
        Assert.Throws<NotSupportedException>(() => writablePrices[0] = new PricePoint(new DateOnly(2026, 6, 23), 999m));
        Assert.Equal(new[] { "AAA", "BBB" }, store.Tickers);
        Assert.True(store.TryGetPrices("BBB", out var unchanged));
        Assert.Equal(100m, unchanged[0].Price);
        Assert.Equal(tickers, store.Tickers);
        Assert.Equal(prices, unchanged);
    }

    [Fact]
    public async Task ParallelReadsReuseTheImmutableGenerationWithoutReadingTheSourceAgain()
    {
        using var reader = new CountingReader(Csv);

        var store = CsvMarketDataLoader.Load(reader);

        Assert.False(reader.WasDisposed);
        Assert.True(reader.ReadCalls > 0);

        var readCountAfterLoading = reader.ReadCalls;
        reader.RejectFurtherReads = true;
        reader.Dispose();

        var tickers = store.Tickers;
        Assert.True(store.TryGetPrices("BBB", out var expected));

        var reads = Enumerable.Range(0, 128).Select(async _ =>
        {
            await Task.Yield();

            Assert.Equal(tickers, store.Tickers);
            Assert.True(store.TryGetPrices(" bbb ", out var current));
            Assert.Equal(expected, current);
            Assert.Equal(new[] { 100m, 120m }, current.Select(point => point.Price));
        });

        await Task.WhenAll(reads);

        Assert.Equal(readCountAfterLoading, reader.ReadCalls);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("MISSING")]
    [InlineData("BAD TICKER")]
    public void MissingOrInvalidTickersDoNotInventAStoredSeries(string? ticker)
    {
        using var reader = new StringReader(Csv);

        var store = CsvMarketDataLoader.Load(reader);

        Assert.False(store.TryGetPrices(ticker, out _));
        Assert.Equal(new[] { "AAA", "BBB" }, store.Tickers);
    }

    private sealed class CountingReader(string content) : StringReader(content)
    {
        public int ReadCalls { get; private set; }
        public bool RejectFurtherReads { get; set; }
        public bool WasDisposed { get; private set; }

        public override int Read()
        {
            CountRead();
            return base.Read();
        }

        public override int Read(char[] buffer, int index, int count)
        {
            CountRead();
            return base.Read(buffer, index, count);
        }

        public override int Read(Span<char> buffer)
        {
            CountRead();
            return base.Read(buffer);
        }

        public override string? ReadLine()
        {
            CountRead();
            return base.ReadLine();
        }

        protected override void Dispose(bool disposing)
        {
            WasDisposed = true;
            base.Dispose(disposing);
        }

        private void CountRead()
        {
            ReadCalls++;
            if (RejectFurtherReads) throw new InvalidOperationException("Source reader was reused after loading.");
        }
    }
}
