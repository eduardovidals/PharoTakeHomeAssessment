# Pharo Take Home Assessment

This repository contains the submission for the Pharo take home assessment.

It is organized as an Nx monorepo with:

- an instrument analytics frontend in `apps/pharo-dashboard-ui`
- an ASP.NET Core backend in `apps/pharo-dashboard-api`
- shared UI, chart, styling, and tooling packages in `packages/`

The dashboard lets you search the supplied instrument list, compare up to three tickers, and inspect their historical prices. The comparison matrix shows the latest closing price and full-period statistics for each selected instrument.

## Tech Stack

These are the versions used by this checkout. The [requirements](#requirements) list the tools to install first; project libraries and test tools are installed from the committed dependency files.

### Frontend

| Technology / package                       | Version             |
| ------------------------------------------ | ------------------- |
| React / React DOM                          | 19.3.0              |
| TypeScript                                 | 5.9.3               |
| Vite / `@vitejs/plugin-react`              | 8.3.3 / 6.1.2       |
| TanStack Router (`@tanstack/react-router`) | 1.170.41            |
| TanStack Router plugin / generator         | 1.168.42 / 1.167.40 |
| TanStack Query (`@tanstack/react-query`)   | 5.104.1             |
| React Aria Components                      | 1.21.1              |
| D3 `d3-array` / `d3-scale`                 | 3.2.4 / 4.0.2       |
| D3 `d3-shape` / `d3-time-format`           | 3.2.0 / 4.1.0       |
| Tailwind CSS / `@tailwindcss/vite`         | 4.3.3               |
| `tailwindcss-react-aria-components`        | 2.2.0               |
| `tailwind-merge`                           | 3.7.0               |
| Day.js                                     | 1.11.23             |
| Axios                                      | 1.20.0              |
| Zod                                        | 4.6.5               |

### Backend

| Technology / package       | Version                   |
| -------------------------- | ------------------------- |
| .NET SDK                   | 10.0.401                  |
| C# language version        | 14.0, selected by the SDK |
| .NET / ASP.NET Core target | `net10.0`                 |
| CsvHelper                  | 33.1.0                    |

The SDK supplies the C# compiler and .NET/ASP.NET Core runtimes. SDK and runtime version numbers are different; install the exact SDK listed above. Market data is held in memory, so no database installation is required.

### Tooling

| Tool / package                                   | Version                 |
| ------------------------------------------------ | ----------------------- |
| Nx                                               | 23.2.1                  |
| Vitest / `@vitest/browser-playwright`            | 5.0.3                   |
| React Testing Library (`@testing-library/react`) | 16.3.3                  |
| Testing Library DOM / user-event / jest-dom      | 10.4.2 / 14.6.7 / 7.0.1 |
| jsdom                                            | 27.0.1                  |
| MSW                                              | 2.15.0                  |
| Playwright / `@playwright/test`                  | 1.63.0                  |
| Storybook and its installed addons               | 10.6.1                  |
| xUnit                                            | 2.9.3                   |
| `xunit.runner.visualstudio`                      | 4.0.0                   |
| `Microsoft.NET.Test.Sdk`                         | 18.10.1                 |
| `Microsoft.AspNetCore.Mvc.Testing`               | 10.0.12                 |
| ESLint / `@eslint/js`                            | 10.12.0 / 10.0.1        |
| `typescript-eslint`                              | 8.71.1                  |
| Prettier                                         | 3.9.9                   |

The [root manifest](package.json) and workspace manifests contain the complete direct dependency declarations, including auxiliary lint plugins and TypeScript definitions. [package-lock.json](package-lock.json) records npm's exact dependency tree; [pnpm-lock.yaml](pnpm-lock.yaml) records the alternative pnpm tree. The [API project](apps/pharo-dashboard-api/PharoDashboard.Api.csproj) and [test project](apps/pharo-dashboard-api/tests/PharoDashboard.Api.Tests/PharoDashboard.Api.Tests.csproj) declare NuGet versions, with resolved dependencies in their respective [API lockfile](apps/pharo-dashboard-api/packages.lock.json) and [test lockfile](apps/pharo-dashboard-api/tests/PharoDashboard.Api.Tests/packages.lock.json). These files are authoritative when dependencies change.

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
- npm **11.12.1**
- .NET SDK **10.0.401**

These versions are pinned in [.nvmrc](.nvmrc), [package.json](package.json), and [global.json](global.json). The .NET SDK version must match because SDK roll-forward is disabled. pnpm **10.33.0** is needed only for the [optional package-manager switch](#switching-between-npm-and-pnpm).

Check the installed tools from the repository root:

| Command            | Expected output |
| ------------------ | --------------- |
| `node --version`   | `v24.14.1`      |
| `npm --version`    | `11.12.1`       |
| `dotnet --version` | `10.0.401`      |

`npm ci` installs the frontend and tooling versions above. `npm run build` restores the locked NuGet dependencies and builds the workspace. The browser tests use the Chromium revision selected by Playwright 1.63.0; `npm run browser:install` installs it. These project dependencies do not require separate global installations.

On Windows or macOS, install Node.js and the .NET **SDK** for your machine's architecture. Microsoft's [.NET installation guide](https://learn.microsoft.com/en-us/dotnet/core/install/) covers both platforms. Open a new terminal after installation and check that `node`, `npm`, and `dotnet` are on PATH.

Verification uses npm 11.12.1; Node 24.14.1 ships with npm 11.11.0. Check `node --version`, `npm --version`, and `dotnet --version` before installing dependencies. If npm differs, install the pinned version with `npm install --global npm@11.12.1`.

If using nvm on macOS, run `nvm install` and `nvm use` from the repository root. For a custom .NET installation in `~/.dotnet`, add `export PATH="$HOME/.dotnet:$PATH"` to your shell startup file. The standard Windows installer sets PATH automatically.

## Getting Started

### 1. Install dependencies

From the repository root:

```bash
npm ci
```

npm is the default workspace package manager, and `package-lock.json` records its exact dependency tree. This installation needs access to the npm registry; the first build also needs access to NuGet.

### 2. Build the workspace

```bash
npm run build
```

This builds the shared packages, frontend, and backend, including the supplied CSV in the API output.

### 3. Start the full development environment

```bash
npm run dev
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

Use `Ctrl + C` to stop both processes. The launcher only stops processes it started.

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
npm run dev
npm run build
npm run preview
```

`preview` runs the built UI and published API. Its default UI address is `http://127.0.0.1:4173`.

### Lint and Types

```bash
npm run lint
npm run lint:fix
npm run typecheck
```

### Test and Validate

Install Chromium before the first browser-backed test run:

```bash
npm run browser:install
```

Then use:

```bash
npm run test
npm run test:e2e
npm run test:infrastructure
npm run check:routes
npm run validate
```

`validate` runs the complete local check: workspace and route checks, lint, typechecks, C# formatting, builds, unit and Storybook tests, browser tests, and infrastructure checks.

On Linux, Playwright may also need system libraries. Install them with `node scripts/playwright.mjs install --with-deps chromium`. Browser and .NET caches live under ignored `node_modules/.cache`.

### Storybook and Screenshots

```bash
npm run storybook
npm run storybook:charts
npm run storybook:build
npm run screenshots
```

Storybook ports:

- `@pharo/react-components`: `http://127.0.0.1:6006`
- `@pharo/react-charts`: `http://127.0.0.1:6008`

Both catalogs run independently of the API.

`screenshots` builds the workspace and writes numbered PNGs to the ignored root `screenshots/` folder. It covers selection, chart modes, comparison, raw data, loading, errors, retry, button states, and responsive layouts. Filenames containing `simulated` identify deliberately delayed, failed, or empty responses. The command uses separate test ports, stops its own servers, and refreshes the images on rerun.

## Switching Between npm and pnpm

npm is the committed default. pnpm 10.33.0 remains a supported alternative using the same pinned direct dependencies and workspace packages. Each manager owns its lockfile: `package-lock.json` for npm and `pnpm-lock.yaml` for pnpm.

Stop running development and test processes before switching. The protocol helper changes only local workspace references and package-manager metadata; it does not install dependencies or rewrite either lockfile. Clear the previous manager's dependency directories so the new install starts clean.

### Switch to pnpm

```bash
npm install --global pnpm@10.33.0
node scripts/workspace-protocol.mjs pnpm
node -e "for (const p of ['.', ...require('./package.json').workspaces]) require('node:fs').rmSync(p + '/node_modules', { recursive: true, force: true })"
pnpm install --frozen-lockfile
pnpm run build
pnpm run browser:install
pnpm run validate
pnpm run dev
```

### Switch Back to npm

```bash
node scripts/workspace-protocol.mjs npm
node -e "for (const p of ['.', ...require('./package.json').workspaces]) require('node:fs').rmSync(p + '/node_modules', { recursive: true, force: true })"
npm ci
npm run build
npm run browser:install
npm run validate
npm run dev
```

These commands work in Windows and macOS terminals. The helper is also available through `workspace:protocol:npm` and `workspace:protocol:pnpm` root scripts. Running the selected mode again makes no changes. Switching to pnpm uses `workspace:*` references; switching back restores npm-compatible `*` references and the tracked npm baseline.

Both lockfiles stay committed. Generate lockfile changes with the corresponding manager in its own mode, and return to npm before submitting changes. Dependency lifecycle scripts remain disabled; browser installation is an explicit command.

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

The **Full-period comparison** matrix always uses the latest closing prices and full-period API statistics. Chart inspection and Price/Performance switching leave those values unchanged.

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

CLI port options take precedence over environment variables. Ports must be distinct integers between 1024 and 65535. Relative CSV paths resolve against the API's output/content directory. When replacing the CSV, rebuild if using published output, restart the API, and reload the dashboard so its in-memory client cache is recreated.

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

Use `npm run validate` in the default checkout. In pnpm mode, use `pnpm run validate`; both commands execute the same local checks.

## Shared Package Development

Use the two Storybooks to develop and inspect components outside the dashboard. Both consume the same shared tokens and public package exports as the application.

The [chart package README](packages/pharo-react-charts/README.md) documents series data, formatting, inspection, and the external data-table contract.

## Recommended Developer Workflow

1. Install dependencies with `npm ci`.
2. Build the workspace.
3. Start both applications with `npm run dev`.
4. Use Storybook when working on shared controls or charts.
5. Run the relevant tests during development and `npm run validate` before finishing.

## Notes

- The CSV is a fixed startup dataset; there is no database or live-price ingestion.
- The application covers the assessment workflow. Authentication and production deployment are outside its current scope.
- The design uses colors inspired by [Pharo's public website](https://www.pharo.com/), system fonts, and locally authored UI and SVG marks.
- The root README is the starting point for setup; [DESIGN.md](DESIGN.md) explains the architecture and tradeoffs.

## AI Assistance

I used OpenAI Codex to assist with implementation, test scaffolding, review, and documentation. I directed the application's architecture, scope, and engineering conventions, including keeping financial statistics authoritative in the C# API. The documented validation commands let reviewers reproduce the checks locally.
