# Design and tradeoffs

## A fixed dataset with explicit ownership

The API loads the CSV once before readiness, using CsvHelper for quoting and strict validation. Headers must be exactly `date,ticker,price`; dates are valid ISO date-only values, tickers are canonicalizable ASCII identifiers, and prices are positive invariant decimals. Duplicate ticker/date pairs, malformed records and interior blank rows reject the dataset. Only empty trailing records are ignored.

`MarketDataStore` owns a frozen ticker lookup, immutable chronological series and a sorted ticker list. `PricesService` materializes response DTOs and statistics once at startup. Controllers perform synchronous lookup and serialization; they neither reread the file nor recalculate statistics. Lookup is independent of series length; returning the history still requires serializing its observations. This is sufficient for a small immutable assessment dataset and keeps a database or background ingestion service unnecessary.

Stored prices and price JSON retain decimal values. Calculation explicitly converts prices to doubles, including the square root, and rejects non-finite results. No rounding occurs in the calculator or cached response. The browser validates unknown JSON with Zod before it enters the application data layer.

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

TanStack Router owns committed selection in an ordered, comma-separated `tickers` URL parameter and an optional `view=price|performance`. Validation trims, uppercases, deduplicates and keeps the first three valid IDs, with safe normalization/limit feedback. Repeated or wholly invalid values fail safely; syntactically valid unknown IDs remain selected and removable. With `view` absent, selected-key count determines the default: Price for zero/one, Performance for two/three. An explicit view survives selection changes; Clear selection removes both fields. Normal Back/Forward and reload preserve these rules.

A route-owned action queue serializes add, remove, clear and view intentions against the latest URL, including overlapping actions and navigation rejection. It is not another selected-ID store. The React Aria picker owns only its transient search text/open state; ranked matches derive from the one cached instrument list. There is no pagination or search refetch. Modal open state, chart inspection and app-level color/dash allocation are interaction metadata, not copies of query data. React Hook Form remains the separate form package’s responsibility; the picker is not a form submission.

Query keys identify resources individually: instruments, prices per ticker, and statistics per ticker. Dashboard starts selected price/statistics requests in parallel. A slow or failed resource does not block successful siblings. Cache entries remain fresh for the immutable dataset (`staleTime: Infinity`) and unused entries are retained for 30 minutes. There is no polling, focus or reconnect refetch. Transient network/deadline and 5xx failures receive at most two automatic retries; 404, other 4xx, schema failures and cancellations do not retry automatically. Explicit retry buttons target only their transiently failed resource. A 404 offers Remove instead of a futile retry. Retry controls retain keyboard focus while pending; completing an action restores a stable focus target without interrupting a user who has moved elsewhere.

The app-owned Axios client defaults to same-origin `/api` and a 10-second request deadline. Query's AbortSignal reaches the transport, and failures become fixed plain metadata: cancellation, not-found, network, timeout, HTTP or invalid-response. Raw Axios configuration, server bodies and stacks are not rendered. Changing selection uses a different resource key and no prior-ticker placeholder data. Refreshing a changed server dataset requires a new browser application/cache generation.

## Packages and presentation

| Owner | Responsibility |
| --- | --- |
| `apps/pharo-dashboard-api` | CSV/store, pure statistics, thin controllers and .NET tests |
| `apps/pharo-dashboard-ui` | Bootstrap, routes, HTTP/schema/query boundaries and dashboard composition |
| `packages/pharo-react-components` | React Aria buttons, fields, single/multiple comboboxes, tags, dialog, segmented control and spinner without form/query providers |
| `packages/pharo-react-form-components` | Typed RHF/Zod bindings, preserving distinct schema input/output and one form-state owner |
| `packages/pharo-react-charts` | Generic React-owned SVG geometry, independent formatters, recorded-date inspection and shared data-table renderer |
| `packages/pharo-tailwind-plugin` | Shared static Pharo tokens, accessible semantic states and Tailwind source ownership |
| ESLint/Prettier packages and root scripts | Consistent checks and an Nx graph that builds dependency packages before consumers |

The reusable packages expose built ESM and declarations through their public roots. Three separate Storybooks exercise public consumers without an API. This adds more package/build structure than a single-page prototype, but makes base controls, forms and charts independently usable and their boundaries inspectable.

The live dashboard remains at `/`. Its grouped file route is `src/routes/(dashboard)/index.tsx`; the group does not add a `/dashboard` URL. Page UI lives under `-components/Dashboard`, with real children nested in their owner’s `components` directory: toolbar → picker, PriceHistory, ComparisonMatrix and ObservationDialog. Page URL helpers/types live under `-state`, the serialized action hook under `-hooks`, and bootstrap providers under `app/AppProviders`. No old feature-forwarding modules are required. The route generator excludes dash-prefixed support trees and test/story/mock lanes; only genuine route modules receive the `Route` export lint allowance.

React owns chart elements and lifetime; focused D3 modules supply UTC/linear scales, paths and timestamp bisection. `src/lib/dayjs.ts` initializes the UTC plugin once, while `src/utils/date.ts` validates and formats date-only/epoch values. API dates and canonical `<time dateTime>` values stay unchanged. The app adapter preserves raw prices and recorded gaps; no exchange-calendar or weekend observations are fabricated.

Price uses the raw shared numerical domain. Performance creates new point objects using `100 × (price / firstObservedPrice − 1)` from each chronological history’s first non-null observation, which must be positive. It does not round, mutate cached prices or replace the API’s statistics. Invalid bases/nonfinite results remain unavailable, and the UI directs users to raw Price data. Different recorded windows or bases receive an explicit cue with per-series context in the raw-data dialog. The app requests the generic zero baseline only in Performance mode.

Selected IDs keep app-owned color/dash assignments across tags, chart and matrix; pending/unknown histories retain their identities. The same chart instance receives raw or transformed points and mounts when at least one history is available. Its generic renderer sorts copies, represents explicit null gaps and isolated points, and chooses the earlier date on equal-distance inspection ties. Initial inspection uses the latest timestamp; an explicit choice survives valid mode changes and resize, or reconciles to the nearest remaining record. Touch scrolling does not commit an inspection.

Seven callbacks separate X/Y axes, exact detail/table values and spoken dates. The app supplies recorded timestamp candidates and human UTC formatters. The chart measures its container and computed font size, scales label budgets and gutters, and samples readable ticks without changing observations. Its ResizeObserver, ancestor typography observer and owning-window resize listener are retired on replacement/unmount. Ordinary axes remain readable at enlarged text size; full formatter output is retained in titles/details/table.

One chart and one semantic comparison matrix form the primary workspace. The matrix reads independent Query results directly: raw latest close plus the API’s full-window statistics. It does not react to the inspected chart date. Shared range/count context is shown once when truthful, partial histories are qualified, and a compact resource row keeps failures beside healthy values. Metrics disclose concise explanations on demand.

The generic chart retains an inline table by default. With `dataTable={{ mode: 'external', triggerId }}` and a nonblank ID, the consumer explicitly owns a real, accessible data action and table; the chart associates that action through `aria-details` and omits its inline control. The association stays stable while pickers or dialogs temporarily mask the background. This data-table contract does not observe the DOM or infer trigger visibility: a consumer that removes its action must switch to inline mode. An omitted configuration or blank trigger ID retains the inline fallback.

This app supplies the real **View data** button and composes the existing React Aria dialog with the charts package’s shared raw-table renderer. **Raw observations** always reads cached raw series in either chart mode, retains every selected column and union date, and restores focus/scroll without replacing the chart. Instruments with identical ranges, counts and performance bases share one labeled summary; differing or unavailable histories retain separate details. Vertical dialog content and horizontal table overflow remain local; opening the dialog does not lengthen the page.

The app uses a 256px plot below 640px viewport width and the generic 320px plot at larger widths with the default 16px root font; semantic rem tokens scale with text preferences. Legend/readout/controls live outside that measured plot. Mobile presents picker → view control → chart → matrix → View data; desktop places chart and matrix side by side when both fit. A readable matrix can scroll locally. System fonts and one Tailwind-owned semantic token source cover navy/blue/cyan identity, neutral surfaces, signed returns, category colors/dashes and accessible focus states without a second theme registry or copied brand assets.

## Verification and limits

The tests cover strict CSV parsing and immutable store reads, literal calculator cases and all supplied-ticker oracle comparisons, HTTP contracts, real Query/MSW lifetimes and resource failures, schema/form controls, chart geometry and executable stories. Browser lanes consume built packages and run the compiled dashboard against the actual C# API. They separately exercise keyboard/touch/focus, URL history, targeted retries, Price/Performance transformations, complete raw dialog values, focus/scroll restoration and responsive sizing. Additional browser checks exercise UTC timezones, root-font enlargement, 320-CSS-pixel reflow, reduced motion and forced colors; these are browser emulation checks, not claims about a physical device keyboard. DOM-only ResizeObserver witnesses do not establish real browser layout.

This remains a synthetic-data local assessment: no live feed, incremental updates, authentication, durable storage, trading-calendar model, financial recommendations or production deployment are included. A live version would need explicit data-generation/versioning and cache invalidation, operational observability, secured hosting and an ingestion/validation strategy. The current application eagerly bundles shared controls and chart code; build output and the chart consumer's bundle report provide measurements, without a claimed size budget. AI assistance is disclosed in the README; runnable checks, rather than documentation claims, establish the candidate's validation outcome.
