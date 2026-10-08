import { PharoButton, PharoSpinner } from '@pharo/react-components';
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
  toUtcTimestamp,
} from '../../../../utils/date';
import { formatPrice, formatPriceAxis, formatSignedPercentage } from '../../../../utils/number';
import { historyStyles } from './styles';
import type { PriceHistoryProps as Props } from './types';

/**
 * Compare available raw histories while retaining every selected resource identity.
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
          <p className={historyStyles.notice}>
            {available} of {resources.length} selected histories available.
          </p>
          {mismatched ? (
            <div className={historyStyles.notice}>
              <p>
                Recorded windows differ.
                {mode === 'performance' && ' Each instrument uses its own first recorded price.'}
              </p>
              <ul>
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
          ) : (
            <p className={historyStyles.notice}>
              {formatDateRange(ticks.at(0), ticks.at(-1))} (UTC)
            </p>
          )}
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
        <p className={historyStyles.notice}>
          {resources.length === 0
            ? 'Select an instrument to view its historical closing prices.'
            : pending
              ? 'Loading selected price histories…'
              : 'No selected price history is currently available.'}
        </p>
      )}
      <div className={historyStyles.summaries}>
        {resources.map(({ ticker, query }, index) => {
          const first = query.data?.at(0);
          const latest = query.data?.at(-1);
          const failed = query.isError && query.error.kind !== 'cancelled';
          const performance = transformed?.[index];
          return (
            <section
              key={ticker}
              aria-label={`${ticker} prices`}
              className={historyStyles.resource}
            >
              <h3 className={historyStyles.resourceHeading}>{ticker} prices</h3>
              {performance?.kind === 'unavailable' && performance.reason !== 'no-observations' && (
                <p className={historyStyles.notice}>
                  Rebased price change is unavailable for this history. Raw prices remain available
                  in Price view.
                </p>
              )}
              {query.isPending && (
                <div className={historyStyles.loading}>
                  <PharoSpinner label={`Loading ${ticker} prices`} size="sm" />
                  <p>Loading prices…</p>
                </div>
              )}
              {failed && (
                <div>
                  <p role="alert" className={historyStyles.error}>
                    {query.error.message}
                  </p>
                  <PharoButton
                    className={historyStyles.retry}
                    variant="secondary"
                    onPress={() => void query.refetch()}
                  >
                    Retry {ticker} prices
                  </PharoButton>
                </div>
              )}
              {query.data &&
                (first && latest ? (
                  <dl className={historyStyles.values}>
                    <div>
                      <dt className={historyStyles.label}>Observations</dt>
                      <dd className={historyStyles.value}>{query.data.length}</dd>
                    </div>
                    <div>
                      <dt className={historyStyles.label}>First date (UTC)</dt>
                      <dd className={historyStyles.value}>
                        <time dateTime={first.date}>
                          {formatDateTable(toUtcTimestamp(first.date))}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt className={historyStyles.label}>Latest date (UTC)</dt>
                      <dd className={historyStyles.value}>
                        <time dateTime={latest.date}>
                          {formatDateTable(toUtcTimestamp(latest.date))}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt className={historyStyles.label}>Latest close</dt>
                      <dd className={historyStyles.value}>{formatPrice(latest.price)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className={historyStyles.notice}>
                    No recorded prices are available for {ticker}.
                  </p>
                ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
