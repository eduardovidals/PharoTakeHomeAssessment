using System.Text.Json.Serialization;

namespace PharoDashboard.Api.Features.Prices;

/// <summary>
/// Unrounded percentage statistics. Daily volatility is nonannualized sample volatility;
/// null is retained in JSON when fewer than three price observations are available.
/// </summary>
public sealed record PriceStatsDto(
    [property: JsonPropertyName("totalReturnPercent")] double TotalReturnPercent,
    [property: JsonPropertyName("dailyVolatilityPercent"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] double? DailyVolatilityPercent,
    [property: JsonPropertyName("maxDrawdownPercent")] double MaxDrawdownPercent);
