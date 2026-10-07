import { useId, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { PharoButton, PharoSpinner } from '@pharo/react-components';
import { instrumentsQueryOptions } from '../../../../api/instruments';
import { pricesQueryOptions, priceStatsQueryOptions } from '../../../../api/prices';
import { dashboardStyles } from './styles';
import type { DashboardProps as Props } from './types';

const displayNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/**
 * Inspect independently cached market resources while the route owns selection.
 * @example
 * ```tsx
 * <Dashboard apiClient={apiClient} selectedTickers={tickers}
 *   onSelect={selectTicker} onRemove={removeTicker} onClear={clearTickers} />
 * ```
 */
export function Dashboard(props: Props) {
  const { apiClient, selectedTickers, selectionNotice, onSelect, onRemove, onClear } = props;
  const instrumentsId = useId();
  const selectionId = useId();
  const [actionNotice, setActionNotice] = useState<'limit' | 'navigation'>();
  const instruments = useQuery(instrumentsQueryOptions(apiClient));
  const prices = useQueries({
    queries: selectedTickers.map((ticker) => pricesQueryOptions(apiClient, ticker)),
  });
  const statistics = useQueries({
    queries: selectedTickers.map((ticker) => priceStatsQueryOptions(apiClient, ticker)),
  });

  async function selectTicker(ticker: string): Promise<void> {
    try {
      const outcome = await onSelect(ticker);
      setActionNotice(outcome === 'limit' ? 'limit' : undefined);
    } catch {
      setActionNotice('navigation');
    }
  }

  async function changeSelection(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      setActionNotice(undefined);
    } catch {
      setActionNotice('navigation');
    }
  }

  return (
    <main className={dashboardStyles.page}>
      <header>
        <h1 className={dashboardStyles.heading}>Instrument price dashboard</h1>
        <p className={dashboardStyles.description}>
          Compare up to three instruments from the supplied historical dataset.
        </p>
      </header>

      {selectionNotice && (
        <p role="status" className={dashboardStyles.notice}>
          {selectionNotice.message}
        </p>
      )}
      {(actionNotice === 'navigation' ||
        (actionNotice === 'limit' && selectedTickers.length === 3)) && (
        <p role="status" className={dashboardStyles.notice}>
          {actionNotice === 'limit'
            ? 'You can compare up to three instruments. Remove one before adding another.'
            : 'The selection could not be updated. Please try again.'}
        </p>
      )}

      <section aria-labelledby={instrumentsId} className={dashboardStyles.panel}>
        <h2 id={instrumentsId} className={dashboardStyles.subheading}>
          Available instruments
        </h2>
        {instruments.isPending && (
          <div className={dashboardStyles.loading}>
            <PharoSpinner label="Loading instruments" size="sm" />
            <p>Loading instruments…</p>
          </div>
        )}
        {instruments.isError && instruments.error.kind !== 'cancelled' && (
          <div>
            <p role="alert" className={dashboardStyles.error}>
              {instruments.error.message}
            </p>
            <PharoButton variant="secondary" onPress={() => void instruments.refetch()}>
              Retry instruments
            </PharoButton>
          </div>
        )}
        {instruments.data && (
          <>
            {instruments.data.length === 0 && (
              <p className={dashboardStyles.empty}>No instruments are available.</p>
            )}
            <ul aria-label="Instrument choices" className={dashboardStyles.instruments}>
              {instruments.data.map((ticker) => (
                <li key={ticker}>
                  <PharoButton
                    variant={selectedTickers.includes(ticker) ? 'primary' : 'secondary'}
                    aria-label={`Select ${ticker}`}
                    aria-pressed={selectedTickers.includes(ticker)}
                    onPress={() => void selectTicker(ticker)}
                  >
                    {ticker}
                  </PharoButton>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby={selectionId}>
        <div className={dashboardStyles.header}>
          <h2 id={selectionId} className={dashboardStyles.subheading}>
            Selected instruments
          </h2>
          {selectedTickers.length > 0 && (
            <PharoButton variant="secondary" onPress={() => void changeSelection(onClear)}>
              Clear selection
            </PharoButton>
          )}
        </div>
        {selectedTickers.length === 0 && (
          <p className={dashboardStyles.empty}>
            Select an instrument to view its prices and statistics.
          </p>
        )}
        <div className={dashboardStyles.selection}>
          {selectedTickers.map((ticker, index) => {
            const priceQuery = prices[index];
            const statsQuery = statistics[index];
            if (!priceQuery || !statsQuery) return null;
            const latest = priceQuery.data?.at(-1);
            const priceFailed = priceQuery.isError && priceQuery.error.kind !== 'cancelled';
            const statsFailed = statsQuery.isError && statsQuery.error.kind !== 'cancelled';
            return (
              <article
                key={ticker}
                aria-label={`${ticker} market data`}
                className={dashboardStyles.article}
              >
                <div className={dashboardStyles.header}>
                  <h3 className={dashboardStyles.subheading}>{ticker}</h3>
                  <PharoButton
                    variant="quiet"
                    aria-label={`Remove ${ticker}`}
                    onPress={() => void changeSelection(() => onRemove(ticker))}
                  >
                    Remove
                  </PharoButton>
                </div>
                {(priceFailed || statsFailed) && (
                  <p className={dashboardStyles.error}>
                    Results for {ticker} are incomplete. Available data remains below.
                  </p>
                )}
                <section aria-label={`${ticker} prices`} className={dashboardStyles.resource}>
                  <h4 className={dashboardStyles.resourceHeading}>Prices</h4>
                  {priceQuery.isPending && (
                    <div className={dashboardStyles.loading}>
                      <PharoSpinner label={`Loading ${ticker} prices`} size="sm" />
                      <p>Loading prices…</p>
                    </div>
                  )}
                  {priceFailed && (
                    <div>
                      <p role="alert" className={dashboardStyles.error}>
                        {priceQuery.error.message}
                      </p>
                      <PharoButton variant="secondary" onPress={() => void priceQuery.refetch()}>
                        Retry {ticker} prices
                      </PharoButton>
                    </div>
                  )}
                  {priceQuery.data && (
                    <dl className={dashboardStyles.values}>
                      <div>
                        <dt>Observations</dt>
                        <dd className={dashboardStyles.value}>{priceQuery.data.length}</dd>
                      </div>
                      <div>
                        <dt>Latest date (UTC)</dt>
                        <dd className={dashboardStyles.value}>
                          {latest ? (
                            <time dateTime={latest.date}>{latest.date}</time>
                          ) : (
                            'Unavailable'
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Latest close</dt>
                        <dd className={dashboardStyles.value}>
                          {latest ? displayNumber.format(latest.price) : 'Unavailable'}
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>
                <section aria-label={`${ticker} statistics`} className={dashboardStyles.resource}>
                  <h4 className={dashboardStyles.resourceHeading}>Statistics</h4>
                  {statsQuery.isPending && (
                    <div className={dashboardStyles.loading}>
                      <PharoSpinner label={`Loading ${ticker} statistics`} size="sm" />
                      <p>Loading statistics…</p>
                    </div>
                  )}
                  {statsFailed && (
                    <div>
                      <p role="alert" className={dashboardStyles.error}>
                        {statsQuery.error.message}
                      </p>
                      <PharoButton variant="secondary" onPress={() => void statsQuery.refetch()}>
                        Retry {ticker} statistics
                      </PharoButton>
                    </div>
                  )}
                  {statsQuery.data && (
                    <dl className={dashboardStyles.values}>
                      <div>
                        <dt>Total return</dt>
                        <dd className={dashboardStyles.value}>
                          {displayNumber.format(statsQuery.data.totalReturnPercent)}%
                        </dd>
                      </div>
                      <div>
                        <dt>Daily sample volatility</dt>
                        <dd className={dashboardStyles.value}>
                          {statsQuery.data.dailyVolatilityPercent === null
                            ? 'Unavailable — insufficient observations'
                            : `${displayNumber.format(statsQuery.data.dailyVolatilityPercent)}%`}
                        </dd>
                      </div>
                      <div>
                        <dt>Maximum drawdown</dt>
                        <dd className={dashboardStyles.value}>
                          {displayNumber.format(statsQuery.data.maxDrawdownPercent)}%
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
