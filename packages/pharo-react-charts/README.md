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

The public types include `PharoChartPoint`, `PharoChartSeries`, `PharoChartAppearance`, `PharoLineChartProps`, `PharoChartFormatters`, `PharoChartDataTableMode` and `PharoChartDataTableProps`. Import from the package root; geometry and measurement helpers are internal.

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

The chart observes its actual plot container with ResizeObserver and reads its computed font size to scale axis budgets and gutters. Default plot height is `20rem` (320px with the theme's base font size). `className` merges onto that measured container, so `className="h-96"` changes the measured plot height. Give the chart a usable width; insufficient space displays a named status. Legend, inspection controls and the table sit outside the measured plot and add to the figure's total height.

Each mounted instance owns its ResizeObserver, typography MutationObserver, owning-window resize listener, selection and appearance history. Ancestor class/style changes and window resizing recheck font size even when a fixed-size plot does not resize. All observers/listeners are retired on container replacement or unmount; callers need no cleanup. A temporary unmeasured state retains inspection selection. Empty or invalid input clears uncontrolled inspection; a consumer-owned selected timestamp remains the consumer’s responsibility.

`label` is the required accessible SVG name; `description` supplies optional descriptive text. Optional `xAxisLabel` and `yAxisLabel` describe units. Seven independent callbacks format presentation only:

| Callback | Context | Standalone default |
| --- | --- | --- |
| `formatXAxis(timestamp)` | Compact date ticks | UTC month/day, with year for multiyear domains |
| `formatXDetail(timestamp)` | Inspection readout | Full UTC ISO date |
| `formatXTable(timestamp)` | Visible table date | Full UTC ISO date |
| `formatXAccessible(timestamp)` | Spoken inspection/table date | Full UTC ISO date |
| `formatYAxis(value)` | Numerical axis | Full plain number |
| `formatYDetail(value)` | Exact inspection value | Full plain number |
| `formatYTable(value)` | Exact table value | Full plain number |

The old `formatX`/`formatY` aliases are rejected. No callback changes underlying observations or implies currency. Complete axis strings remain in SVG titles. Label budgets use the measured font size, sampling ticks and compacting long labels without squeezing glyphs; axis offsets/gutters scale with that typography. Formatter exceptions propagate, so callbacks should handle their valid input domain.

Optional `xTickValues` supplies readonly UTC epoch-millisecond candidates. Values must be unique finite integers within JavaScript's Date range. The chart sorts a copy, drops candidates outside its display domain and positions them through the UTC scale. An empty array intentionally omits x ticks; omission retains automatic generic UTC ticks. Pass the recorded timestamp union when every displayed date must correspond to an observation, including explicit null records. Measured plot width selects a readable subset, keeping endpoints when both fit. Tick choices never change the inspection timeline or table.

Optional `baselineY` draws a quiet reference line on the shared numerical scale, for example `baselineY={0}` for measurements relative to zero. A finite reference extends the y-domain when needed; omitting it retains the observation-only domain. It adds no point, filled area or table row and does not change recorded inspection. Empty/all-null data stays empty, and nonfinite references or unsafe expanded domains produce the existing unavailable state. Financial transformations remain the consumer's responsibility.

## Inspect recorded data

Pointer movement and completed touch taps select the nearest timestamp in the sorted union of recorded dates; equal-distance ties choose the earlier date. Touch scrolling and cancelled gestures do not commit an inspection.

Inspection initially shows the latest actual timestamp and follows later records until the user chooses a date. Explicit inspection survives resize, order and formatter changes while valid. When more than one timestamp exists, the native `Inspect {label}` range control supports arrow keys, Home and End. Tab follows the normal control order. Complete instructions stay associated with the range and become visible on keyboard focus; the dated readout uses compact wrapping text instead of a permanent instruction panel. A single timestamp still has details and a table. Details expose the full date and each series' exact value at that timestamp; an explicit null or an absent record is shown as `Unavailable`, never zero or a neighboring value. Details are stable content rather than a continuously announced live region.

`Show data table` opens every recorded union timestamp and its per-series values. The table has a UTC date column, full labels and a named, keyboard-focusable horizontal overflow region for narrow screens. If an uncontrolled inspected date disappears after an update, selection reconciles to the nearest remaining date with the same earlier-tie rule.

To coordinate a consumer-owned comparison, pass `selectedTimestamp={date}` with `onTimestampChange={setDate}`. A `null` timestamp means Latest; omitting the prop retains the standalone uncontrolled behavior. The callback fires only for an explicit primary pointer release, completed touch tap or native range change, never hover, resizing or data updates. The consumer accepts a commit by updating the prop and returns to Latest by setting it to `null`.

In controlled mode, pointer motion is a local preview. Leaving the plot or focusing the range restores the pinned/latest readout. The range position and its spoken value always follow the committed date, so a preceding hover cannot change the next keyboard step. A supplied date that disappears remains exact and shows `Unavailable` values; the chart never silently commits a neighboring record. The range starts from the nearest remaining observation so explicit keyboard navigation can choose an available date. Calculation and date ownership stay outside the chart.

## Shared data table and external composition

`PharoChartDataTable` is a standalone export accepting generic `series`, required `caption`, optional `formatXTable`, `formatXAccessible`, `formatYTable`, `emptyMessage` and `className`. It preserves every recorded union date, selected series column, null/absent cell and canonical machine timestamp. The caption also names its keyboard-focusable horizontal-scroll region. All-null records remain available even when no line can be drawn.

`PharoLineChart` uses that same renderer for its default inline disclosure. To compose a separate consumer-owned data surface, supply `dataTable={{ mode: 'external', triggerId: 'raw-data' }}` and render a real enabled, named, visible keyboard-reachable button with that ID which opens your `PharoChartDataTable`. The chart associates its SVG using `aria-details`. The package has no modal or base-UI dependency.

External mode is an explicit consumer contract: the consumer keeps that action mounted, named, enabled and keyboard-reachable, with a unique nonblank ID. If the consumer removes, hides or disables the action, it must switch `dataTable` to `{ mode: 'inline' }` (or omit the prop) so the chart provides the recorded-data alternative. A blank ID also retains inline access. Temporary `inert` or `aria-hidden` background masking while an accessible overlay is open does not change this contract; closing the overlay restores access to the same action.

The chart uses the supplied ID directly and does not observe the document or infer modal state. There is no `none` mode. Consumers own the table's source series and can expose raw records while plotting a transformed view, without adding a UI-package dependency to this library.

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

Earlier assessment measurements predate the current controls, data-table extraction and typography handling. They are not current size claims; rerun the browser lane and inspect its report after changing code, dependencies or build settings. The isolated consumer graph is checked for forbidden base UI, forms, Router, Query, app/API, story and test-runtime modules.
