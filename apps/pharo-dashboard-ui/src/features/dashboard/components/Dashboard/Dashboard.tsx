import { useId, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { PharoSegmentedControl } from '@pharo/react-components';
import type { ChartMode } from '../../../../app/types';
import { pricesQueryOptions, priceStatsQueryOptions } from '../../../../api/prices';
import { InstrumentSelector } from '../InstrumentSelector';
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
 *   mode={mode} onViewChange={changeView}
 *   onSelect={selectTicker} onRemove={removeTicker} onClear={clearTickers} />
 * ```
 */
export function Dashboard(props: Props) {
  const {
    apiClient,
    selectedTickers,
    selectionNotice,
    onSelect,
    onRemove,
    onClear,
    mode,
    onViewChange,
  } = props;
  const selectionId = useId();
  const appearances = useSeriesAppearances(selectedTickers);
  const [viewChangeFailed, setViewChangeFailed] = useState(false);
  const handleViewChange = async (view: ChartMode) => {
    try {
      await onViewChange(view);
      setViewChangeFailed(false);
    } catch {
      setViewChangeFailed(true);
    }
  };
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

  return (
    <main className={dashboardStyles.page}>
      <header className={dashboardStyles.hero}>
        <div className={dashboardStyles.brandRow}>
          <p className={dashboardStyles.wordmark}>PHARO</p>
          <p className={dashboardStyles.descriptor}>Synthetic historical data</p>
        </div>
        <h1 className={dashboardStyles.heading}>Instrument price dashboard</h1>
        <p className={dashboardStyles.description}>
          Explore closing prices and compare up to three instruments from the supplied dataset.
        </p>
      </header>

      {selectionNotice && (
        <p role="status" className={dashboardStyles.notice}>
          {selectionNotice.message}
        </p>
      )}

      <div className={dashboardStyles.layout}>
        <InstrumentSelector
          apiClient={apiClient}
          selectedTickers={selectedTickers}
          onSelect={onSelect}
          onRemove={onRemove}
          onClear={onClear}
          appearances={appearances}
        />

        <section aria-labelledby={selectionId} className={dashboardStyles.analysis}>
          <div className={dashboardStyles.header}>
            <h2 id={selectionId} className={dashboardStyles.subheading}>
              Selected instruments
            </h2>
            <p className={dashboardStyles.count}>{selectedTickers.length} of 3 selected</p>
          </div>
          <PharoSegmentedControl
            label="Chart view"
            value={mode}
            onChange={handleViewChange}
            options={[
              { value: 'price', label: 'Price' },
              { value: 'performance', label: 'Performance' },
            ]}
          />
          {viewChangeFailed && (
            <p role="status" className={dashboardStyles.error}>
              The chart view could not be updated. Please try again.
            </p>
          )}
          {selectedTickers.length === 0 ? (
            <div className={dashboardStyles.empty}>
              <h3 className={dashboardStyles.subheading}>Start with an instrument</h3>
              <p>Select an instrument to view its prices and statistics.</p>
              <p className={dashboardStyles.hint}>
                Search or browse the list, then add another instrument to compare their actual
                closing prices. Your selection stays in the page link.
              </p>
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
      </div>
    </main>
  );
}
