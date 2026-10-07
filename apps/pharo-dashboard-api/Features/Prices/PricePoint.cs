namespace PharoDashboard.Api.Features.Prices;

/// <summary>
/// An immutable date-only closing-price observation from the supplied dataset.
/// Prices retain decimal precision; presentation and statistical conversion belong to consumers.
/// </summary>
public sealed record PricePoint(DateOnly Date, decimal Price);
