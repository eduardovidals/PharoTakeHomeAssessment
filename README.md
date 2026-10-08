# Pharo Take Home Assessment

A local full-stack dashboard for exploring the supplied synthetic historical prices, built with React and ASP.NET Core. Search all 200 tickers, select up to three, and compare closing prices, price performance, and financial statistics. Compare statistics over the full supplied 30-day window and inspect the underlying observations in an accessible dialog.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, TanStack Router and Query, React Aria Components |
| Visualization and styling | D3, Day.js UTC formatting, Tailwind CSS with shared Pharo tokens |
| HTTP and validation | Axios and Zod |
| Backend | C# / ASP.NET Core on .NET 10, CsvHelper, immutable in-memory data |
| Tooling and tests | Nx, pnpm, Vitest, React Testing Library, MSW, Playwright, Storybook, xUnit, ESLint and Prettier |

## Workspace Layout

The workspace has two applications and five shared packages:

| Owner                      | Responsibility                                                    |
| -------------------------- | ----------------------------------------------------------------- |
| `apps/pharo-dashboard-ui`  | Dashboard, routing, API integration and application browser tests |
| `apps/pharo-dashboard-api` | CSV ingestion, statistics, HTTP endpoints and backend tests       |
| `@pharo/react-components`  | Accessible controls used by the dashboard                         |
| `@pharo/react-charts`      | Generic SVG line chart and raw-data table                         |
| `@pharo/tailwind-plugin`   | Shared Tailwind design tokens                                     |
| `@pharo/eslint-config`     | Shared lint rules                                                 |
| `@pharo/prettier-config`   | Shared formatting rules                                           |

The application owns instrument selection and financial comparison. Shared packages own reusable presentation and interaction primitives. For the reasoning behind these boundaries, see [DESIGN.md](DESIGN.md).

## Run locally

### Requirements

Install **Node.js 24.14.1**, **pnpm 10.33.0** and **.NET SDK 10.0.401**, with `node`, `pnpm` and `dotnet` on PATH. These versions are pinned in [.nvmrc](.nvmrc), [package.json](package.json) and [global.json](global.json); .NET SDK roll-forward is disabled. The first installation needs access to npm and NuGet registries.

On Windows or macOS, install Node.js and the **.NET SDK**, not only the runtime, for your machine's architecture. Follow Microsoft's [.NET installation instructions](https://learn.microsoft.com/en-us/dotnet/core/install/), then open a new terminal so it picks up PATH changes. Install pnpm with:

```sh
npm install --global pnpm@10.33.0
```

If using nvm on macOS, activate the pinned Node version from the repository root:

```sh
nvm install
nvm use
```

For a .NET installation in `~/.dotnet` on macOS or Linux, add `export PATH="$HOME/.dotnet:$PATH"` to your shell startup file, then reopen the terminal. The standard Windows installer sets PATH; custom installations must do so too. Check `node --version`, `pnpm --version` and `dotnet --version` from the repository root.

### Install and start

From the repository root, in PowerShell, Command Prompt or a macOS terminal:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

The launcher checks the SDK, starts both applications, and waits for readiness:

- Dashboard: **http://127.0.0.1:5173**
- API: **http://127.0.0.1:5080**
- API readiness: **http://127.0.0.1:5080/health**

Vite proxies `/api` to the local API, so no browser CORS setup is required. After installing and building with pnpm, `npm run dev` also starts the same launcher.

Use **Ctrl+C** in the launcher terminal to stop both services. Cleanup targets only that launcher's process groups on macOS/Linux and process trees on Windows. Terminal-close signals also request cleanup; forcibly ending processes can bypass it.

An occupied port is reported without killing its owner. If it belongs to an existing Pharo instance, use that dashboard or stop it from its terminal. To start another instance, this command works in Windows and macOS shells:

```sh
node scripts/dev.mjs --api-port 5081 --ui-port 5174
```

Use the UI URL printed by the launcher. CLI port options override environment variables, and the UI proxy follows the selected API port. Permission errors are distinguished from occupied ports.

### Configuration and preview

| Setting            | Default                       | Purpose                          |
| ------------------ | ----------------------------- | -------------------------------- |
| `PHARO_API_PORT`   | `5080`                        | API listener and UI proxy target |
| `PHARO_UI_PORT`    | `5173`, or `4173` for preview | UI listener                      |
| `MarketData__Path` | `Data/market_data.csv`        | Dataset loaded at API startup    |

Ports must be distinct integers between 1024 and 65535. A relative dataset override resolves against the API's output/content directory, not the shell directory. The CSV is copied into build and publish output. Missing or invalid data prevents readiness; restart the API after changing the dataset.

After `pnpm build`, run `pnpm preview` to serve the built UI and published API. The default preview UI is **http://127.0.0.1:4173**. This is a local preview, not a deployment setup.

## Root Commands

Run these from the repository root:

| Command                    | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                 | Start both applications for development                            |
| `pnpm preview`             | Run the built UI and published API                                 |
| `pnpm build`               | Build applications and shared dependencies                         |
| `pnpm lint`                | Lint frontend, packages and scripts                                |
| `pnpm lint:fix`            | Apply available lint fixes                                         |
| `pnpm typecheck`           | Check TypeScript and compile the .NET solution                     |
| `pnpm test`                | Run backend, frontend, package, Storybook and infrastructure tests |
| `pnpm test:infrastructure` | Run application lifecycle and launcher checks                      |
| `pnpm check:routes`        | Check generated routes and route-file exclusions                   |
| `pnpm test:e2e`            | Run application and public-package Playwright suites               |
| `pnpm validate`            | Run the complete local validation graph                            |
| `pnpm browser:install`     | Install the pinned Playwright Chromium browser                     |
| `pnpm screenshots`         | Build and capture dashboard walkthrough screenshots                |

Install Chromium before the first browser-backed test or screenshot run:

```sh
pnpm browser:install
```

On Linux, Playwright may also need system libraries: use `node scripts/playwright.mjs install --with-deps chromium`. Browser and .NET caches live under ignored `node_modules/.cache`.

### Storybook and screenshots

Both catalogs work independently of the API:

| Command                 | Default address                       |
| ----------------------- | ------------------------------------- |
| `pnpm storybook`        | http://127.0.0.1:6006 — base controls |
| `pnpm storybook:charts` | http://127.0.0.1:6008 — line chart    |

`pnpm storybook:build` builds both catalogs.

`pnpm screenshots` writes numbered PNGs to the ignored root `screenshots/` folder, with no HTML gallery. It covers selection, chart modes, comparison, raw data, button states, loading, errors, retry and responsive layouts. Filenames containing `simulated` identify deliberately delayed, failed or empty API responses. The command uses separate test ports, stops its own servers and refreshes the numbered images on rerun.

## Application Walkthrough

1. **Find and select instruments.** The **Compare instruments** picker filters the cached list, ranking exact matches before prefixes and other matches. All tickers remain reachable in its scrollable popup. Arrow keys and Enter select a result; Escape closes the popup. Choose up to three, with removable tags and an explanation when the limit is reached.
2. **Choose Price or Performance.** Price shows recorded closing prices. Performance shows `100 × (price / firstObservedPrice − 1)` for each instrument, using its own first price. This is rebased price change, without corporate-action adjustments. Shared colors and dash patterns connect tags, lines and matrix columns.
3. **Compare full-period statistics.** The matrix shows each instrument's latest recorded close and total return, daily volatility, and maximum drawdown from the existing statistics endpoint over the supplied 30-day window.
4. **Inspect chart observations.** Hover, click/tap, or use the chart's keyboard control to read individual recorded dates and values. Inspection stays within the chart and does not change comparison statistics or request new data.
5. **Inspect raw observations.** **View data** opens every selected column and recorded row, including in Performance mode. Shared range/count information appears once when histories agree. The dialog scrolls locally, closes with Close or Escape, and restores focus to its trigger.

Selection and an explicitly chosen chart view are shareable:

```text
/?tickers=TICK0001,TICK0002&view=performance
```

Without `view`, zero or one selected ticker defaults to **Price**, and two or three default to **Performance**. An explicit choice survives subsequent selection changes, reload and browser Back/Forward. The date pin is local state: it survives chart-mode changes but resets after clearing all instruments or reloading.

**Clear search** only resets the draft text. **Clear selection** appears when instruments are selected and removes both the selection and explicit chart view. The Price/Performance control remains available when selection is empty. Press `/` outside editable or modal contexts to focus the picker.

Initial instrument loading shows an input spinner and, when open, a popup loading state. Empty results have separate messages. Instrument-list failures offer a message and **Retry instruments** outside the options. Unknown URL tickers remain removable and show a prominent alert; malformed identifiers are reported while valid peers remain usable. Individual price/statistics failures do not block healthy instruments, and transient failures have targeted retry actions.

## Market Data and API

The supplied [CSV](apps/pharo-dashboard-api/Data/market_data.csv) contains **6,000 observations**: 200 synthetic tickers (`TICK0001`–`TICK0200`), each with 30 recorded dates from **2026-06-23 through 2026-08-03**. These describe the file, not hardcoded application limits. Prices have no specified currency or real company identity.

CSV SHA-256:

```text
363970ba4e81bf2cf5d890b0be9df93d28bda0819f39ba10796012e4ec231440
```

| Method | Route | Response |
| --- | --- | --- |
| `GET` | `/api/instruments` | Sorted canonical ticker strings |
| `GET` | `/api/prices/{ticker}` | Chronological date/price observations |
| `GET` | `/api/prices/{ticker}/stats` | Full-period `totalReturnPercent`, nullable `dailyVolatilityPercent`, `maxDrawdownPercent` |
| `GET` | `/health` | `{"status":"ready"}` after dataset initialization |

While the app is running:

```sh
curl http://127.0.0.1:5080/api/instruments
curl http://127.0.0.1:5080/api/prices/TICK0001
curl http://127.0.0.1:5080/api/prices/TICK0001/stats
```

Tickers are trimmed and uppercased. Invalid or unknown tickers return safe HTTP 404 Problem Details on the price routes. Unexpected request failures return generic 500 Problem Details without raw input or filesystem paths.

Statistics use **percentage points**: `5` displays as `5.00%`, not `500%`. Volatility is the sample standard deviation of consecutive simple returns, without annualization; fewer than three prices give `null`, displayed as **Not enough observations**. Drawdown is a nonnegative loss magnitude. [DESIGN.md](DESIGN.md) specifies the formulas and insufficient-observation behavior.

## Testing

- **Backend:** xUnit tests for CSV ingestion, immutable store, startup, HTTP contracts and statistics, including an independent oracle for all supplied tickers.
- **Frontend:** Vitest, React Testing Library and MSW exercise API validation, Query cancellation/cache/retry behavior, selection, full-period comparison and error states.
- **Browser:** Playwright runs the compiled dashboard against the real API and checks selection, dates, keyboard/touch/focus, URL navigation, raw data and responsive layouts.
- **Shared packages:** unit tests, executable Storybook scenarios and isolated browser consumers exercise reusable controls and charts.

Run `pnpm validate` for workspace/route-generation checks, lint, types, C# formatting, tests, builds, infrastructure and browser suites through one Nx graph. These are reproducible commands, not a claim that every environment or physical device has been tested.

## Scope and AI Assistance

This local assessment uses one immutable startup dataset. It does not include authentication, a database, live quotes, live ingestion, market calendars, corporate-action adjustments, production hosting or investment recommendations. Shared controls and chart code are loaded eagerly; no production bundle-size or performance guarantee is claimed.

OpenAI Codex assisted implementation, testing, review and documentation. Calculation tests, an independent dataset oracle, HTTP integration tests and browser scenarios let reviewers inspect and reproduce the behavior. The submitted code and architectural choices should be understood and explainable by the candidate.

The navy/white/cyan treatment is inspired by [Pharo's public website](https://www.pharo.com/). UI and SVG marks are authored here, with system fonts and no copied external logos, photographs or fonts. Dependencies retain their own licensing requirements. See [DESIGN.md](DESIGN.md) and the [chart package README](packages/pharo-react-charts/README.md) for architecture and reusable chart contracts.
