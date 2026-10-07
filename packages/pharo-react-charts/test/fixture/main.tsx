import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PharoLineChart } from '@pharo/react-charts';
import type { PharoChartSeries } from '@pharo/react-charts';
import './styles.css';

const march10 = Date.UTC(2024, 2, 10);
const march11 = Date.UTC(2024, 2, 11);
const march12 = Date.UTC(2024, 2, 12);
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
  const [narrow, setNarrow] = useState(false);
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
