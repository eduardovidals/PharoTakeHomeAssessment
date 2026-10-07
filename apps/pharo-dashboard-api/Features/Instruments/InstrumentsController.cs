using System.Collections.Immutable;
using Microsoft.AspNetCore.Mvc;

namespace PharoDashboard.Api.Features.Instruments;

/// <summary>Serves the available instruments from the immutable process dataset.</summary>
[ApiController]
[Route("api/instruments")]
public sealed class InstrumentsController(InstrumentsService instrumentsService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<ImmutableArray<string>>(StatusCodes.Status200OK)]
    public ActionResult<ImmutableArray<string>> Get() => Ok(instrumentsService.Tickers);
}
