# Pharo Take Home Assessment

This repository contains the submission for the Pharo take home assessment.

It is organized as an Nx monorepo with:

- an instrument analytics frontend in `apps/pharo-dashboard-ui`
- an ASP.NET Core backend in `apps/pharo-dashboard-api`
- shared UI, chart, styling, and tooling packages in `packages/`

The dashboard lets you search the supplied instrument list, compare up to three tickers, and inspect their historical prices. The comparison matrix shows the latest closing price and full-period statistics for each selected instrument.

## Tech Stack

### Frontend

- React and TypeScript
- Vite
- TanStack Router
- TanStack Query
- React Aria Components
- D3
- Tailwind CSS
- Day.js for UTC date formatting
- Axios and Zod

### Backend

- C# / ASP.NET Core on .NET 10
- CsvHelper
- Immutable in-memory market data

### Tooling

- Nx and pnpm workspaces
- Vitest and React Testing Library
- MSW
- Playwright
- Storybook
- xUnit
- ESLint and Prettier

## Workspace Layout

### Apps

- `apps/pharo-dashboard-ui`: the instrument analytics dashboard
- `apps/pharo-dashboard-api`: CSV ingestion, financial statistics, and HTTP endpoints

### Shared Packages

- `@pharo/react-components`: accessible UI components built on React Aria
- `@pharo/react-charts`: generic line charts and recorded-data tables
- `@pharo/tailwind-plugin`: shared design tokens and Tailwind utilities
- `@pharo/eslint-config`: shared lint rules
- `@pharo/prettier-config`: shared formatting rules

Instrument selection, API integration, and dashboard composition stay in the application. Shared packages provide the controls and chart behavior used by that application. [DESIGN.md](DESIGN.md) explains these boundaries and the reasoning behind them.

## Requirements

- Node.js **24.14.1**
- pnpm **10.33.0**
- .NET SDK **10.0.401**

These versions are pinned in [.nvmrc](.nvmrc), [package.json](package.json), and [global.json](global.json). The .NET SDK version must match because SDK roll-forward is disabled.

On Windows or macOS, install Node.js and the .NET **SDK** for your machine's architecture. Microsoft's [.NET installation guide](https://learn.microsoft.com/en-us/dotnet/core/install/) covers both platforms. Open a new terminal after installation and check that `node`, `pnpm`, and `dotnet` are on PATH.

Install pnpm with:

```bash
npm install --global pnpm@10.33.0
```

If using nvm on macOS, run `nvm install` and `nvm use` from the repository root. For a custom .NET installation in `~/.dotnet`, add `export PATH="$HOME/.dotnet:$PATH"` to your shell startup file. The standard Windows installer sets PATH automatically.

## Getting Started

### 1. Install dependencies

From the repository root:

```bash
pnpm install --frozen-lockfile
```

pnpm is the workspace package manager. The first installation needs access to npm and NuGet registries.

### 2. Build the workspace

```bash
pnpm run build
```

This builds the shared packages, frontend, and backend, including the supplied CSV in the API output.

### 3. Start the full development environment

```bash
pnpm run dev
```

What this does:

- checks the required .NET SDK
- starts the API and UI
- waits for both services to be ready
- prints the local URLs

Default local URLs:

- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:5080`
- API readiness: `http://127.0.0.1:5080/health`

The UI proxies `/api` requests to the backend. No browser CORS configuration is needed.

Use `Ctrl + C` to stop both processes. The launcher only stops processes it started. After installing and building with pnpm, `npm run dev` also starts the same launcher.

### Using different ports

If a port is already occupied, the launcher reports it and leaves the existing process running. Use that instance, stop it from its terminal, or start Pharo on different ports:

```bash
node scripts/dev.mjs --api-port 5081 --ui-port 5174
```

This command works in Windows and macOS shells. Use the UI URL printed by the launcher; its API proxy follows the selected API port.

## Root Commands

All commands below run from the workspace root.

### Development and Build

```bash
pnpm run dev
pnpm run build
pnpm run preview
```

`preview` runs the built UI and published API. Its default UI address is `http://127.0.0.1:4173`.

### Lint and Types

```bash
pnpm run lint
pnpm run lint:fix
pnpm run typecheck
```

### Test and Validate

Install Chromium before the first browser-backed test run:

```bash
pnpm run browser:install
```

Then use:

```bash
pnpm run test
pnpm run test:e2e
pnpm run test:infrastructure
pnpm run check:routes
pnpm run validate
```

`validate` runs the complete local check: workspace and route checks, lint, typechecks, C# formatting, builds, unit and Storybook tests, browser tests, and infrastructure checks.

On Linux, Playwright may also need system libraries. Install them with `node scripts/playwright.mjs install --with-deps chromium`. Browser and .NET caches live under ignored `node_modules/.cache`.

### Storybook and Screenshots

```bash
pnpm run storybook
pnpm run storybook:charts
pnpm run storybook:build
pnpm run screenshots
```

Storybook ports:

- `@pharo/react-components`: `http://127.0.0.1:6006`
- `@pharo/react-charts`: `http://127.0.0.1:6008`

Both catalogs run independently of the API.

`screenshots` builds the workspace and writes numbered PNGs to the ignored root `screenshots/` folder. It covers selection, chart modes, comparison, raw data, loading, errors, retry, button states, and responsive layouts. Filenames containing `simulated` identify deliberately delayed, failed, or empty responses. The command uses separate test ports, stops its own servers, and refreshes the images on rerun.

## App-Specific Notes

### pharo-dashboard-ui

The frontend uses:

- TanStack Router for selected tickers and chart mode in the URL
- TanStack Query for independently cached price and statistics requests
- app-scoped Axios services with Zod response validation
- React Aria for instrument selection, buttons, and dialogs
- D3 scales and paths inside React-owned SVG charts

Components access the API through namespaced service hooks:

- `InstrumentsApi.useGetInstruments()`
- `PricesApi.useGetPrices()`
- `PricesApi.useGetPriceStats()`

Each hook receives the app's API client, and the price hooks also receive the selected tickers. Request functions and their corresponding hooks live together in the API layer.

The main workflow is:

1. Search the instrument list and select up to three tickers.
2. Switch between raw **Price** and rebased **Performance** views.
3. Compare the latest close, total return, daily volatility, and maximum drawdown.
4. Hover, click/tap, or use the chart's keyboard control to inspect individual observations.
5. Open **View data** to inspect all selected raw prices in the accessible dialog.

The matrix always uses full-period API statistics. Chart inspection and Price/Performance switching leave those values unchanged.

Selection and an explicit chart view can be shared through the URL:

```text
/?tickers=TICK0001,TICK0002&view=performance
```

Without an explicit `view`, zero or one selected ticker uses Price, and two or three use Performance. An explicit choice survives selection changes, reload, and browser Back/Forward. **Clear selection** clears the tickers and explicit view.

Unknown tickers remain removable and show an error. Malformed identifiers are reported while valid selections remain usable. Loading, empty results, and failures have separate feedback, and transient failures offer a targeted Retry action.

### pharo-dashboard-api

The backend exposes:

- `GET /api/instruments`: sorted ticker identifiers
- `GET /api/prices/{ticker}`: chronological price observations
- `GET /api/prices/{ticker}/stats`: full-period statistics
- `GET /health`: readiness after the dataset loads

The supplied [CSV](apps/pharo-dashboard-api/Data/market_data.csv) contains 6,000 observations: 200 synthetic tickers (`TICK0001`–`TICK0200`), each with 30 recorded dates from June 23 through August 3, 2026. Prices have no specified currency or real company identity.

The API loads and validates the CSV at startup, keeps the data in memory, and prepares statistics for each ticker. Invalid or missing data prevents startup. Invalid or unknown ticker requests return HTTP 404 Problem Details; unexpected failures return a safe 500 response.

Statistics use percentage points: `5` displays as `5.00%`. Daily volatility is the sample standard deviation of consecutive simple returns, without annualization. Fewer than three prices produce `null`, shown as **Not enough observations**. Maximum drawdown is a nonnegative loss magnitude. The full formulas are documented in [DESIGN.md](DESIGN.md).

While the app is running, inspect the API with:

```bash
curl http://127.0.0.1:5080/api/instruments
curl http://127.0.0.1:5080/api/prices/TICK0001
curl http://127.0.0.1:5080/api/prices/TICK0001/stats
```

### Configuration

- `PHARO_API_PORT`: API port, default `5080`
- `PHARO_UI_PORT`: UI port, default `5173` for development or `4173` for preview
- `MarketData__Path`: CSV path, default `Data/market_data.csv`

CLI port options take precedence over environment variables. Ports must be distinct integers between 1024 and 65535. Relative CSV paths resolve against the API's output/content directory. Restart the API after changing the dataset.

## Testing

### Frontend

Vitest, React Testing Library, and MSW exercise the UI and its network behavior. Coverage includes:

- instrument selection and URL state
- loading, errors, retries, and cancellation
- independent caching for each ticker
- latest-price and full-period statistics presentation
- accessible controls and focus behavior

### Backend

xUnit tests cover:

- strict CSV parsing and immutable data storage
- startup and readiness behavior
- HTTP and Problem Details contracts
- financial formulas and insufficient-observation cases
- an independent statistics oracle for all supplied tickers

### Browser and Shared Packages

Playwright runs the compiled dashboard against the real C# API. It covers keyboard and touch inspection, Price/Performance switching, URL navigation, raw observations, responsive layouts, and recovery from failed requests. Regression tests verify that chart inspection leaves comparison statistics unchanged.

The shared UI and chart packages also have unit tests, executable Storybook scenarios, and isolated browser consumers.

The full local `pnpm validate` run passed on October 8, 2026 at source commit `c7af484`: all 25 Nx tasks completed with the cache disabled, and the command exited with code 0.

## Shared Package Development

Use the two Storybooks to develop and inspect components outside the dashboard. Both consume the same shared tokens and public package exports as the application.

The [chart package README](packages/pharo-react-charts/README.md) documents series data, formatting, inspection, and the external data-table contract.

## Recommended Developer Workflow

1. Install dependencies with pnpm.
2. Build the workspace.
3. Start both applications with `pnpm run dev`.
4. Use Storybook when working on shared controls or charts.
5. Run the relevant tests during development and `pnpm run validate` before finishing.

## Notes

- The CSV is a fixed startup dataset; there is no database or live-price ingestion.
- The application covers the assessment workflow. Authentication and production deployment are outside its current scope.
- The design uses colors inspired by [Pharo's public website](https://www.pharo.com/), system fonts, and locally authored UI and SVG marks.
- The root README is the starting point for setup; [DESIGN.md](DESIGN.md) explains the architecture and tradeoffs.

## AI Assistance

OpenAI Codex assisted with implementation, testing, review, and documentation. Financial calculation tests, an independent dataset oracle, API integration tests, and browser scenarios make the behavior reproducible. The candidate remains responsible for understanding and explaining the submitted code and design choices.
