using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using PharoDashboard.Api.Data;
using Xunit;

namespace PharoDashboard.Api.Tests.Data;

public sealed class CsvMarketDataLoaderTests
{
    private const string Header = "date,ticker,price\n";

    [Fact]
    public void SuppliedDataRetainsItsExactBytesAndAllObservations()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "market_data.csv");
        var hash = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)));

        Assert.Equal("363970ba4e81bf2cf5d890b0be9df93d28bda0819f39ba10796012e4ec231440", hash);

        var store = CsvMarketDataLoader.Load(path);

        Assert.Equal(200, store.Tickers.Length);
        Assert.Equal(store.Tickers.Order(StringComparer.Ordinal), store.Tickers);

        var dates = new HashSet<DateOnly>();
        var observations = 0;

        foreach (var ticker in store.Tickers)
        {
            Assert.True(store.TryGetPrices(ticker, out var prices));
            Assert.Equal(30, prices.Length);
            Assert.Equal(new DateOnly(2026, 6, 23), prices[0].Date);
            Assert.Equal(new DateOnly(2026, 8, 3), prices[^1].Date);
            Assert.Equal(prices.OrderBy(point => point.Date), prices);
            Assert.Equal(prices.Length, prices.Select(point => point.Date).Distinct().Count());
            Assert.All(prices, point => Assert.True(point.Price > 0));

            dates.UnionWith(prices.Select(point => point.Date));
            observations += prices.Length;
        }

        Assert.Equal(6000, observations);
        Assert.Equal(30, dates.Count);
    }

    [Fact]
    public void MissingFileFailsInsteadOfProducingAnEmptyStore()
    {
        var directory = Directory.CreateTempSubdirectory("pharo-csv-missing-");

        try
        {
            Assert.Throws<FileNotFoundException>(() =>
                CsvMarketDataLoader.Load(Path.Combine(directory.FullName, "missing.csv")));
        }
        finally
        {
            directory.Delete(true);
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("\n")]
    [InlineData("date,ticker,price\n")]
    [InlineData("date,ticker,price\n\n\r\n")]
    public void EmptyInputCannotLookLikeAValidDataset(string csv)
    {
        using var reader = new StringReader(csv);

        Assert.Throws<InvalidDataException>(() => CsvMarketDataLoader.Load(reader));
    }

    [Theory]
    [InlineData("ticker,date,price")]
    [InlineData("Date,ticker,price")]
    [InlineData("date,ticker")]
    [InlineData("date,ticker,price,extra")]
    [InlineData("date,ticker,ticker")]
    [InlineData("2026-06-23,AAA,100")]
    public void HeadersMustMatchTheRequiredNamesAndOrder(string header)
    {
        using var reader = new StringReader(header + "\n2026-06-23,AAA,100\n");

        Assert.Throws<InvalidDataException>(() => CsvMarketDataLoader.Load(reader));
    }

    [Theory]
    [InlineData("2026-02-30,AAA,100")]
    [InlineData("06/23/2026,AAA,100")]
    [InlineData("2026-06-23T00:00:00Z,AAA,100")]
    [InlineData("2026-06-23,,100")]
    [InlineData("2026-06-23,   ,100")]
    [InlineData("2026-06-23,BAD TICKER,100")]
    [InlineData("2026-06-23,AAA,not-a-price")]
    [InlineData("2026-06-23,AAA,NaN")]
    [InlineData("2026-06-23,AAA,Infinity")]
    [InlineData("2026-06-23,AAA,0")]
    [InlineData("2026-06-23,AAA,-0.01")]
    [InlineData("2026-06-23,AAA,79228162514264337593543950336")]
    [InlineData("2026-06-23,AAA,\"1,25\"")]
    [InlineData("2026-06-23,AAA")]
    [InlineData("2026-06-23,AAA,100,extra")]
    [InlineData("2026-06-23,\"AAA,100")]
    public void InvalidRowsRejectTheWholeDatasetIncludingEarlierValidRows(string row)
    {
        using var reader = new StringReader(Header + "2026-06-22,GOOD,50\n" + row + "\n");

        var error = Assert.Throws<InvalidDataException>(() => CsvMarketDataLoader.Load(reader));

        Assert.Contains("record", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("AAA")]
    [InlineData("aaa")]
    [InlineData(" AAA ")]
    public void DuplicateDatesAreRejectedAfterTickerNormalization(string duplicateTicker)
    {
        using var reader = new StringReader(Header +
            $"2026-06-23,AAA,100\n2026-06-23,{duplicateTicker},110\n");

        Assert.Throws<InvalidDataException>(() => CsvMarketDataLoader.Load(reader));
    }

    [Theory]
    [InlineData("\n")]
    [InlineData("\r\n")]
    public void Utf8BomQuotedFieldsAndEmptyTrailingRecordsAreSupported(string newline)
    {
        var directory = Directory.CreateTempSubdirectory("pharo-csv-bom-");
        var path = Path.Combine(directory.FullName, "quoted.csv");

        try
        {
            File.WriteAllText(path,
                string.Join(newline, "\"date\",\"ticker\",\"price\"",
                    "\"2026-06-23\",\" aaa \",\"100.125\"", "", ""),
                new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

            var store = CsvMarketDataLoader.Load(path);

            Assert.Equal("AAA", Assert.Single(store.Tickers));
            Assert.True(store.TryGetPrices("AAA", out var prices));
            var observation = Assert.Single(prices);
            Assert.Equal(new DateOnly(2026, 6, 23), observation.Date);
            Assert.Equal(100.125m, observation.Price);
        }
        finally
        {
            directory.Delete(true);
        }
    }

    [Theory]
    [InlineData("\n2026-06-24,AAA,110\n")]
    [InlineData("   \n")]
    [InlineData(",,\n")]
    [InlineData("\"\",\"\",\"\"\n")]
    public void OnlyGenuinelyEmptyTrailingRecordsCanBeIgnored(string suffix)
    {
        using var reader = new StringReader(Header + "2026-06-23,AAA,100\n" + suffix);

        Assert.Throws<InvalidDataException>(() => CsvMarketDataLoader.Load(reader));
    }

    [Theory]
    [InlineData("fr-FR")]
    [InlineData("tr-TR")]
    public void DatesPricesAndTickerCasingAreIndependentOfProcessCulture(string cultureName)
    {
        var originalCulture = CultureInfo.CurrentCulture;
        var originalUiCulture = CultureInfo.CurrentUICulture;

        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(cultureName);
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(cultureName);

            using var reader = new StringReader(Header + "2026-06-23, i.a-1 ,123.4567\n");

            var store = CsvMarketDataLoader.Load(reader);

            Assert.Equal("I.A-1", Assert.Single(store.Tickers));
            Assert.True(store.TryGetPrices(" i.a-1 ", out var prices));
            Assert.Equal(123.4567m, Assert.Single(prices).Price);
        }
        finally
        {
            CultureInfo.CurrentCulture = originalCulture;
            CultureInfo.CurrentUICulture = originalUiCulture;
        }
    }

    [Fact]
    public void UnsortedInputIsGroupedAndSortedChronologicallyWithoutDroppingRows()
    {
        using var reader = new StringReader(Header +
            "2026-06-25,ZZZ,120\n2026-06-24,AAA,21\n" +
            "2026-06-23,zzz,100\n2026-06-23,AAA,20\n2026-06-24,ZZZ,110\n");

        var store = CsvMarketDataLoader.Load(reader);

        Assert.Equal(new[] { "AAA", "ZZZ" }, store.Tickers);
        Assert.True(store.TryGetPrices("ZZZ", out var prices));
        Assert.Equal(new[] { 100m, 110m, 120m }, prices.Select(point => point.Price));
        Assert.Equal(new[] { 23, 24, 25 }, prices.Select(point => point.Date.Day));
        Assert.True(store.TryGetPrices("AAA", out var otherPrices));
        Assert.Equal(new[] { 20m, 21m }, otherPrices.Select(point => point.Price));
    }
}
