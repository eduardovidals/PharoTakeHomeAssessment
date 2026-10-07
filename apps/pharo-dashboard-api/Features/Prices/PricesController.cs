using System.Collections.Immutable;
using Microsoft.AspNetCore.Mvc;

namespace PharoDashboard.Api.Features.Prices;

/// <summary>Serves cached price observations and statistics without recalculating per request.</summary>
[ApiController]
[Route("api/prices")]
public sealed class PricesController(PricesService pricesService) : ControllerBase
{
    [HttpGet("{ticker}")]
    [ProducesResponseType<ImmutableArray<PricePointDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<ImmutableArray<PricePointDto>> GetPrices(string? ticker)
    {
        return pricesService.TryGetPrices(ticker, out var prices)
            ? Ok(prices)
            : InstrumentNotFound();
    }

    [HttpGet("{ticker}/stats")]
    [ProducesResponseType<PriceStatsDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<PriceStatsDto> GetStats(string? ticker)
    {
        return pricesService.TryGetStats(ticker, out var stats)
            ? Ok(stats)
            : InstrumentNotFound();
    }

    private ObjectResult InstrumentNotFound() => Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "Instrument not found",
        detail: "No market data is available for the requested instrument.",
        type: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.5");
}
