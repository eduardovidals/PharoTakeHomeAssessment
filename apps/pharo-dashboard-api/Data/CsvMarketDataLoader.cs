using System.Globalization;
using System.Text;
using CsvHelper;
using CsvHelper.Configuration;
using PharoDashboard.Api.Features.Instruments;
using PharoDashboard.Api.Features.Prices;

namespace PharoDashboard.Api.Data;

/// <summary>
/// Reads a complete market dataset with CsvHelper's RFC-style quoting and strict domain validation.
/// A malformed record rejects the whole dataset; no partial store is published.
/// </summary>
public static class CsvMarketDataLoader
{
    /// <summary>Owns and closes a UTF-8 file reader, including normal BOM detection.</summary>
    public static MarketDataStore Load(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        using var reader = new StreamReader(path, new UTF8Encoding(false, true), detectEncodingFromByteOrderMarks: true);

        return Load(reader);
    }

    /// <summary>
    /// Reads once from the caller's current position and leaves that reader open.
    /// Dates are exact ISO date-only values; decimal prices use invariant floating syntax without thousands separators.
    /// Only genuinely empty physical records at the end are ignored.
    /// </summary>
    public static MarketDataStore Load(TextReader reader)
    {
        ArgumentNullException.ThrowIfNull(reader);

        // StreamReader removes an encoding BOM; an arbitrary supplied TextReader may still expose it.
        if (reader.Peek() == '\uFEFF') reader.Read();

        var configuration = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord = true,
            IgnoreBlankLines = false,
            TrimOptions = TrimOptions.None,
            ExceptionMessagesContainRawData = false,
        };

        using var csv = new CsvReader(reader, configuration, leaveOpen: true);

        try
        {
            if (!csv.Read()) throw new InvalidDataException("Market data requires the date,ticker,price header.");

            csv.ReadHeader();
            var header = csv.HeaderRecord;
            string[] expectedHeaders = ["date", "ticker", "price"];

            if (header is null || !header.SequenceEqual(expectedHeaders, StringComparer.Ordinal))
            {
                throw new InvalidDataException("Market data headers must be exactly date,ticker,price.");
            }

            var series = new Dictionary<string, List<PricePoint>>(StringComparer.Ordinal);
            var observations = new HashSet<(string Ticker, DateOnly Date)>();
            var trailingEmptyRecords = false;

            while (csv.Read())
            {
                if (csv.Parser.RawRecord.TrimEnd('\r', '\n').Length == 0)
                {
                    trailingEmptyRecords = true;
                    continue;
                }

                if (trailingEmptyRecords)
                {
                    throw InvalidRecord(csv, "Empty records are permitted only at the end");
                }

                var fields = csv.Parser.Record;

                if (fields is null || fields.Length != 3)
                {
                    throw InvalidRecord(csv, "Expected exactly three fields");
                }

                if (!DateOnly.TryParseExact(fields[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                {
                    throw InvalidRecord(csv, "Date must be a valid yyyy-MM-dd value");
                }

                if (!Ticker.TryNormalize(fields[1], out var ticker))
                {
                    throw InvalidRecord(csv, "Ticker must contain 1–32 permitted ASCII characters");
                }

                if (!decimal.TryParse(fields[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var price) || price <= 0)
                {
                    throw InvalidRecord(csv, "Price must be a positive finite decimal without thousands separators");
                }

                if (!observations.Add((ticker, date)))
                {
                    throw InvalidRecord(csv, "Duplicate canonical ticker/date observation");
                }

                if (!series.TryGetValue(ticker, out var points))
                {
                    points = [];
                    series.Add(ticker, points);
                }

                points.Add(new PricePoint(date, price));
            }

            if (series.Count == 0)
            {
                throw new InvalidDataException("Market data must contain at least one price observation.");
            }

            return new MarketDataStore(series);
        }
        catch (CsvHelperException error)
        {
            throw new InvalidDataException($"Invalid CSV syntax at record {csv.Parser.Row}.", error);
        }
    }

    private static InvalidDataException InvalidRecord(CsvReader csv, string reason) =>
        new($"Invalid market data record {csv.Parser.Row}: {reason}.");
}
