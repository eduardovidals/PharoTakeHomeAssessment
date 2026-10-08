import { useImperativeHandle, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PharoButton, PharoMultiComboBox } from '@pharo/react-components';
import type { PharoSelectionAction } from '@pharo/react-components';
import { instrumentsQueryOptions } from '../../../../../../../../api/instruments';
import { useInstrumentShortcut } from './hooks/useInstrumentShortcut';
import { appearanceStyles, pickerStyles } from './styles';
import { rankInstruments, toDashboardAction } from './utils';
import type { InstrumentPickerProps as Props } from './types';

/**
 * Search one cached list while the route owns ordered committed instruments.
 * @example
 * ```tsx
 * <InstrumentPicker apiClient={apiClient} selectedTickers={tickers}
 *   appearances={appearances} onAction={dispatch} />
 * ```
 */
export function InstrumentPicker(props: Props) {
  const { apiClient, selectedTickers, appearances, onAction, inputRef: externalInputRef } = props;
  const instruments = useQuery(instrumentsQueryOptions(apiClient));
  const [query, setQuery] = useState('');
  const [navigationFailed, setNavigationFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle<HTMLInputElement | null, HTMLInputElement | null>(
    externalInputRef,
    () => inputRef.current,
  );
  useInstrumentShortcut({ inputRef });
  const known = instruments.data ?? [];
  const items = rankInstruments(known, query);
  const listFailure = instruments.isError && instruments.error.kind !== 'cancelled';
  const handleInput = (value: string) => {
    setQuery(value);
    setNavigationFailed(false);
  };
  const handleSelection = async (selection: PharoSelectionAction) => {
    const action = toDashboardAction(selection, known);
    if (!action) return 'unchanged' as const;
    try {
      const outcome = await onAction(action);
      setNavigationFailed(false);
      return outcome;
    } catch (error) {
      setNavigationFailed(true);
      throw error;
    }
  };
  const handleClearSearch = () => {
    setQuery('');
    inputRef.current?.focus();
  };
  const handleClearSelection = async () => {
    try {
      const outcome = await onAction({ type: 'clear' });
      setNavigationFailed(false);
      if (outcome !== 'limit') inputRef.current?.focus();
    } catch {
      setNavigationFailed(true);
    }
  };

  return (
    <div className={pickerStyles.root}>
      <PharoMultiComboBox
        label="Compare instruments"
        placeholder="Search tickers…"
        items={items}
        itemKey={(item) => item.ticker}
        itemText={(item) => item.ticker}
        selectedKeys={selectedTickers}
        selectedText={(key) => (typeof key === 'string' ? key : '')}
        inputValue={query}
        onInputChange={handleInput}
        onSelectionAction={handleSelection}
        inputRef={inputRef}
        maxSelected={3}
        isLoading={instruments.isFetching}
        loadingMessage={instruments.isPending ? 'Loading instruments…' : 'Refreshing instruments…'}
        emptyMessage={
          listFailure
            ? 'Instrument list unavailable.'
            : known.length === 0
              ? 'No instruments are available.'
              : 'No instruments match your search.'
        }
        limitMessage="Up to 3 instruments. Remove one to add another."
        isInvalid={navigationFailed}
        errorMessage="The selection could not be updated. Please try again."
        tagClassName={(key) =>
          appearanceStyles[appearances.get(typeof key === 'string' ? key : '') ?? 'primary']
        }
      />
      <div className={pickerStyles.actions}>
        <PharoButton variant="quiet" onPress={() => void handleClearSelection()}>
          Clear selection
        </PharoButton>
        {query.length > 0 && (
          <PharoButton variant="quiet" onPress={handleClearSearch}>
            Clear search
          </PharoButton>
        )}
        <span className={pickerStyles.help}>Press / to focus.</span>
      </div>
      {instruments.isPending && (
        <p role="status" className={pickerStyles.help}>
          Loading instruments…
        </p>
      )}
      {listFailure && (
        <div className={pickerStyles.error}>
          <p role="alert">{instruments.error.message}</p>
          <PharoButton
            variant="secondary"
            isDisabled={instruments.isFetching}
            onPress={() => void instruments.refetch()}
          >
            {instruments.isFetching ? 'Retrying instruments…' : 'Retry instruments'}
          </PharoButton>
        </div>
      )}
    </div>
  );
}
