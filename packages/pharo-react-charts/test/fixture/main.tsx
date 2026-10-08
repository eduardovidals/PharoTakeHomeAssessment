import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PharoChartDataTable, PharoLineChart } from '@pharo/react-charts';
import type { PharoChartSeries } from '@pharo/react-charts';
import './styles.css';

const march10 = Date.UTC(2024, 2, 10);
const march11 = Date.UTC(2024, 2, 11);
const march12 = Date.UTC(2024, 2, 12);
const march13 = Date.UTC(2024, 2, 13);

const recordedDates = [10, 11, 13, 14, 18, 19, 21, 25].map((date) => Date.UTC(2024, 2, date));

function fullDate(value: number) {
  return `Recorded on ${new Date(value).toISOString().slice(0, 10)} at midnight Coordinated Universal Time`;
}

function fullValue(value: number) {
  return `Reading ${value.toString()} in fully described measurement units`;
}

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const unequalSeries: readonly PharoChartSeries[] = [
  {
    id: 'unequal-north',
    label: 'Northern greenhouse with a long sensor label for narrow screens',
    points: [
      { x: march10, y: 2 },
      { x: march11, y: null },
      { x: march13, y: 8 },
    ],
  },
  {
    id: 'unequal-south',
    label: 'Southern greenhouse with a different recording calendar',
    points: [
      { x: march11, y: 20 },
      { x: march12, y: 30 },
    ],
  },
];

const north: PharoChartSeries = {
  id: 'north',
  label: 'North greenhouse',
  points: [
    { x: march10, y: 0 },
    { x: march11, y: 10 },
    { x: march12, y: 20 },
  ],
};

const south: PharoChartSeries = {
  id: 'south',
  label: 'South greenhouse',
  points: [
    { x: march10, y: 20 },
    { x: march11, y: 15 },
    { x: march12, y: 10 },
  ],
};

const east: PharoChartSeries = {
  id: 'east',
  label: 'East greenhouse',
  points: [
    { x: march10, y: 5 },
    { x: march12, y: 15 },
  ],
};

function App() {
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);
  const [dateCommits, setDateCommits] = useState(0);
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalHidden, setExternalHidden] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [baselineVisible, setBaselineVisible] = useState(true);
  const [tall, setTall] = useState(false);
  const [series, setSeries] = useState<readonly PharoChartSeries[]>([north, south]);

  return (
    <main className="mx-auto max-w-6xl space-y-pharo-8 p-pharo-4">
      <header className="space-y-pharo-2">
        <h1 className="text-pharo-title font-semibold">Independent responsive charts</h1>
        <p>Generic measurements rendered from the public chart package and one theme import.</p>
      </header>
      <div className="flex flex-wrap gap-pharo-3">
        <button
          type="button"
          onClick={() => setNarrow((current) => !current)}
          className="rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-3 py-pharo-2 focus-visible:pharo-focus-ring"
        >
          Resize first chart
        </button>
        <button
          type="button"
          onClick={() => setTall((current) => !current)}
          className="rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-3 py-pharo-2 focus-visible:pharo-focus-ring"
        >
          Resize first height
        </button>
        <button
          type="button"
          onClick={() => setSeries((current) => current.filter((item) => item.id !== 'north'))}
          className="rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-3 py-pharo-2 focus-visible:pharo-focus-ring"
        >
          Remove north
        </button>
        <button
          type="button"
          onClick={() =>
            setSeries((current) =>
              current.some((item) => item.id === 'east') ? current : [...current, east],
            )
          }
          className="rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-3 py-pharo-2 focus-visible:pharo-focus-ring"
        >
          Add east
        </button>
        <button
          type="button"
          onClick={() => setSeries((current) => [...current].reverse())}
          className="rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-3 py-pharo-2 focus-visible:pharo-focus-ring"
        >
          Reverse series
        </button>
      </div>
      <div className="grid min-w-0 gap-pharo-6 md:grid-cols-2">
        <section aria-label="Responsive measurement example" className="min-w-0">
          <h2 className="mb-pharo-3 text-pharo-lg font-semibold">Greenhouse temperatures</h2>
          <div className={narrow ? 'w-64 max-w-full' : 'w-full'}>
            <PharoLineChart
              label="Greenhouse temperature"
              className={tall ? 'h-96' : undefined}
              description="Daily measurements on March 10, 11 and 12, 2024."
              series={series}
              xAxisLabel="Date (UTC)"
              yAxisLabel="Temperature (°C)"
            />
          </div>
        </section>
        <section aria-label="Independent instance example" className="min-w-0">
          <h2 className="mb-pharo-3 text-pharo-lg font-semibold">Constant sample levels</h2>
          <PharoLineChart
            label="Sample levels"
            series={[
              {
                id: 'sample',
                label: 'Control sample',
                points: [
                  { x: march10, y: 100 },
                  { x: march12, y: 100 },
                ],
              },
            ]}
            xAxisLabel="Date (UTC)"
            yAxisLabel="Level"
          />
        </section>
      </div>
      <section aria-label="Generic baseline example" className="min-w-0">
        <h2 className="mb-pharo-3 text-pharo-lg font-semibold">
          Measurements with a reference line
        </h2>
        <button
          type="button"
          aria-pressed={baselineVisible}
          className="mb-pharo-3 min-h-pharo-control rounded-pharo-control border border-pharo-control-border px-pharo-3 focus-visible:pharo-focus-ring"
          onClick={() => setBaselineVisible((current) => !current)}
        >
          Toggle reference baseline
        </button>
        <PharoLineChart
          label="Referenced measurements"
          description="Three recorded values with an optional zero reference; no values are added."
          baselineY={baselineVisible ? 0 : undefined}
          series={[
            {
              id: 'reference-sensor',
              label: 'Reference sensor',
              points: [
                { x: march10, y: 2 },
                { x: march11, y: 8 },
                { x: march12, y: 4 },
              ],
            },
          ]}
          xAxisLabel="Date (UTC)"
          yAxisLabel="Measured level"
        />
      </section>
      <section aria-label="Recorded candidate example" className="min-w-0">
        <h2 className="mb-pharo-3 text-pharo-lg font-semibold">
          Recorded dates · Mar 10–25, 2024 (UTC)
        </h2>
        <PharoLineChart
          label="Recorded candidate measurements"
          series={[
            {
              id: 'recorded',
              label: 'Recorded sensor',
              points: recordedDates.map((x, index) => ({
                x,
                y: index === 2 ? null : 10 + index * 2,
              })),
            },
          ]}
          xTickValues={recordedDates}
          formatXAxis={(value) => shortDate.format(value)}
          yAxisLabel="Recorded level"
        />
      </section>
      <section aria-label="Missing measurement example">
        <h2 className="text-pharo-lg font-semibold">Missing observations split the line</h2>
        <PharoLineChart
          label="Missing measurements"
          series={[
            {
              id: 'gapped',
              label: 'Recorded measurements',
              points: [
                { x: march10, y: 0 },
                { x: march11, y: null },
                { x: march12, y: 20 },
              ],
            },
          ]}
        />
      </section>
      <section aria-label="Unequal calendar example" className="min-w-0">
        <h2 className="mb-pharo-3 text-pharo-lg font-semibold">Different recording calendars</h2>
        <PharoLineChart
          label="Unequal calendar measurements"
          description="Recorded March 10 through 13, with missing and absent observations."
          series={unequalSeries}
          xAxisLabel="Date (UTC)"
          yAxisLabel="Recorded level"
        />
      </section>
      <section aria-label="Custom format example" className="min-w-0">
        <h2 className="mb-pharo-3 text-pharo-lg font-semibold">Full formatted readings</h2>
        <PharoLineChart
          label="Custom formatted measurements"
          series={[
            {
              id: 'formatted',
              label: 'Precision reading with its full unit description',
              points: [{ x: march10, y: 123456789.12345679 }],
            },
          ]}
          formatXDetail={fullDate}
          formatXTable={fullDate}
          formatXAccessible={fullDate}
          formatYDetail={fullValue}
          formatYTable={fullValue}
        />
      </section>
      <section aria-label="External data example" className="min-w-0">
        <h2 className="text-pharo-lg font-semibold">Consumer-owned data access</h2>
        <button
          id="external-data-trigger"
          type="button"
          hidden={externalHidden}
          aria-controls="external-data-region"
          aria-expanded={externalOpen}
          className="min-h-pharo-control rounded-pharo-control border border-pharo-control-border px-pharo-3 focus-visible:pharo-focus-ring"
          onClick={() => setExternalOpen((open) => !open)}
        >
          View external records
        </button>
        <button type="button" onClick={() => setExternalHidden((hidden) => !hidden)}>
          Toggle external trigger visibility
        </button>
        <PharoLineChart
          label="External recorded measurements"
          series={unequalSeries}
          dataTable={
            externalHidden
              ? { mode: 'inline' }
              : { mode: 'external', triggerId: 'external-data-trigger' }
          }
        />
        <div id="external-data-region" hidden={!externalOpen}>
          {externalOpen ? (
            <PharoChartDataTable series={unequalSeries} caption="External recorded values" />
          ) : null}
        </div>
      </section>
      <section aria-label="Unavailable external trigger example">
        <h2 className="text-pharo-lg font-semibold">Safe inline fallback</h2>
        <PharoLineChart
          label="Unavailable external trigger"
          series={[north]}
          dataTable={{ mode: 'inline' }}
        />
        <PharoLineChart
          label="Blank external trigger"
          series={[north]}
          dataTable={{ mode: 'external', triggerId: ' ' }}
        />
      </section>
      <section aria-label="Controlled date example" className="min-w-0 space-y-pharo-3">
        <h2 className="text-pharo-lg font-semibold">Consumer-owned date</h2>
        <p>
          Comparison date:{' '}
          {selectedTimestamp === null
            ? 'Latest'
            : new Date(selectedTimestamp).toISOString().slice(0, 10)}
        </p>
        <p>Explicit date changes: {dateCommits}</p>
        <button
          type="button"
          className="min-h-pharo-control rounded-pharo-control border border-pharo-control-border px-pharo-3 focus-visible:pharo-focus-ring"
          onClick={() => setSelectedTimestamp(null)}
        >
          Back to latest comparison
        </button>
        <PharoLineChart
          label="Controlled measurements"
          series={unequalSeries}
          selectedTimestamp={selectedTimestamp}
          onTimestampChange={(timestamp) => {
            setSelectedTimestamp(timestamp);
            setDateCommits((count) => count + 1);
          }}
        />
      </section>
      <section aria-label="Empty example">
        <h2 className="text-pharo-lg font-semibold">No measurements</h2>
        <PharoLineChart label="Empty measurements" series={[]} />
      </section>
      <section aria-label="Invalid example">
        <h2 className="text-pharo-lg font-semibold">Invalid measurements</h2>
        <PharoLineChart
          label="Invalid measurements"
          series={[
            { id: 'invalid', label: 'Invalid sample', points: [{ x: march10, y: Infinity }] },
          ]}
        />
      </section>
    </main>
  );
}

const container = document.getElementById('root');

if (!container) throw new Error('The chart fixture root is missing.');

createRoot(container).render(<App />);
