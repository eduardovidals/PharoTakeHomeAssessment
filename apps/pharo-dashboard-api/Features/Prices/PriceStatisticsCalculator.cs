namespace PharoDashboard.Api.Features.Prices;

/// <summary>
/// Calculates statistics from a nonempty, strictly chronological series of positive prices.
/// </summary>
public static class PriceStatisticsCalculator
{
    /// <summary>
    /// Calculates total return, sample daily volatility and maximum running-peak drawdown.
    /// </summary>
    /// <remarks>
    /// Stored decimal prices are explicitly converted to double for all calculations,
    /// including the square root. Simple returns and two-pass sample variance retain their
    /// available precision; values are never rounded or annualized. One observation has
    /// zero return and drawdown. One or two observations have null sample volatility.
    /// The input is read into a local price snapshot and is never sorted or modified.
    /// </remarks>
    /// <exception cref="ArgumentNullException">The series is null.</exception>
    /// <exception cref="ArgumentException">
    /// The series is empty, contains a null observation or a nonpositive price,
    /// or its dates are not strictly increasing.
    /// </exception>
    /// <exception cref="ArithmeticException">A numerical result is not finite.</exception>
    public static PriceStatistics Calculate(IReadOnlyList<PricePoint> chronologicalPrices)
    {
        ArgumentNullException.ThrowIfNull(chronologicalPrices);
        if (chronologicalPrices.Count == 0)
        {
            throw new ArgumentException("At least one price observation is required.", nameof(chronologicalPrices));
        }

        var prices = new double[chronologicalPrices.Count];
        DateOnly? previousDate = null;

        for (var index = 0; index < prices.Length; index++)
        {
            var observation = chronologicalPrices[index];

            if (observation is null || observation.Price <= 0)
            {
                throw new ArgumentException("Every observation must contain a positive price.", nameof(chronologicalPrices));
            }

            if (previousDate is not null && observation.Date <= previousDate.Value)
            {
                throw new ArgumentException("Observation dates must be strictly increasing.", nameof(chronologicalPrices));
            }

            prices[index] = RequireFinite((double)observation.Price);
            previousDate = observation.Date;
        }

        var totalReturnPercent = RequireFinite(100 * (prices[^1] / prices[0] - 1));

        var peak = prices[0];
        var maximumDrawdown = 0.0;

        for (var index = 1; index < prices.Length; index++)
        {
            peak = Math.Max(peak, prices[index]);
            var drawdown = (peak - prices[index]) / peak;
            maximumDrawdown = Math.Max(maximumDrawdown, drawdown);
        }

        double? dailyVolatilityPercent = null;

        if (prices.Length >= 3)
        {
            var returns = new double[prices.Length - 1];
            var returnSum = 0.0;

            for (var index = 0; index < returns.Length; index++)
            {
                returns[index] = RequireFinite(prices[index + 1] / prices[index] - 1);
                returnSum += returns[index];
            }

            var mean = RequireFinite(returnSum / returns.Length);
            var squaredDeviationSum = 0.0;

            foreach (var dailyReturn in returns)
            {
                var deviation = dailyReturn - mean;
                squaredDeviationSum += deviation * deviation;
            }

            var sampleVariance = RequireFinite(squaredDeviationSum / (returns.Length - 1));
            dailyVolatilityPercent = RequireFinite(100 * Math.Sqrt(sampleVariance));
        }

        return new PriceStatistics(
            totalReturnPercent,
            dailyVolatilityPercent,
            RequireFinite(100 * maximumDrawdown));
    }

    private static double RequireFinite(double value)
    {
        if (!double.IsFinite(value))
        {
            throw new ArithmeticException("Price statistics must remain finite.");
        }

        return value;
    }
}
