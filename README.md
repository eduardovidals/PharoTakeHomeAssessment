# Pharo instrument price dashboard

A local React and ASP.NET Core dashboard for the supplied synthetic historical prices. Choose up to three instruments, compare raw prices or rebased performance, and compare full-window or pinned-date statistics in one matrix. Complete raw observations open in a dialog. Selection and the optional chart view are shareable through the URL.

## Run locally

Use **Node.js 24.14.1**, **pnpm 10.33.0** and **.NET SDK 10.0.401**, with `node`, `pnpm` and `dotnet` on your PATH. The repository pins Node in `.nvmrc`, pnpm in `package.json` and the SDK in `global.json` with SDK roll-forward disabled. Dependency downloads require npm and NuGet access.

On Windows or macOS, install Node.js and the **.NET SDK** (not only the runtime) for your machine's architecture, using Microsoft's [.NET installation instructions](https://learn.microsoft.com/en-us/dotnet/core/install/). Open a new terminal after installation so it picks up PATH changes. Install pnpm with:

```sh
npm install --global pnpm@10.33.0
```

If you use nvm on macOS, activate the pinned Node version from the repository root:

```sh
nvm install
nvm use
```

If you installed .NET in `~/.dotnet` on macOS or Linux, add `export PATH="$HOME/.dotnet:$PATH"` to your shell startup file (such as `~/.zshrc`), then open a new terminal. On Windows, the standard installer adds .NET to PATH; a custom installation must also be on PATH. Run `node --version`, `pnpm --version` and `dotnet --version` from the repository root to confirm the pinned versions are selected.

From the repository root, in PowerShell, Command Prompt or a macOS terminal:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

After the pnpm install and build steps, `npm run dev` also starts the same launcher.

Open **http://127.0.0.1:5173**. The launcher checks the required SDK before starting either service, starts the API on **http://127.0.0.1:5080**, and waits for both services. Vite proxies `/api` to the API; no browser CORS configuration is required.

Use **Ctrl+C** in the launching terminal to stop both services before restarting. Shutdown targets only that launcher's process groups on macOS/Linux and process trees on Windows. Terminal-close signals also request cleanup; forcibly ending processes can bypass cleanup.

If a port is already in use, the launcher leaves its owner running. If it is your existing Pharo instance, use the open dashboard or stop that instance from its terminal. To run another instance on different ports, this command works in both Windows and macOS shells:

```sh
npm run dev -- --api-port 5081 --ui-port 5174
```

Open the UI URL printed by the launcher. CLI port options override the environment variables below; the UI proxy always uses the selected API port. Permission errors are reported separately from occupied ports.

After a build, `pnpm preview` runs the published API with the built UI at **http://127.0.0.1:4173**. This is a local preview, not a deployment setup.

| Configuration      | Default                       | Purpose                          |
| ------------------ | ----------------------------- | -------------------------------- |
| `PHARO_API_PORT`   | `5080`                        | API listener and UI proxy target |
| `PHARO_UI_PORT`    | `5173`, or `4173` for preview | UI listener                      |
| `MarketData__Path` | `Data/market_data.csv`        | API startup dataset override     |

Ports must be distinct integers between 1024 and 65535. A relative dataset override resolves against the API application's output/content directory, not the shell directory. The supplied CSV is copied into build and publish output. Missing or invalid data prevents API readiness; restart the API to load a changed file.

## Check the project

For a folder of numbered screenshots of the dashboard and its main flows, run:

```sh
pnpm browser:install # first time only
pnpm screenshots
```

PNG images are written to `screenshots/` at the repository root. The walkthrough covers the searchable picker, selection tags and limits, Price/Performance views, comparison matrix, raw-data dialog, button states, loading, errors, retry recovery, and desktop/tablet/mobile layouts. Filenames containing `simulated` identify deliberately delayed, failed or empty API responses. It uses separate test ports, stops its own servers, and produces no HTML gallery. Images are ignored by Git; rerunning refreshes the numbered files.

Install the pinned Chromium browser before browser-backed checks:

```sh
pnpm browser:install
pnpm test
pnpm test:e2e
pnpm validate
```

`pnpm test` runs the .NET tests, frontend/package unit tests, executable Storybook tests, and infrastructure checks. `pnpm test:e2e` runs the compiled app against the real API and isolated public-package browser consumers. `pnpm validate` combines workspace/route-generation checks, lint, types, C# formatting, tests, builds, infrastructure and e2e through one Nx graph. These commands describe reproducible checks; this README is not a validation report.

On Linux, Playwright may also require system libraries: use `node scripts/playwright.mjs install --with-deps chromium`. Browser and .NET caches live under ignored `node_modules/.cache`.

Three independent catalogs are available:

| Command                 | Catalog URL                                  |
| ----------------------- | -------------------------------------------- |
| `pnpm storybook`        | http://127.0.0.1:6006 — base controls        |
| `pnpm storybook:forms`  | http://127.0.0.1:6007 — schema/form bindings |
| `pnpm storybook:charts` | http://127.0.0.1:6008 — generic line chart   |

`pnpm storybook:build` builds all three catalogs. Each catalog works without the API.

## Data and API

The supplied [CSV](apps/pharo-dashboard-api/Data/market_data.csv) has 6,000 observations: 200 tickers (`TICK0001`–`TICK0200`), each with 30 recorded dates from **2026-06-23 through 2026-08-03**. These describe this file, not hardcoded application limits. Prices are synthetic and carry no specified currency.

CSV SHA-256:

```text
363970ba4e81bf2cf5d890b0be9df93d28bda0819f39ba10796012e4ec231440
```

| GET endpoint | Response |
| --- | --- |
| `/health` | `{"status":"ready"}` after dataset initialization |
| `/api/instruments` | Sorted canonical ticker strings |
| `/api/prices/{ticker}` | Chronological `[{"date":"2026-06-23","price":190.34}, …]` |
| `/api/prices/{ticker}/stats` | `totalReturnPercent`, nullable `dailyVolatilityPercent`, `maxDrawdownPercent` |

The example price above is the first `TICK0001` observation. Try:

```sh
curl http://127.0.0.1:5080/api/instruments
curl http://127.0.0.1:5080/api/prices/TICK0001
curl http://127.0.0.1:5080/api/prices/TICK0001/stats
```

Tickers are trimmed and normalized to invariant uppercase. Invalid or unknown identifiers return safe HTTP 404 Problem Details on both price routes. Unexpected request failures return generic 500 Problem Details without raw input or filesystem paths.

## Reading the dashboard

The React Aria **Compare instruments** picker searches the cached list locally, ranking exact matches before prefixes and other matches. Its bounded popup keeps every candidate reachable without pagination. Arrow keys and Enter choose an active result; Escape dismisses the popup without clearing your search. Selected tags remain removable even when an instrument is unknown or the list is unavailable. **Clear search** clears only the draft; **Clear selection** resets selected tickers and the explicit chart view. The optional `/` shortcut focuses the picker outside editable or modal contexts.

A link such as `/?tickers=TICK0001,TICK0002&view=price` preserves ordered selection and an explicit view through reload and browser Back/Forward. Without `view`, zero or one selected ticker defaults to **Price**, and two or three default to **Performance**. An explicit choice remains through later selection changes. A fourth selection leaves the current three unchanged and explains the limit.

**Price** plots raw closing prices. **Performance** plots `100 × (price / firstObservedPrice − 1)` for each instrument, using its own first recorded price without rounding the source values. It describes price change, not adjusted total return. The chart preserves gaps and shows a zero reference in Performance mode. A shared recorded range/count appears once when available histories agree; differing windows are identified, with per-instrument ranges and bases in **View data**. Missing resources never become zero-valued data, and prices carry no specified currency.

Dates are formatted in UTC with Day.js; the date axis samples actual recorded timestamps. Color and dash identities agree across tags, chart and matrix. **Latest** is the default and retains the API’s full-window statistics. Click or tap the chart, use its labeled keyboard range, or choose a **Comparison date** to pin the matrix. Previous/Next date navigate recorded dates; **Back to latest** restores the default. Hover only previews chart values and never changes the comparison. A pin survives chart-mode changes; clearing all instruments or reloading starts at Latest. The pin is local interaction state, while instruments and chart mode remain URL-owned.

For a pinned date, closing price requires an observation on that exact date; missing records show **No observation**. Total return, daily sample volatility and maximum drawdown use each instrument’s first observation through the selected date, inclusive, from existing cached prices. The calculations mirror the backend’s unrounded formulas, including null volatility for fewer than three prices. Period labels explain differing histories; date navigation makes no additional API requests.

**View data** opens **Raw observations**, containing every recorded row and selected column even in Performance mode. Unavailable values remain explicit. The dialog scrolls locally, supports Close and Escape, and returns focus to its trigger; it does not refetch data or unmount the chart. Unknown identifiers offer Remove, while transient failures offer only the affected price/statistics retry. Healthy peers remain usable.

Statistics are percentage points, displayed to two decimal places: `5` is `5.00%`, not `500%`. Daily volatility is the sample deviation of consecutive simple returns, with no annualization; fewer than three prices produce `Not enough observations`. Drawdown is a positive loss magnitude. Exact formulas, package boundaries and tradeoffs are in [DESIGN.md](DESIGN.md). Reusable chart APIs are documented in the [chart package README](packages/pharo-react-charts/README.md).

## Scope and assistance

This take-home uses one immutable startup dataset, without a database, authentication, live ingestion, corporate-action adjustments or production hosting. The dashboard loads its shared controls and chart code eagerly; no bundle budget or production-performance claim is made.

OpenAI Codex assisted implementation, tests, review and documentation. The repository includes literal calculation tests, an independent dataset oracle, API integration tests and browser scenarios so behavior can be inspected and reproduced rather than inferred from this description.

The restrained navy/white/cyan treatment is inspired by [Pharo's public website](https://www.pharo.com/). The UI and SVG marks are authored here and use system fonts; no external logo, photograph or font asset is copied. Dependencies retain their own licensing requirements, including React (MIT), React Aria Components (Apache-2.0) and `d3-scale` (ISC).
