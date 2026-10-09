# Design Overview

## Introduction

This project is a historical instrument dashboard built around the supplied market-data CSV. The main workflow is to search for instruments, select up to three tickers, compare their prices and statistics, and inspect the underlying observations.

The repository separates the dashboard, the C# API, and a focused set of shared packages. Instrument selection and financial presentation belong to the application. Accessible controls, chart rendering, and design tokens are reusable without depending on the dashboard's business logic.

## Approach

The design balances a straightforward assessment experience with clear ownership:

- keep the supplied CSV authoritative
- load each instrument's prices and statistics independently
- use accessible primitives for keyboard, focus, and touch behavior
- share controls and chart behavior where they have a real consumer
- centralize styling, linting, and formatting decisions
- keep financial definitions explicit and testable

The interface focuses on the selected instruments rather than presenting the entire dataset at once. Loading and failures stay close to the affected resource, so a slow request does not prevent comparison of the data already available.

## Monorepo and Package Architecture

The repository uses npm workspaces by default and Nx for dependency-aware builds, tests, and typechecks. npm keeps the reviewer setup to `npm ci`, `npm run build`, and `npm run dev`. npm is the default package manager. Two applications and five shared packages make up the workspace:

- `apps/pharo-dashboard-ui`: the React dashboard, routes, API services, and browser tests
- `apps/pharo-dashboard-api`: CSV ingestion, statistics, HTTP controllers, and .NET tests
- `@pharo/react-components`: shared accessible controls
- `@pharo/react-charts`: line charts, recorded-date inspection, and data tables
- `@pharo/tailwind-plugin`: shared theme tokens and semantic utilities
- `@pharo/eslint-config`: common lint rules
- `@pharo/prettier-config`: common formatting rules

A small workspace-protocol helper supports pnpm as an alternative, following the same local-package convention in both modes. It switches internal dependency references, manager metadata, and the Nx hint without changing external version ranges. Each manager has a committed lockfile and is verified from a clean installation. The tradeoff is maintaining two dependency resolutions; the tracked state always returns to npm. Explicit workspace directories keep private tooling outside both package managers.

The React packages expose built ESM and TypeScript declarations through their public entry points. Controls and charts have separate Storybooks so they can be developed independently of the API. Shared packages contain the components used by the application and their required helpers, keeping the library focused on the assessment.

After the initial workspace build, the root development launcher starts the API and UI, checks readiness, and handles ports and process cleanup. This uses ordinary Node and .NET commands without an Nx .NET plugin. The [README Quick Start](README.md#quick-start) lists the required Node.js, npm, and .NET SDK versions, plus the optional pnpm version. Dependency versions live in package manifests and lockfiles. JavaScript dependencies come from the selected manager's lockfile, and the backend build restores NuGet in locked mode.

## Shared UI Layer

The UI package is built on React Aria Components. React Aria supplies accessible semantics, keyboard navigation, focus management, and overlay behavior, while the wrappers apply Pharo styling and the application's common interaction patterns.

The shared controls include buttons, an icon button, a multi-select combobox, removable tags, a dialog, a segmented control, and a spinner. The Price/Performance control uses React Aria's `ToggleButtonGroup` and `ToggleButton` with single selection and empty selection disabled. The installed React Aria version exposes radio-group semantics: arrow keys move focus, and Enter or Space selects the focused view. The instrument picker composes a multi-select combobox and listbox, with selected instruments shown as removable tags.

Loading remains a presentation concern in the reusable combobox. The application supplies the Query loading state; the component displays an input spinner and an empty-popup loading state. Search results, loading, and errors remain distinct, with error text and Retry outside the listbox options. This keeps fetching in the application while making the wrapper useful wherever the same interaction is needed.

## Styling and Design System

Tailwind CSS and `@pharo/tailwind-plugin` provide the shared design system. Tokens own color, spacing, typography, focus, and control states. Components compose these semantic utilities in owner-local `styles.ts` files, keeping the application and both Storybooks on the same visual language.

The dashboard uses navy, blue, and cyan with neutral analytical surfaces. The layout is compact and readable, with clear selection, disabled, loading, and error states. Stable colors and dash patterns connect selected tags, chart series, and comparison columns. Positive and negative values also use text signs so color is not the only cue.

Day.js UTC initialization and application-owned formatters keep recorded dates consistent across timezones. The dataset does not identify a currency, so prices are displayed without an inferred currency symbol.

## Frontend Architecture

The frontend uses React, TypeScript, Vite, TanStack Router, and TanStack Query. These tools have distinct responsibilities:

- **TanStack Router** owns selected tickers and the chart view in the URL.
- **TanStack Query** owns the instrument list, price histories, and statistics cache.
- **Local React state** owns picker search, dialogs, and chart inspection.
- **Axios and Zod** handle transport and response validation through the API layer.

The dashboard is the `/` route. Its grouped file route composes the page under `-components/Dashboard`; the directory group does not add a `/dashboard` URL. Child components, hooks, types, styles, and pure utilities live under their nearest owner. This makes the dependency structure visible without moving one-use behavior into shared packages.

The `tickers` parameter preserves selection order. Validation trims, uppercases, deduplicates, and retains the first three valid identifiers, with feedback for malformed or excessive selections. Unknown but syntactically valid tickers stay selected and removable, with a visible unavailable-instrument message. An action queue applies overlapping selection changes against the latest URL state rather than keeping a second selection store.

The optional `view=price|performance` parameter preserves an explicit chart choice. Without it, zero or one selected ticker uses Price and two or three use Performance. Clear selection removes both fields; reload and browser Back/Forward follow the same URL rules.

One application bootstrap owns the React root, router history, API client, and Query cache. Disposal unmounts the UI, cancels requests, and releases those resources. This also keeps hot replacement and isolated tests predictable.

## API Layer

The frontend uses the `InstrumentsApi` and `PricesApi` service namespaces. Each plain request function is immediately followed by its corresponding TanStack Query hook in the same service file. Components consume `InstrumentsApi.useGetInstruments()`, `PricesApi.useGetPrices()`, and `PricesApi.useGetPriceStats()`, passing the application client and selected tickers where required.

Query keys, `useQuery`, `useQueries`, and request configuration stay in the API layer. Prices and statistics have independent per-ticker cache entries, and their hooks return results in the requested ticker order. Both resource families start concurrently without waiting for the instrument list. This preserves useful data when one ticker or one endpoint fails.

The injected Axios client defaults to same-origin `/api` with a 10-second timeout. Query's `AbortSignal` reaches the transport, and Zod validates responses before the UI uses them. Failures become typed categories such as not-found, network, timeout, or invalid response, so components can offer useful recovery without showing raw server or Axios errors.

The supplied dataset is immutable for an application session. Queries therefore use an infinite stale time, retain unused entries for 30 minutes, and disable polling and focus/reconnect refetches. Network failures, timeouts, and HTTP 5xx responses receive at most two automatic retries; other failures do not. Explicit retry actions target the affected resource, while missing instruments offer removal. When replacing the CSV, rebuild published output if used, restart the API, and reload the dashboard to recreate the client cache. This keeps startup data and cached responses aligned without adding a live-refresh endpoint.

## Backend Architecture

The supplied CSV is small and fixed, so the C# API loads and validates it once at startup. Immutable histories and precomputed statistics make endpoint reads predictable and avoid repeated parsing or calculation. A controller, service, and data-store structure keeps these responsibilities separate. A changing production source would need ingestion, versioning, and cache invalidation; the assessment does not need a database.

CsvHelper handles CSV quoting, while the loader enforces the domain contract: exactly the `date,ticker,price` header, valid ISO date-only values, canonicalizable ASCII tickers, and positive invariant decimal prices. Duplicate canonical ticker/date pairs, malformed records, and interior blank rows reject the complete dataset. Only empty trailing records are ignored. Missing, empty, or invalid data prevents startup rather than publishing a partial dataset.

The store sorts observations chronologically and exposes a sorted instrument list. `PricesService` prepares response series and statistics once during initialization. Controllers then perform lookup and serialization without rereading the CSV or recalculating statistics.

The API exposes four endpoints:

- `GET /api/instruments`: sorted canonical ticker identifiers
- `GET /api/prices/{ticker}`: chronological price observations
- `GET /api/prices/{ticker}/stats`: full-period financial statistics
- `GET /health`: readiness after dataset initialization

Invalid and unknown tickers return HTTP 404 Problem Details. Unexpected failures use safe summaries without exposing stack traces or filesystem paths. Stored prices and price responses retain decimal values; statistical calculations explicitly convert to doubles and reject non-finite results.

## Financial Calculations

The C# API calculates total return, daily volatility, and maximum drawdown from each instrument's complete chronological history. For positive prices `P[0] … P[n−1]`, the formulas are:

```text
Total return (%) = 100 × (P[n−1] / P[0] − 1)

Simple return r[i] = P[i] / P[i−1] − 1, for i = 1 … n−1
Number of returns m = n − 1
Mean return = sum(r[i]) / m
Daily volatility (%) = 100 × sqrt(sum((r[i] − mean)²) / (m − 1))

Running peak peak[i] = max(P[0] … P[i])
Maximum drawdown (%) = 100 × max((peak[i] − P[i]) / peak[i])
```

Volatility uses two-pass sample variance across consecutive recorded returns. It is not annualized or weighted by the number of calendar days between observations. Fewer than three prices produce unavailable (`null`) volatility; one price produces zero return and drawdown. Maximum drawdown is a nonnegative loss magnitude from the running peak. For `[100, 200, 180]`, total return is `80%`, sample volatility is approximately `77.78174593%`, and maximum drawdown is `10%`.

The comparison matrix always shows the latest recorded close from cached prices and full-period statistics from the API. The frontend does not recalculate those statistics, and inspecting a chart date does not change the matrix. Prices and statistics retain independent loading, error, and retry states.

The chart's Performance view is a separate presentation transform: `100 × (price / firstObservedPrice − 1)`. Each series uses its first non-null observation as a positive base and starts at 0%. The transform creates new chart points without changing cached raw prices. Missing values stay unavailable, and differing series windows or bases receive explanatory context.

Rounding happens only for display, generally to two decimal places. Percentage-point values are not multiplied by 100 again. The application does not invent missing trading dates or adjust prices for corporate actions.

## Testing Strategy

Testing follows the main application boundaries.

### Frontend and Shared Packages

Vitest, React Testing Library, and MSW exercise the actual UI and request flow. Coverage includes response validation, caching, independent loading and retries, cancellation, URL selection, and accessible controls. Shared component and chart tests run independently, with Storybook covering their interactive states.

### Backend

The .NET tests cover strict CSV parsing, immutable store behavior, financial examples, supplied-dataset oracle comparisons, startup failures, and HTTP/Problem Details contracts. Calculation tests include insufficient observations and the distinction between sample and population volatility.

### Browser Workflows

Playwright runs the compiled application against the C# API. It covers selection, URL history, keyboard and touch interaction, focus restoration, recovery, Price/Performance views, chart inspection, raw data, and responsive overflow. Comparison tests check that chart inspection leaves latest closes and backend statistics unchanged. Additional scenarios cover UTC timezones, enlarged text, reduced motion, and forced colors.

`npm run validate` is the primary local verification command; `pnpm run validate` runs the same checks after switching modes. The [README](README.md) describes setup and focused commands. Browser coverage uses automated viewport and input emulation; it does not imply testing on physical devices.

## UX and Accessibility

The workspace keeps instrument selection, the chart, and comparison statistics close together. Larger screens place the chart and matrix side by side; narrow screens stack the sections. The comparison matrix makes horizontal overflow visible, keeps metric labels sticky, and provides a keyboard-focusable scroll region so all three tickers remain reachable. Tables scroll inside their panels instead of widening the page.

The picker searches the cached instrument list without additional requests. At the three-instrument limit, unselected options are visibly disabled while selected instruments remain removable. Clear selection appears only when something is selected, and chart-view controls remain available in the empty state. Initial loading feedback uses Query's `isLoading`, so background fetching does not repeatedly interrupt the picker. Live announcements avoid duplicate loading messages.

React owns the SVG and component lifecycle, while focused D3 modules provide scales, ticks, paths, and timestamp lookup. This keeps updates consistent with React state and makes the geometry testable without a second DOM owner. It also means the application maintains its own accessible inspection and table presentation. The chart displays every supplied observation and adapts to its container and text size. Hover, clicks, completed touch taps, and the keyboard range control inspect recorded dates locally. Native touch scrolling remains available without selecting a point, and inspection stays independent of the comparison statistics.

The reusable chart provides an inline data table by default. The dashboard explicitly supplies `dataTable={{ mode: 'external', triggerId }}` to use its View data action instead. A nonblank trigger ID connects the SVG through `aria-details` and suppresses the chart's inline control. This contract does not observe the DOM or infer visibility, so opening the picker cannot reveal a duplicate control. A consumer removing its external action must switch back to inline mode; omitted configuration or a blank ID uses the inline fallback.

View data opens an accessible Raw observations dialog using the chart package's shared table renderer. It always shows cached raw prices, including in Performance mode, with the union of recorded dates and every selected column. Matching ranges, counts, and performance bases appear once in a shared summary; differing or unavailable histories retain separate context. Dialog content scrolls locally, and closing restores focus.

## Tradeoffs

An immutable in-memory backend and long-lived client cache are appropriate for this fixed dataset. A live market-data application would need explicit data versioning, invalidation, ingestion, authentication, and operational monitoring. Those concerns are outside this assessment.

The shared packages add build coordination, but keep controls, styling, and chart behavior independently testable. Application-specific selection, statistics presentation, and request orchestration stay in the dashboard so the reusable layer remains small.
