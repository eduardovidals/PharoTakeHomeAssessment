# @pharo/react-charts

A React-owned SVG line chart for up to three generic numerical series. It provides shared UTC/value domains, color and dash identities, recorded-point inspection and a readable data table.

This is a local workspace package with built ESM and TypeScript exports. It requires React and React DOM `^19.3.0` peers. Its runtime dependencies are focused D3 modules and tailwind-merge; no application provider, Router, Query, form layer or base UI package is required.

## Use the public export

```tsx
import { PharoLineChart } from '@pharo/react-charts';
import type { PharoChartSeries } from '@pharo/react-charts';
import './styles.css';

const series: readonly PharoChartSeries[] = [
  {
    id: 'north',
    label: 'North greenhouse',
    points: [
      { x: Date.UTC(2024, 2, 10), y: 18 },
      { x: Date.UTC(2024, 2, 11), y: null },
      { x: Date.UTC(2024, 2, 12), y: 21 },
    ],
  },
  {
    id: 'south',
    label: 'South greenhouse',
    points: [
      { x: Date.UTC(2024, 2, 10), y: 20 },
      { x: Date.UTC(2024, 2, 12), y: 22 },
    ],
  },
];

export function Measurements() {
  return (
    <PharoLineChart
      label="Greenhouse temperatures"
      description="Recorded measurements on March 10–12, 2024."
      series={series}
      xAxisLabel="Date (UTC)"
      yAxisLabel="Temperature (°C)"
    />
  );
}
```

The public types are `PharoChartPoint`, `PharoChartSeries`, `PharoChartAppearance` and `PharoLineChartProps`. Import from the package root; geometry and measurement helpers are internal.

## Load the theme once

Import the public theme in the consumer's CSS entry and compile it through Tailwind v4. The chart does not import CSS automatically. The isolated consumer fixture uses this exact setup, with `styles.css`, `main.tsx` and its copied `node_modules` beside one another:

```css
@import '@pharo/tailwind-plugin';
@source './main.tsx';
@source './node_modules/@pharo/react-charts/dist';
```

The theme uses `source(none)`. Declare the consumer's actual TSX sources and installed chart distribution explicitly. Each `@source` path is relative to the CSS file, so adjust it for the consumer's directory and package-manager layout; a CSS file under `src` generally needs a different path to `node_modules`. The existing [consumer fixture](test/fixture/styles.css) demonstrates the tested layout. The public theme supplies system fonts, semantic colors, dash patterns and the default chart height.

## Input and identity

- `series` is a readonly array containing zero to three series. IDs are unique, nonblank strings; labels are nonblank readable strings.
- A point's `x` is an integer UTC epoch-millisecond timestamp within JavaScript's valid Date range. `y` is a finite number or explicit `null`. Duplicate timestamps within a series are invalid.
- The chart sorts copies chronologically and never mutates caller arrays. All series share the same domains. A null record breaks the line; isolated observations remain visible as markers. No interpolation is presented as a recorded value.
- Keep IDs stable when updating data or reordering series. Active IDs retain their color/dash identity within the mounted instance. A returning ID reuses its previous slot when available. Optional appearances are `primary`, `secondary` and `tertiary`; conflicting explicit assignments produce an invalid-data state.
- Empty/all-null data has a named no-observations state. Invalid inputs or unsafe numerical domains have readable unavailable states. Single-timestamp and flat-value domains are padded for display without adding observations.

Loading, network failures, retries and financial calculations belong to the consuming application. The chart has no API or currency assumption.

## Size and formatting

The chart observes its actual plot container with ResizeObserver. Default plot height is `20rem` (320px with the theme's base font size). `className` merges onto that measured container, so `className="h-96"` changes the measured plot height. Give the chart a usable width; insufficient space displays a named status. Legend, inspection controls and the table sit outside the measured plot and add to the figure's total height.

Each mounted instance owns its observer, selection and appearance history. Observer ownership is retired on container replacement and unmount; no global resize listener or caller cleanup is required. A temporary unmeasured state retains inspection selection. Empty or invalid input clears it.

`label` is the required accessible SVG name; `description` supplies optional descriptive text. Optional `xAxisLabel` and `yAxisLabel` describe units. `formatX(timestamp)` and `formatY(value)` return display strings. Defaults use UTC dates and full plain-number values, with no currency or data rounding.

Axes compact long labels and omit overlapping ticks; identical formatted x labels retain their first coordinate. SVG titles preserve complete axis strings. Details and the table use complete formatter output and recorded values. Formatter exceptions propagate, so callbacks should handle the valid domain they receive.

## Inspect recorded data

Pointer movement and completed touch taps select the nearest timestamp in the sorted union of recorded dates; equal-distance ties choose the earlier date. Touch scrolling and cancelled gestures do not commit an inspection.

When more than one timestamp exists, the native `Inspect {label}` range control supports arrow keys, Home and End. Tab follows the normal control order. A single timestamp still has details and a table. Details expose the full date and each series' exact value at that timestamp; an explicit null or an absent record is shown as `Unavailable`, never zero or a neighboring value. Details are stable content rather than a continuously announced live region.

`Show data table` opens every recorded union timestamp and its per-series values. The table has a UTC date column, full labels and a named, keyboard-focusable horizontal overflow region for narrow screens. If an inspected date disappears after an update, selection reconciles to the nearest remaining date with the same earlier-tie rule.

## Workspace commands

Run from the repository root with its pinned Node/pnpm versions:

```sh
node scripts/nx.mjs run @pharo/react-charts:build
node scripts/nx.mjs run @pharo/react-charts:typecheck
node scripts/nx.mjs run @pharo/react-charts:test
pnpm storybook:charts
node scripts/nx.mjs run @pharo/react-charts:e2e
```

The test target includes unit tests and executable Storybook plays. The e2e target builds the public distribution and catalog first, then exercises an isolated built-export consumer and catalog in Chromium. Use `pnpm browser:install` if the required browser is missing.

## Bundle report

The browser lane writes and attaches `chart-bundle-report.json` under `packages/pharo-react-charts/test-results/**/`; the attachment is also available in the package's Playwright HTML report. It measures the same production fixture bytes served to browser tests.

The report records production build settings and runtime versions, included-module/package metadata, input/output hashes, raw emitted JS/CSS sizes and Node gzip level9 sizes. JS/CSS gzip totals sum the compressed size of each emitted file separately. It audits retained runtime modules, emitted chunk imports and one physical React/React DOM root.

Consumer figures describe the complete minified fixture, including React/React DOM, retained D3 code, theme CSS and its small harness. The library's unminified externalized ESM is measured separately and excludes dependency bytes. Module rendered lengths are diagnostics, not additive compressed attribution. Use the report from the actual successful run for measured results; no size budget or cross-library comparison is implied.

The verified production consumer on 7 October 2026 used Node 24.14.1 (zlib 1.3.1-e00f703), Vite 8.3.3, Rolldown 1.2.12, Oxc JavaScript minification and Lightning CSS minification. The browser lane verified these same emitted bytes:

| Output                                                   |   Bytes | Gzip level 9 bytes |
| -------------------------------------------------------- | ------: | -----------------: |
| Complete consumer JavaScript                             | 305,351 |             95,902 |
| Complete consumer CSS                                    |  12,745 |              3,444 |
| Externalized library ESM, excluding dependencies and CSS |  30,655 |              8,042 |

The consumer graph contained 82 module records, 80 with positive rendered lengths, and one physical root for each of React and React DOM. Focused D3 modules retain their required scale, calendar, formatting and interpolation dependencies. There are no base UI, forms, Router, Query, app/API, story or test-runtime modules in that consumer graph. Rerun the browser lane for current sizes after changing code, dependencies or build settings.
