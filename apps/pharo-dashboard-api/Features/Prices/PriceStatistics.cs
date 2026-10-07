namespace PharoDashboard.Api.Features.Prices;

/// <summary>
/// Immutable percentage-valued statistics without display rounding.
/// Daily volatility is the nonannualized sample standard deviation of simple returns;
/// null means fewer than two returns are available. Drawdown is a nonnegative magnitude.
/// </summary>
public sealed record PriceStatistics(
    double TotalReturnPercent,
    double? DailyVolatilityPercent,
    double MaxDrawdownPercent);
