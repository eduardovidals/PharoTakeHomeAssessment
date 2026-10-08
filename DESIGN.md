# Design overview

## Approach

The dashboard lets a reviewer search the supplied instrument list, select up to three tickers, compare their historical prices and statistics, and inspect the underlying observations. The implementation keeps the fixed CSV authoritative, loads independent resources concurrently, and gives each application or package a clear responsibility.

The searchable picker provides access to all instruments while the main workspace focuses on the selected comparison. Loading, unavailable data, and request failures remain visible beside successful resources. Price and Performance views, historical date selection, and raw observations share the same cached histories.

## Monorepo and package architecture

pnpm workspaces connect two applications and five shared packages. Nx orchestrates dependency-aware builds, typechecks, tests, and other validation targets. The root development launcher owns API/UI processes, readiness checks, port handling, and cleanup; the repository does not use an Nx .NET plugin. Node, pnpm, and the .NET SDK are pinned for reproducible setup.

| Owner | Responsibility |
| --- | --- |
| `apps/pharo-dashboard-api` | CSV ingestion, immutable store, statistics, HTTP controllers, and .NET tests |
| `apps/pharo-dashboard-ui` | Application lifecycle, routes, API services, comparison logic, dashboard composition, and browser tests |
| `packages/pharo-react-components` | Reusable React Aria buttons, multi-select combobox, tags, dialog, segmented control, and spinner |
| `packages/pharo-react-charts` | Generic line-chart geometry, recorded-date inspection, and accessible data-table rendering |
| `packages/pharo-tailwind-plugin` | Shared Tailwind tokens and semantic visual states |
| `packages/pharo-eslint-config` | Shared lint configuration |
| `packages/pharo-prettier-config` | Shared formatting configuration |

The reusable UI packages expose built ESM and TypeScript declarations through their public roots. Separate controls and chart Storybooks exercise those packages without the API. Financial selection and statistics stay in the application; shared packages do not import dashboard-specific types. The repository retains components with production consumers and their required helpers, without an unused form-component package.

The dashboard is the `/` route. Its grouped file route, `src/routes/(dashboard)/index.tsx`, composes page UI under `-components/Dashboard`. Substantial child components live recursively under their nearest owner's `components` directory. Owner-local hooks, `types.ts`, `styles.ts`, and pure utilities keep behavior close to its consumer; shared helpers move only to their nearest common owner. The route group does not introduce a `/dashboard` URL.

## Backend and strict CSV ingestion

ASP.NET Core loads `Data/market_data.csv` before reporting readiness. CsvHelper handles quoting, while the loader requires exactly the `date,ticker,price` header, valid ISO date-only values, canonicalizable ASCII tickers, and positive invariant decimal prices. Duplicate canonical ticker/date pairs, malformed records, and interior blank rows reject the complete dataset. Empty trailing records are ignored. Invalid or unavailable input prevents startup.

`MarketDataStore` sorts observations by date into immutable series, freezes ticker lookup, and materializes a sorted instrument list. The CSV does not need to arrive in chronological row order. `PricesService` prepares response series and statistics once for that dataset generation. Controllers perform lookup and serialization without rereading the file or recalculating statistics; history serialization still scales with the number of returned observations.

| Endpoint                         | Response                                                   |
| -------------------------------- | ---------------------------------------------------------- |
| `GET /api/instruments`           | Sorted canonical ticker identifiers                        |
| `GET /api/prices/{ticker}`       | Chronological date/price observations                      |
| `GET /api/prices/{ticker}/stats` | Full-period return, daily volatility, and maximum drawdown |
| `GET /health`                    | Readiness after successful dataset initialization          |

Invalid or unknown tickers return HTTP 404 Problem Details. Unexpected server failures return safe summaries without exposing stacks, request internals, or filesystem paths. Stored prices and price JSON retain decimal values. Statistical calculations explicitly convert prices to doubles, reject non-finite results, and retain unrounded output.

## Financial calculations and comparison dates

For positive chronological prices `P[0] … P[n−1]`, statistics are expressed in percentage points:

```text
Total return (%) = 100 × (P[n−1] / P[0] − 1)

Simple return r[i] = P[i] / P[i−1] − 1, for i = 1 … n−1
Number of returns m = n − 1
Mean return = sum(r[i]) / m
Daily volatility (%) = 100 × sqrt(sum((r[i] − mean)²) / (m − 1))

Running peak peak[i] = max(P[0] … P[i])
Maximum drawdown (%) = 100 × max((peak[i] − P[i]) / peak[i])
```

Volatility uses two-pass sample variance across consecutive recorded returns. It is not annualized or weighted by elapsed calendar time. With fewer than three prices, sample volatility is unavailable (`null`); one price yields zero total return and drawdown. Maximum drawdown is a nonnegative loss magnitude measured from the running peak. For `[100, 200, 180]`, total return is `80%`, sample volatility is approximately `77.78174593%`, and maximum drawdown is `10%`.

Latest is the default comparison state. It shows each instrument's latest recorded close and the API's full-period statistics. Pinning a historical date calculates statistics from the first available observation through that date, inclusive, using the existing Query-cached history. Owner-local pure utilities match the backend's operation order and formulas; date selection adds no endpoint or request. Back to latest restores the API statistics.

Closing price requires an observation on the exact pinned date and is never carried forward. If that instrument has no observation on the selected date, its close is labeled “No observation,” while statistics still use the available inclusive prefix. A cutoff before its first observation has no available statistics. Period labels show the calculation range and count, including the last recorded date when it differs from the pin. Identical periods share one summary; differing periods retain ticker labels. A full-period statistics request failure does not hide healthy historical calculations from a cached price series.

The UI rounds only for display, generally to two decimal places. Return includes a sign except at zero. Percentage-point values are not multiplied by 100 again. Missing observations remain unavailable; the application does not fabricate trading-calendar records, adjust corporate actions, or infer a currency from the dataset.

## Frontend state ownership

One application bootstrap owns the React root, Router/history, Axios client, and Query cache. Disposal unmounts the UI, cancels requests, clears the cache, and releases history. This lifecycle also supports hot replacement and isolated tests.

TanStack Router owns ordered instrument selection in the `tickers` URL parameter and optional `view=price|performance`. Validation trims, uppercases, deduplicates, and keeps the first three valid identifiers, with feedback for invalid or limited selections. Syntactically valid unknown tickers remain selected and removable. Without an explicit view, zero or one selected ticker uses Price and two or three use Performance. An explicit view survives selection changes. Clear selection removes both URL fields; browser Back/Forward and reload preserve the URL rules.

A route-owned action queue applies overlapping add, remove, clear, and view intentions against the latest URL state. It does not maintain a second selected-ticker store. Picker search text, popover/dialog visibility, and chart preview are local interaction state. The dashboard owns one pinned comparison timestamp shared by chart and date navigation; null means Latest. Clearing every instrument resets the pin, while changing chart mode preserves it. The pin is not persisted in the URL. Stable app-owned color/dash assignments connect tags, plotted series, and comparison columns without duplicating financial data.

TanStack Query owns the instrument list and separate price-history/statistics resources for each ticker. The dashboard starts both per-ticker resource families independently of instrument-list availability. A slow or failed resource does not block healthy siblings. The immutable dataset uses `staleTime: Infinity`, retains unused cache entries for 30 minutes, and disables polling, focus refetch, and reconnect refetch. A changed server dataset requires a new application/cache generation.

## API services and error handling

Each API request function is immediately followed by its corresponding Query hook in the same service file. Feature barrels expose `InstrumentsApi` and `PricesApi` namespaces. Components use the public hooks:

```tsx
const instruments = InstrumentsApi.useGetInstruments(apiClient);

const prices = PricesApi.useGetPrices(apiClient, selectedTickers);

const statistics = PricesApi.useGetPriceStats(apiClient, selectedTickers);
```

`useGetInstruments` owns a single `useQuery`; the price and statistics hooks own `useQueries` and return independent results aligned with the supplied ticker order. Canonical resource keys preserve deduplication and cache reuse across selection changes. Query configuration stays inside the API layer, with `queryOptions` used only as an internal service implementation detail. There are no exported query-options factories for feature components.

The injected Axios client defaults to same-origin `/api` and a 10-second deadline. Query's `AbortSignal` reaches the transport, and Zod validates responses before they enter the application data layer. Failures become safe typed metadata for cancellation, not-found, network, timeout, HTTP, or invalid-response outcomes. The UI does not display raw Axios exceptions or server response bodies.

Central Query defaults permit at most two automatic retries after the initial attempt for network failures, deadlines, and HTTP 5xx responses. HTTP 404, other 4xx responses, invalid payloads, and cancellation do not retry automatically. Explicit retry actions target the failed resource; missing instruments offer removal. Changing selection uses a different resource key without prior-ticker placeholder data, and obsolete requests are cancelled when their observers leave.

## React Aria, styling, and responsive behavior

React Aria primitives provide selection, keyboard navigation, focus management, and dialog behavior. `PharoMultiComboBox` composes a multi-select `ComboBox`, `ListBox`, and removable tags. Search ranks the one cached instrument list without pagination or additional fetches. At the three-instrument limit, unselected options are visibly disabled while selected instruments remain removable. Clear selection appears only when something is selected; chart-view controls remain available in the empty state. The Price/Performance control uses a `RadioGroup` with radio-keyboard semantics.

Autocomplete loading is a presentation prop on the reusable wrapper. The application supplies Query's initial `isLoading` state, so background refetches do not replace normal picker feedback with a loading spinner. A small spinner sits at the input's right edge; an open empty popup shows centered loading feedback. Live status is announced without competing duplicate messages. Empty results and request errors have distinct text, and error/Retry controls sit outside the ListBox options.

Comparison date navigation uses React Aria's `DatePicker`, segmented `DateInput`, and `Calendar` popup. Dates map to UTC midnight. Recorded observations determine available calendar dates and Previous/Next navigation. Latest displays the latest recorded date with a Latest label and accessible full-history description, while the dashboard's pin remains null. An explicit date choice pins the comparison; Back to latest restores full-period statistics without blanking the field. A pin remains explicit when a changed instrument selection lacks that date, preserving truthful unavailable values.

Tailwind tokens in `@pharo/tailwind-plugin` own color, spacing, typography, focus, and control states. Owner-local `styles.ts` files compose those semantic utilities. The interface uses navy/blue/cyan identity, neutral analytical surfaces, textual positive/negative signs, and stable series colors/dashes. Day.js UTC initialization and app-owned date formatters keep display dates consistent across timezones.

Desktop presents chart and matrix side by side when space permits. Mobile stacks selection, view controls, chart, matrix, and View data. The comparison matrix advertises horizontal overflow, keeps metric labels sticky, and provides a keyboard-focusable scroll region so every selected instrument remains reachable. Wide tables scroll within their panels rather than expanding the page. Plot-height tokens use 16rem below the small breakpoint, 20rem above it, and a compact 17rem at the extra-large breakpoint; text preferences scale these values.

## Chart and raw-data workflow

React owns SVG rendering and component lifetime. Focused D3 modules provide UTC/linear scales, ticks, paths, and timestamp lookup. The chart measures its container and text size to choose readable labels without changing observations. Resize and typography listeners are cleaned up with their owner.

Price plots recorded raw values on a shared numeric scale. Performance creates new points using `100 × (price / firstObservedPrice − 1)`, using each series' first non-null observation as its base, which must be positive. Each valid series starts at 0%. It preserves raw cached prices, gaps, and the financial-statistics definitions. Invalid bases or non-finite transformed values remain unavailable. Different recorded windows or bases receive explicit context.

Chart hover is a temporary local preview with recorded-point markers. Clicks, completed touch taps, and keyboard/range actions commit a comparison date. Leaving the plot restores the pinned/latest readout; hover does not change or recompute the matrix. Keyboard navigation stays anchored to the committed date, and touch scrolling does not commit a selection.

The generic chart provides an inline data table by default. A consumer can explicitly supply `dataTable={{ mode: 'external', triggerId }}` with a nonblank ID to own the accessible trigger and table. The chart then links the action through SVG `aria-details` and omits its inline control. This contract does not observe the DOM or infer trigger visibility, so temporarily masked backgrounds during picker/dialog use cannot reveal a duplicate control. Consumers that remove their external action must switch back to inline mode; omitted configuration or a blank ID uses the inline fallback.

The dashboard supplies the View data button and an accessible Raw observations dialog using the chart package's shared table renderer. It always reads cached raw prices, including in Performance mode, retaining every selected column and the union of recorded dates. Identical ranges, counts, and performance bases share one labeled metadata summary; differing or unavailable histories keep separate details. Dialog content and table overflow scroll locally, and closing returns focus without replacing the chart.

## Testing and tradeoffs

Backend tests cover strict CSV parsing, immutable store behavior, literal financial examples, supplied-ticker oracle comparisons, startup failures, and HTTP/Problem Details contracts. Vitest, Testing Library, and MSW exercise real API validation and Query lifecycles, canonical caching, independent results, retries, cancellation, late-response isolation, selection, historical calculations, and accessible controls.

Playwright runs the compiled application against the C# API and exercises URL history, keyboard/touch/focus behavior, targeted recovery, Price/Performance views, date selection, raw data, and responsive overflow. Historical comparison coverage checks first-date edge cases and exact backend parity at the final date. Additional browser scenarios cover UTC timezones, enlarged text, narrow reflow, reduced motion, and forced colors. These are automated browser checks, not claims about physical-device testing. Storybook and package tests exercise reusable controls and chart behavior independently.

`pnpm validate` is the primary local verification command. The [README](README.md) provides setup, focused commands, and the AI-assistance disclosure. Documentation describes the verification boundaries; actual command results establish whether a particular checkout passes.

The fixed, synthetic dataset makes an immutable in-memory store and fresh-for-life client cache appropriate for this assessment. A live system would need explicit data versioning, cache invalidation, ingestion, secured hosting, and operational monitoring. Authentication, streaming prices, durable storage, and production deployment are outside the current implementation. Shared packages add build coordination, while keeping generic controls and chart behavior independently testable. The current application eagerly bundles those packages and does not claim a bundle-size budget.
