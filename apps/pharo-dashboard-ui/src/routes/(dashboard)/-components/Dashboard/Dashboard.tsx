import { useId, useRef, useState } from 'react';
import { PricesApi } from '../../../../api/prices';
import { getSeriesWindows, toChartSeries } from './adapters/priceSeries';
import { DashboardToolbar } from './components/DashboardToolbar';
import { ComparisonMatrix } from './components/ComparisonMatrix';
import { ObservationDialog } from './components/ObservationDialog';
import { PriceHistory } from './components/PriceHistory';
import { dashboardStyles } from './styles';
import { useSeriesAppearances } from './hooks/useSeriesAppearances';
import { getComparisonTimeline } from './utils';
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
  const dataTriggerId = useId();
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);

  // Clearing every instrument starts the next comparison at Latest; changing mode keeps the pin.
  if (selectedTickers.length === 0 && selectedTimestamp !== null) setSelectedTimestamp(null);

  const appearances = useSeriesAppearances(selectedTickers);

  // Start both resource families together, independent of instrument-list availability.
  const prices = PricesApi.useGetPrices(apiClient, selectedTickers);

  const statistics = PricesApi.useGetPriceStats(apiClient, selectedTickers);

  const missingTickers = selectedTickers.filter(
    (_, index) =>
      prices[index]?.error?.kind === 'not-found' || statistics[index]?.error?.kind === 'not-found',
  );

  const priceResources = selectedTickers.flatMap((ticker, index) => {
    const query = prices[index];
    return query ? [{ ticker, query, appearance: appearances.get(ticker) }] : [];
  });

  const columns = selectedTickers.flatMap((ticker, index) => {
    const priceQuery = prices[index];
    const statsQuery = statistics[index];

    return priceQuery && statsQuery
      ? [
          {
            ticker,
            prices: priceQuery,
            statistics: statsQuery,
            appearance: appearances.get(ticker),
          },
        ]
      : [];
  });

  const removeInstrument = async (ticker: string) => {
    const outcome = await onAction({ type: 'remove', tickers: [ticker] });

    if (outcome === 'committed') pickerInputRef.current?.focus();
  };

  const rawSeries = priceResources.map(({ ticker, query, appearance }) =>
    toChartSeries(ticker, query.data ?? [], appearance),
  );
  const windows = getSeriesWindows(rawSeries);
  const timeline = getComparisonTimeline(rawSeries);

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
        <p
          role={selectionNotice.kind === 'invalid' ? 'alert' : 'status'}
          className={
            selectionNotice.kind === 'invalid'
              ? dashboardStyles.errorNotice
              : dashboardStyles.notice
          }
        >
          {selectionNotice.message}
        </p>
      )}
      {missingTickers.length > 0 && (
        <p role="alert" className={dashboardStyles.errorNotice}>
          Not in this dataset: {missingTickers.join(', ')}. Remove unavailable instruments from your
          selection.
        </p>
      )}

      <DashboardToolbar
        apiClient={apiClient}
        selectedTickers={selectedTickers}
        mode={mode}
        appearances={appearances}
        windows={windows}
        onAction={onAction}
        pickerInputRef={pickerInputRef}
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
          <div className={dashboardStyles.workspace}>
            <PriceHistory
              resources={priceResources}
              mode={mode}
              externalDataTriggerId={dataTriggerId}
              selectedTimestamp={selectedTimestamp}
              onTimestampChange={setSelectedTimestamp}
            />
            <div className={dashboardStyles.details}>
              <ComparisonMatrix
                columns={columns}
                onRemove={removeInstrument}
                selectedTimestamp={selectedTimestamp}
                timeline={timeline}
                onTimestampChange={setSelectedTimestamp}
              />
              <ObservationDialog triggerId={dataTriggerId} series={rawSeries} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
