import { useState } from 'react';
import { PharoSegmentedControl } from '@pharo/react-components';
import type { ChartMode } from '../../../../../../app/types';
import { formatDateRange } from '../../../../../../utils/date';
import { haveMismatchedWindows } from '../../../../adapters/priceSeries';
import { InstrumentPicker } from './components/InstrumentPicker';
import { toolbarStyles } from './styles';
import type { DashboardToolbarProps as Props } from './types';

/**
 * Place selection, exclusive chart view and truthful available-window context together.
 * @example
 * ```tsx
 * <DashboardToolbar apiClient={apiClient} selectedTickers={tickers} mode={mode}
 *   appearances={appearances} windows={windows} onAction={dispatch} />
 * ```
 */
export function DashboardToolbar(props: Props) {
  const { apiClient, selectedTickers, mode, appearances, windows, onAction, pickerInputRef } =
    props;
  const [viewChangeFailed, setViewChangeFailed] = useState(false);
  const firstWindow = windows.at(0);
  const mismatched = haveMismatchedWindows(windows);
  const handleViewChange = async (view: ChartMode) => {
    try {
      await onAction({ type: 'set-view', view });
      setViewChangeFailed(false);
    } catch {
      setViewChangeFailed(true);
    }
  };

  return (
    <section aria-label="Comparison controls" className={toolbarStyles.root}>
      <InstrumentPicker
        apiClient={apiClient}
        selectedTickers={selectedTickers}
        appearances={appearances}
        onAction={onAction}
        inputRef={pickerInputRef}
      />
      <div className={toolbarStyles.controls}>
        <PharoSegmentedControl
          label="Chart view"
          value={mode}
          onChange={handleViewChange}
          options={[
            { value: 'price', label: 'Price' },
            { value: 'performance', label: 'Performance' },
          ]}
        />
        {firstWindow && (
          <p className={toolbarStyles.range}>
            {windows.length < selectedTickers.length && (
              <span>
                Available histories: {windows.length} of {selectedTickers.length}.
              </span>
            )}
            {mismatched ? (
              'Recorded windows differ.'
            ) : (
              <>
                <span>
                  {formatDateRange(firstWindow.firstTimestamp, firstWindow.lastTimestamp)} (UTC)
                </span>
                <span className={toolbarStyles.count}>
                  {firstWindow.observationCount}{' '}
                  {firstWindow.observationCount === 1 ? 'observation' : 'observations'}
                </span>
              </>
            )}
          </p>
        )}
        {viewChangeFailed && (
          <p role="status" className={toolbarStyles.error}>
            The chart view could not be updated. Please try again.
          </p>
        )}
      </div>
    </section>
  );
}
