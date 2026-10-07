# Design and tradeoffs

## A fixed dataset with explicit ownership

The API loads the CSV once before readiness, using CsvHelper for quoting and strict validation. Headers must be exactly `date,ticker,price`; dates are valid ISO date-only values, tickers are canonicalizable ASCII identifiers, and prices are positive invariant decimals. Duplicate ticker/date pairs, malformed records and interior blank rows reject the dataset. Only empty trailing records are ignored.

`MarketDataStore` owns a frozen ticker lookup, immutable chronological series and a sorted ticker list. `PricesService` materializes response DTOs and statistics once at startup. Controllers perform synchronous lookup and serialization; they neither reread the file nor recalculate statistics. Lookup is independent of series length; returning the history still requires serializing its observations. This is sufficient for a small immutable assessment dataset and keeps a database or background ingestion service unnecessary.

Stored prices and price JSON retain decimal values. Calculation explicitly converts prices to doubles, including the square root, and rejects non-finite results. No rounding occurs in the calculator or cached response. The browser validates unknown JSON with Zod before it enters the feature layer.

## Statistics

For `n` positive chronological prices `P[0] … P[n-1]`, the API returns percentage points:

```text
totalReturnPercent = 100 × (P[n-1] / P[0] − 1)

r[i] = P[i] / P[i-1] − 1, for i = 1 … n-1
m = n − 1
mean = sum(r[i]) / m
dailyVolatilityPercent = 100 × sqrt(sum((r[i] − mean)²) / (m − 1))

peak[i] = max(P[0] … P[i])
maxDrawdownPercent = 100 × max((peak[i] − P[i]) / peak[i])
```

Volatility uses a two-pass sample variance with denominator `m−1`; it is `null` when fewer than two returns exist (`n<3`). One price gives zero return and drawdown. Maximum drawdown is nonnegative and measured from the running prior peak, not simply the first price. For `[100, 200, 180]`, total return is `80%`, sample volatility is approximately `77.78174593%`, and maximum drawdown is `10%`.

The UI formats return with a sign except zero and all numeric metrics to two decimal places. It neither multiplies API values by 100 again nor annualizes volatility. Consecutive recorded observations define “daily” returns; there is no elapsed-time weighting, missing-calendar-day filling or corporate-action adjustment.

## Browser state and transport

One application bootstrap owns its React root, Router/history, Axios client and Query cache. Disposal unmounts the root, cancels outstanding queries, clears the cache and releases history; the same ownership also supports hot replacement and isolated tests.

The route owns committed selection in an ordered, comma-separated `tickers` URL parameter. Validation trims, uppercases, deduplicates and keeps the first three valid IDs, with safe normalization/limit feedback. Repeated or wholly invalid values fail safely. React Hook Form owns only the search draft; matching is derived without rewriting what the user typed. Paging and temporary interaction feedback remain local to the selector. No second selected-ID or response store is maintained.

Query keys identify resources individually: instruments, prices per ticker, and statistics per ticker. Dashboard starts selected price/statistics requests in parallel. A slow or failed resource does not block successful siblings. Cache entries remain fresh for the immutable dataset (`staleTime: Infinity`) and unused entries are retained for 30 minutes. There is no polling, focus or reconnect refetch. Transient network/deadline and 5xx failures receive at most two automatic retries; 404, other 4xx, schema failures and cancellations do not retry automatically. Explicit retry buttons target only their resource.

The app-owned Axios client defaults to same-origin `/api` and a 10-second request deadline. Query's AbortSignal reaches the transport, and failures become fixed plain metadata: cancellation, not-found, network, timeout, HTTP or invalid-response. Raw Axios configuration, server bodies and stacks are not rendered. Changing selection uses a different resource key and no prior-ticker placeholder data. Refreshing a changed server dataset requires a new browser application/cache generation.

## Packages and presentation

| Owner | Responsibility |
| --- | --- |
| `apps/pharo-dashboard-api` | CSV/store, pure statistics, thin controllers and .NET tests |
| `apps/pharo-dashboard-ui` | Bootstrap, routes, HTTP/schema/query boundaries and dashboard composition |
| `packages/pharo-react-components` | React Aria button, text field, combobox and spinner without form/query providers |
| `packages/pharo-react-form-components` | Typed RHF/Zod bindings, preserving distinct schema input/output and one form-state owner |
| `packages/pharo-react-charts` | Generic React-owned SVG geometry, observation inspection and data alternative |
| `packages/pharo-tailwind-plugin` | Shared static Pharo tokens, accessible semantic states and Tailwind source ownership |
| ESLint/Prettier packages and root scripts | Consistent checks and an Nx graph that builds dependency packages before consumers |

The reusable packages expose built ESM and declarations through their public roots. Three separate Storybooks exercise public consumers without an API. This adds more package/build structure than a single-page prototype, but makes base controls, forms and charts independently usable and their boundaries inspectable.

React owns chart elements and lifetime; focused D3 modules supply UTC/linear scales, paths and timestamp bisection. The feature adapter maps date-only strings to UTC midnight and preserves raw prices. All selected IDs are passed to the same chart instance, with empty points for unavailable histories, so arrival/removal does not assign another active series a different identity. The chart mounts only when at least one actual history is available.

The chart shares raw-price domains, sorts copies and retains stable color/dash slots by ID. It represents explicit null gaps and isolated points without inventing observations. Inspection uses the union of recorded timestamps and chooses the earlier date on equal-distance ties; missing or absent values are `Unavailable`. A native range supports keyboard navigation, and a full table with named local horizontal scrolling exposes every record. Touch scrolling does not commit inspection. Complete formatter output remains available in details/table while axes avoid overlapping labels.

The measured plot retains its 320px default height; legend, controls, details and disclosure live outside that observed box. Responsive layout follows the actual chart width, including compact details inside a desktop container. Semantic tokens, system fonts and authored SVG marks keep presentation consistent without a theme registry or external brand assets.

## Verification and limits

The tests cover strict CSV parsing and immutable store reads, literal calculator cases and all supplied-ticker oracle comparisons, HTTP contracts, real Query/MSW lifetimes and resource failures, schema/form controls, chart geometry and executable stories. Browser lanes consume built packages and run the compiled dashboard against the actual C# API. They separately exercise keyboard/touch/focus, URL history, targeted retries, responsive sizing and data-table values. DOM-only ResizeObserver witnesses do not establish real browser layout.

This remains a synthetic-data local assessment: no live feed, incremental updates, authentication, durable storage, trading-calendar model, financial recommendations or production deployment are included. A live version would need explicit data-generation/versioning and cache invalidation, operational observability, secured hosting and an ingestion/validation strategy. The current application eagerly bundles shared controls, forms and chart code; build output and the chart consumer's bundle report provide measurements, without a claimed size budget. AI assistance is disclosed in the README; runnable checks, rather than documentation claims, establish the candidate's validation outcome.
