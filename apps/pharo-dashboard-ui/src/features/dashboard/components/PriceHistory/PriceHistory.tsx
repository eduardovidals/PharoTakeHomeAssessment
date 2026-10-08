import { PharoButton, PharoSpinner } from '@pharo/react-components';
import { PharoLineChart } from '@pharo/react-charts';
import { toChartSeries } from '../../adapters/priceSeries';
import { recordedDateTicks } from '../../adapters/recordedDateTicks';
import {
  datesSpanYears,
  formatDateAxis,
  formatDateDetail,
  formatDateRange,
  formatDateTable,
  toUtcTimestamp,
} from '../../../../utils/date';
import { formatPrice } from '../../../../utils/number';
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
  const { resources } = props;
  const available = resources.filter((resource) => (resource.query.data?.length ?? 0) > 0).length;
  const pending = resources.some((resource) => resource.query.isPending);
  const series = resources.map((resource) =>
    toChartSeries(resource.ticker, resource.query.data ?? []),
  );
  const ticks = recordedDateTicks(series);
  const includeYear = datesSpanYears(ticks.at(0), ticks.at(-1));
  const formatAxis = (timestamp: number) => formatDateAxis(timestamp, includeYear);
  return (
    <section aria-label="Historical closing prices" className={historyStyles.panel}>
      <h2 className={historyStyles.heading}>Historical closing prices</h2>
      <p className={historyStyles.description}>
        Raw closing prices on recorded UTC dates. Price units are supplied by the dataset.
      </p>
      {available > 0 ? (
        <>
          <p className={historyStyles.notice}>
            {available} of {resources.length} selected histories available.
          </p>
          <p className={historyStyles.notice}>{formatDateRange(ticks.at(0), ticks.at(-1))} (UTC)</p>
          <PharoLineChart
            label="Historical closing prices"
            description="Compare actual recorded closing prices; unavailable histories have no observations."
            series={series}
            xAxisLabel="Date (UTC)"
            yAxisLabel="Price"
            xTickValues={ticks}
            formatXAxis={formatAxis}
            formatX={formatDateDetail}
            formatY={formatPrice}
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
        {resources.map(({ ticker, query }) => {
          const first = query.data?.at(0);
          const latest = query.data?.at(-1);
          const failed = query.isError && query.error.kind !== 'cancelled';
          return (
            <section
              key={ticker}
              aria-label={`${ticker} prices`}
              className={historyStyles.resource}
            >
              <h3 className={historyStyles.resourceHeading}>{ticker} prices</h3>
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
