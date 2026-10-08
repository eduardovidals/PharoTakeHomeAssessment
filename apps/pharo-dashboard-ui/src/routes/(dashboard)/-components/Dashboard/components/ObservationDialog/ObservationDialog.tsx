import { useState } from 'react';
import { PharoDialog } from '@pharo/react-components';
import { PharoChartDataTable } from '@pharo/react-charts';
import {
  formatDateAccessible,
  formatDateRange,
  formatDateTable,
} from '../../../../../../utils/date';
import { formatPrice } from '../../../../../../utils/number';
import { observationStyles } from './styles';
import type { ObservationDialogProps as Props } from './types';
import { getObservationWindowGroups } from './utils';

/**
 * Reveal complete raw records without fetching or changing the surrounding analysis.
 * @example
 * ```tsx
 * <ObservationDialog triggerId={dataTriggerId} series={rawSeries} />
 * ```
 */
export function ObservationDialog(props: Props) {
  const { triggerId, series } = props;
  const [isOpen, setIsOpen] = useState(false);
  const windows = getObservationWindowGroups(series);

  return (
    <div className={observationStyles.trigger}>
      <PharoDialog
        triggerId={triggerId}
        triggerLabel="View data"
        title="Raw observations"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      >
        <div className={observationStyles.content}>
          <p className={observationStyles.description}>
            Raw closing prices in the dataset’s supplied units; currency is not specified. These
            values stay raw in both Price and Performance views.
          </p>
          <ul aria-label="Recorded windows by instrument" className={observationStyles.windows}>
            {windows.map(({ id, labels, window }) => (
              <li key={id} className={observationStyles.window}>
                {labels.join(', ')}:{' '}
                {window ? (
                  <>
                    {formatDateRange(window.firstTimestamp, window.lastTimestamp)} (UTC),{' '}
                    {window.observationCount}{' '}
                    {window.observationCount === 1 ? 'observation' : 'observations'}
                    {labels.length > 1 ? ' each.' : '.'}
                    {window.baseTimestamp !== undefined && (
                      <> Performance base: {formatDateTable(window.baseTimestamp)}.</>
                    )}
                  </>
                ) : (
                  'No recorded observations currently available.'
                )}
              </li>
            ))}
          </ul>
          <PharoChartDataTable
            className={observationStyles.table}
            series={series}
            caption="Recorded closing prices"
            formatXTable={formatDateTable}
            formatXAccessible={formatDateAccessible}
            formatYTable={formatPrice}
          />
        </div>
      </PharoDialog>
    </div>
  );
}
