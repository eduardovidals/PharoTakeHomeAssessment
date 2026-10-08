# Pharo instrument price dashboard

A local React and ASP.NET Core dashboard for the supplied synthetic historical prices. Search the instrument list, select up to three tickers, inspect their raw closing-price histories, and compare total return, daily sample volatility and maximum drawdown. Selection is shareable through the URL.

## Run locally

Use **Node.js 24.14.1**, **pnpm 10.33.0** and **.NET SDK 10.0.401**, with `node`, `pnpm` and `dotnet` on your PATH. The repository pins Node in `.nvmrc`, pnpm in `package.json` and the SDK in `global.json` with SDK roll-forward disabled. Dependency downloads require npm and NuGet access.

If you use nvm, activate the pinned Node version from the repository root:

```sh
nvm install
nvm use
```

Install the pinned .NET SDK using Microsoft's [.NET installation instructions](https://learn.microsoft.com/en-us/dotnet/core/install/). If you installed it in `~/.dotnet` on macOS or Linux, add `export PATH="$HOME/.dotnet:$PATH"` to your shell startup file (such as `~/.zshrc`), then open a new terminal. Run `node --version` and `dotnet --version` from the repository root to confirm the pinned versions are selected.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

After the pnpm install and build steps, `npm run dev` also starts the same launcher.

Open **http://127.0.0.1:5173**. The launcher starts the API on **http://127.0.0.1:5080**, waits for both services, and stops its own processes on Ctrl+C. Vite proxies `/api` to the API; no browser CORS configuration is required. Occupied ports cause a startup error without terminating their existing owners.

After a build, `pnpm preview` runs the published API with the built UI at **http://127.0.0.1:4173**. This is a local preview, not a deployment setup.

| Configuration      | Default                       | Purpose                          |
| ------------------ | ----------------------------- | -------------------------------- |
| `PHARO_API_PORT`   | `5080`                        | API listener and UI proxy target |
| `PHARO_UI_PORT`    | `5173`, or `4173` for preview | UI listener                      |
| `MarketData__Path` | `Data/market_data.csv`        | API startup dataset override     |

Ports must be distinct integers between 1024 and 65535. A relative dataset override resolves against the API application's output/content directory, not the shell directory. The supplied CSV is copied into build and publish output. Missing or invalid data prevents API readiness; restart the API to load a changed file.

## Check the project

Install the pinned Chromium browser before browser-backed checks:

```sh
pnpm browser:install
pnpm test
pnpm test:e2e
pnpm validate
```

`pnpm test` runs the .NET tests, frontend/package unit tests, executable Storybook tests, and infrastructure checks. `pnpm test:e2e` runs the compiled app against the real API and isolated public-package browser consumers. `pnpm validate` combines workspace/route-generation checks, lint, types, C# formatting, tests, builds, infrastructure and e2e through one Nx graph. These commands describe reproducible checks; this README is not a validation report.

On Linux, Playwright may also require system libraries: use `node scripts/playwright.mjs install --with-deps chromium`. CI installs these before validation. Browser and .NET caches live under ignored `node_modules/.cache`.

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

Search is a form-owned draft; selecting/removing instruments changes the URL. Results are paged ten at a time, so the complete list remains reachable. A link such as `/?tickers=TICK0001,TICK0002` preserves selection through reload and browser Back/Forward. A fourth selection leaves the current three unchanged and explains the limit.

The chart overlays **raw prices** on shared UTC-date and price axes. It does not rebase prices, imply a currency, or present a live feed. Legends use both color and dash patterns. Pointer inspection, touch taps and the labeled native keyboard range select recorded dates; a full data table provides a readable alternative. Failed or pending histories remain named while successful siblings stay usable, with resource-specific retry actions.

Statistics are percentage points, displayed to two decimal places: `5` is `5.00%`, not `500%`. Daily volatility is the sample deviation of simple consecutive returns, with no annualization; fewer than three prices produce `Not enough observations`. Drawdown is a positive loss magnitude. Exact formulas, package boundaries and tradeoffs are in [DESIGN.md](DESIGN.md). Reusable chart APIs are documented in the [chart package README](packages/pharo-react-charts/README.md).

## Scope and assistance

This take-home uses one immutable startup dataset, without a database, authentication, live ingestion, corporate-action adjustments or production hosting. The initial dashboard bundles its UI/form/chart dependencies together; no bundle budget or production-performance claim is made.

OpenAI Codex assisted implementation, tests, review and documentation. The repository includes literal calculation tests, an independent dataset oracle, API integration tests and browser scenarios so behavior can be inspected and reproduced rather than inferred from this description.

The restrained navy/white/cyan treatment is inspired by [Pharo's public website](https://www.pharo.com/). The UI and SVG marks are authored here and use system fonts; no external logo, photograph or font asset is copied. Dependencies retain their own licensing requirements, including React (MIT), React Aria Components (Apache-2.0) and `d3-scale` (ISC).
