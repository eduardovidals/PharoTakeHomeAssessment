import { PharoLineChart } from '@pharo/react-charts';
import {
  getSeriesWindows,
  haveMismatchedWindows,
  toChartSeries,
  toPerformanceSeries,
} from '../../adapters/priceSeries';
import { recordedDateTicks } from '../../adapters/recordedDateTicks';
import {
  datesSpanYears,
  formatDateAccessible,
  formatDateAxis,
  formatDateDetail,
  formatDateRange,
  formatDateTable,
} from '../../../../utils/date';
import { formatPrice, formatPriceAxis, formatSignedPercentage } from '../../../../utils/number';
import { historyStyles } from './styles';
import type { PriceHistoryProps as Props } from './types';

/**
 * Render available histories while the comparison matrix owns resource status and actions.
 * @example
 * ```tsx
 * <PriceHistory resources={selectedPriceResources} />
 * ```
 */
export function PriceHistory(props: Props) {
  const { resources, mode = 'price' } = props;
  const available = resources.filter((resource) => (resource.query.data?.length ?? 0) > 0).length;
  const pending = resources.some((resource) => resource.query.isPending);
  const rawSeries = resources.map((resource) =>
    toChartSeries(resource.ticker, resource.query.data ?? [], resource.appearance),
  );
  const transformed = mode === 'performance' ? rawSeries.map(toPerformanceSeries) : undefined;
  const series = transformed?.map((result) => result.series) ?? rawSeries;
  const windows = getSeriesWindows(rawSeries);
  const mismatched = haveMismatchedWindows(windows);
  const label = mode === 'performance' ? 'Rebased price change' : 'Historical closing prices';
  const description =
    mode === 'performance'
      ? 'Price change from each instrument’s own first recorded price. This is not adjusted total return.'
      : 'Raw closing prices on recorded UTC dates. Price units are supplied by the dataset.';
  const ticks = recordedDateTicks(series);
  const includeYear = datesSpanYears(ticks.at(0), ticks.at(-1));
  const formatAxis = (timestamp: number) => formatDateAxis(timestamp, includeYear);
  return (
    <section aria-label={label} className={historyStyles.panel}>
      <h2 className={historyStyles.heading}>{label}</h2>
      <p className={historyStyles.description}>{description}</p>
      {available > 0 ? (
        <>
          {mismatched ? (
            <div className={historyStyles.notice}>
              <ul aria-label="Recorded windows by instrument">
                {windows.map((window) => (
                  <li key={window.id}>
                    {window.label}: {formatDateRange(window.firstTimestamp, window.lastTimestamp)}{' '}
                    (UTC), {window.observationCount}{' '}
                    {window.observationCount === 1 ? 'observation' : 'observations'}.
                    {mode === 'performance' && <> Base: {formatDateTable(window.baseTimestamp)}.</>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <PharoLineChart
            label={label}
            description={description}
            series={series}
            xAxisLabel="Date (UTC)"
            yAxisLabel={mode === 'performance' ? 'Price change (%)' : 'Price'}
            baselineY={mode === 'performance' ? 0 : undefined}
            xTickValues={ticks}
            formatXAxis={formatAxis}
            formatXDetail={formatDateDetail}
            formatXTable={formatDateTable}
            formatXAccessible={formatDateAccessible}
            formatYAxis={formatPriceAxis}
            formatYDetail={mode === 'performance' ? formatSignedPercentage : formatPrice}
            formatYTable={mode === 'performance' ? formatSignedPercentage : formatPrice}
          />
        </>
      ) : (
        <p className={historyStyles.placeholder}>
          {resources.length === 0
            ? 'Select an instrument to view its historical closing prices.'
            : pending
              ? 'Loading selected price histories…'
              : 'No selected price history is currently available.'}
        </p>
      )}
      {transformed?.map((result) =>
        result.kind === 'unavailable' && result.reason !== 'no-observations' ? (
          <p key={result.series.id} className={historyStyles.notice}>
            Rebased price change is unavailable for {result.series.label}. Raw prices remain
            available in Price view.
          </p>
        ) : null,
      )}
    </section>
  );
}
