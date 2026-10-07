using System.Text.Json.Serialization;

namespace PharoDashboard.Api.Features.Prices;

/// <summary>A date-only closing price, preserving the stored decimal value in JSON.</summary>
public sealed record PricePointDto(
    [property: JsonPropertyName("date")] DateOnly Date,
    [property: JsonPropertyName("price")] decimal Price);
