import { useId } from 'react';
import { useQueries } from '@tanstack/react-query';
import { pricesQueryOptions, priceStatsQueryOptions } from '../../../../api/prices';
import { getSeriesWindows, toChartSeries } from '../../adapters/priceSeries';
import { DashboardToolbar } from './components/DashboardToolbar';
import { InstrumentStatistics } from '../InstrumentStatistics';
import { PriceHistory } from '../PriceHistory';
import { appearanceStyles, dashboardStyles } from './styles';
import { useSeriesAppearances } from './hooks/useSeriesAppearances';
import type { DashboardProps as Props } from './types';

/**
 * Compose historical analysis from independently cached resources and URL selection.
 * @example
 * ```tsx
 * <Dashboard apiClient={apiClient} selectedTickers={tickers}
 *   mode={mode} onAction={dispatchAction} />
 * ```
 */
export function Dashboard(props: Props) {
  const { apiClient, selectedTickers, selectionNotice, mode, onAction } = props;
  const selectionId = useId();
  const appearances = useSeriesAppearances(selectedTickers);
  // Start both resource families together, independent of instrument-list availability.
  const prices = useQueries({
    queries: selectedTickers.map((ticker) => pricesQueryOptions(apiClient, ticker)),
  });
  const statistics = useQueries({
    queries: selectedTickers.map((ticker) => priceStatsQueryOptions(apiClient, ticker)),
  });
  const priceResources = selectedTickers.flatMap((ticker, index) => {
    const query = prices[index];
    return query ? [{ ticker, query, appearance: appearances.get(ticker) }] : [];
  });

  const windows = getSeriesWindows(
    priceResources.map(({ ticker, query }) => toChartSeries(ticker, query.data ?? [])),
  );

  return (
    <main className={dashboardStyles.page}>
      <header className={dashboardStyles.header}>
        <div className={dashboardStyles.identity}>
          <p className={dashboardStyles.wordmark}>PHARO</p>
          <h1 className={dashboardStyles.heading}>Instrument Analytics</h1>
        </div>
        <p className={dashboardStyles.descriptor}>Synthetic historical data</p>
      </header>

      {selectionNotice && (
        <p role="status" className={dashboardStyles.notice}>
          {selectionNotice.message}
        </p>
      )}

      <DashboardToolbar
        apiClient={apiClient}
        selectedTickers={selectedTickers}
        mode={mode}
        appearances={appearances}
        windows={windows}
        onAction={onAction}
      />
      <section aria-labelledby={selectionId} className={dashboardStyles.analysis}>
        <h2 id={selectionId} className={dashboardStyles.selectionHeading}>
          Selected instruments
        </h2>
        {selectedTickers.length === 0 ? (
          <div className={dashboardStyles.empty}>
            <h3 className={dashboardStyles.subheading}>Start with an instrument</h3>
            <p>Select an instrument to view its prices and statistics.</p>
          </div>
        ) : (
          <>
            <PriceHistory resources={priceResources} mode={mode} />
            <div className={dashboardStyles.selection}>
              {selectedTickers.map((ticker, index) => {
                const priceQuery = prices[index];
                const statsQuery = statistics[index];
                const appearance = appearances.get(ticker);
                if (!priceQuery || !statsQuery) return null;
                const incomplete =
                  (priceQuery.isError && priceQuery.error.kind !== 'cancelled') ||
                  (statsQuery.isError && statsQuery.error.kind !== 'cancelled');
                return (
                  <article
                    key={ticker}
                    aria-label={`${ticker} market data`}
                    className={dashboardStyles.article}
                  >
                    <h3
                      className={dashboardStyles.subheading}
                      data-series-id={ticker}
                      data-appearance={appearance}
                    >
                      {appearance && (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 12"
                          className={appearanceStyles[appearance]}
                        >
                          <line x1="0" x2="24" y1="6" y2="6" strokeWidth="2" />
                        </svg>
                      )}
                      <span className={dashboardStyles.ticker}>{ticker}</span>
                    </h3>
                    {incomplete && (
                      <p className={dashboardStyles.error}>
                        Results for {ticker} are incomplete. Available data remains visible.
                      </p>
                    )}
                    <InstrumentStatistics ticker={ticker} query={statsQuery} />
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
