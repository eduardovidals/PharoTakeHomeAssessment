import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { PharoButton, PharoSpinner } from '@pharo/react-components';
import { PharoFormTextField, useSchemaForm } from '@pharo/react-form-components';
import { instrumentsQueryOptions } from '../../../../api/instruments';
import { instrumentSearchSchema } from './schema';
import { appearanceStyles, selectorStyles } from './styles';
import type { InstrumentSelectorProps as Props, InstrumentSearchValues } from './types';

const pageSize = 10;

/**
 * Search and page one cached list while the route alone commits selected tickers.
 * Search remains usable during list failures and never starts history requests.
 * @example
 * ```tsx
 * <InstrumentSelector apiClient={apiClient} selectedTickers={tickers}
 *   onSelect={selectTicker} onRemove={removeTicker} onClear={clearTickers} />
 * ```
 */
export function InstrumentSelector(props: Props) {
  const { apiClient, selectedTickers, onSelect, onRemove, onClear, appearances } = props;
  const headingId = useId();
  const instruments = useQuery(instrumentsQueryOptions(apiClient));
  const { control, setValue, setFocus } = useSchemaForm<InstrumentSearchValues>(
    instrumentSearchSchema,
    { defaultValues: { search: '' } },
  );
  const search = useWatch({ control, name: 'search' });
  const [requestedPage, setRequestedPage] = useState(0);
  const [actionNotice, setActionNotice] = useState<'limit' | 'navigation'>();
  const focusNewPage = useRef(false);
  const firstResult = useRef<HTMLLIElement>(null);
  const chips = useRef(new Map<string, HTMLLIElement>());
  const matching = instruments.data?.filter((ticker) =>
    ticker.includes(search.trim().toUpperCase()),
  );
  const pageCount = Math.max(1, Math.ceil((matching?.length ?? 0) / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const visible = matching?.slice(page * pageSize, (page + 1) * pageSize);

  useLayoutEffect(() => {
    if (focusNewPage.current) {
      focusNewPage.current = false;
      firstResult.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [page]);

  const changePage = (nextPage: number): void => {
    focusNewPage.current = true;
    setRequestedPage(nextPage);
  };

  const clearSearch = (): void => {
    setValue('search', '');
    setRequestedPage(0);
    setFocus('search');
  };

  const select = async (ticker: string): Promise<void> => {
    try {
      const outcome = await onSelect(ticker);
      setActionNotice(outcome === 'limit' ? 'limit' : undefined);
    } catch {
      setActionNotice('navigation');
    }
  };

  const remove = async (ticker: string, fromChip: boolean): Promise<void> => {
    const index = selectedTickers.indexOf(ticker);
    const neighbor = selectedTickers[index + 1] ?? selectedTickers[index - 1];
    try {
      await onRemove(ticker);
      setActionNotice(undefined);
      if (fromChip) {
        const nextChip = neighbor
          ? chips.current.get(neighbor)?.querySelector<HTMLButtonElement>('button')
          : undefined;
        if (nextChip) nextChip.focus();
        else setFocus('search');
      }
    } catch {
      setActionNotice('navigation');
    }
  };

  const clearSelection = async (): Promise<void> => {
    try {
      await onClear();
      setActionNotice(undefined);
      setFocus('search');
    } catch {
      setActionNotice('navigation');
    }
  };

  return (
    <section aria-labelledby={headingId} className={selectorStyles.panel}>
      <h2 id={headingId} className={selectorStyles.heading}>
        Available instruments
      </h2>
      <p className={selectorStyles.description}>Choose up to three instruments to compare.</p>
      <PharoFormTextField
        className={selectorStyles.search}
        control={control}
        name="search"
        label="Search instruments"
        description="Filter by any part of a ticker."
        inputProps={{
          autoComplete: 'off',
          spellCheck: false,
          onInput: () => setRequestedPage(0),
        }}
      />
      {search.length > 0 && (
        <div className={selectorStyles.actions}>
          <PharoButton variant="quiet" onPress={clearSearch}>
            Clear search
          </PharoButton>
        </div>
      )}

      <div className={selectorStyles.selection}>
        <p className={selectorStyles.description}>{selectedTickers.length} of 3 selected</p>
        <ul aria-label="Current selection" className={selectorStyles.chips}>
          {selectedTickers.map((ticker) => {
            const appearance = appearances?.get(ticker);
            return (
              <li
                key={ticker}
                ref={(element) => {
                  if (element) chips.current.set(ticker, element);
                  else chips.current.delete(ticker);
                }}
              >
                <PharoButton
                  variant="secondary"
                  className={selectorStyles.chip}
                  data-series-id={ticker}
                  data-appearance={appearance}
                  aria-label={`Remove selected ${ticker}`}
                  onPress={() => void remove(ticker, true)}
                >
                  <span className={selectorStyles.ticker}>
                    {appearance && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 12"
                        className={appearanceStyles[appearance]}
                      >
                        <line x1="0" x2="24" y1="6" y2="6" strokeWidth="2" />
                      </svg>
                    )}
                    <span className={selectorStyles.tickerText}>{ticker}</span>
                  </span>
                  <span className={selectorStyles.actionLabel}>Remove</span>
                </PharoButton>
              </li>
            );
          })}
        </ul>
        {selectedTickers.length > 0 && (
          <div className={selectorStyles.actions}>
            <PharoButton variant="quiet" onPress={() => void clearSelection()}>
              Clear selection
            </PharoButton>
          </div>
        )}
      </div>

      {(actionNotice === 'navigation' ||
        (actionNotice === 'limit' && selectedTickers.length === 3)) && (
        <p role="status" className={selectorStyles.notice}>
          {actionNotice === 'limit'
            ? 'You can compare up to three instruments. Remove one before adding another.'
            : 'The selection could not be updated. Please try again.'}
        </p>
      )}
      {instruments.isPending && (
        <div className={selectorStyles.loading}>
          <PharoSpinner label="Loading instruments" size="sm" />
          <p>Loading instruments…</p>
        </div>
      )}
      {instruments.isError && instruments.error.kind !== 'cancelled' && (
        <div>
          <p role="alert" className={selectorStyles.error}>
            {instruments.error.message}
          </p>
          <PharoButton variant="secondary" onPress={() => void instruments.refetch()}>
            Retry instruments
          </PharoButton>
        </div>
      )}
      {matching && (
        <>
          <p role="status" className={selectorStyles.notice}>
            {instruments.data?.length === 0
              ? 'No instruments are available.'
              : matching.length === 0
                ? 'No instruments match your search.'
                : `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, matching.length)} of ${matching.length} instruments. Page ${page + 1} of ${pageCount}.`}
          </p>
          {matching.length > 0 && (
            <>
              <ul aria-label="Instrument results" className={selectorStyles.results}>
                {visible?.map((ticker, index) => {
                  const selected = selectedTickers.includes(ticker);
                  return (
                    <li key={ticker} ref={index === 0 ? firstResult : undefined}>
                      <PharoButton
                        variant={selected ? 'primary' : 'secondary'}
                        className={selectorStyles.result}
                        aria-label={`${selected ? 'Remove' : 'Add'} ${ticker}`}
                        onPress={() => void (selected ? remove(ticker, false) : select(ticker))}
                      >
                        <span className={selectorStyles.ticker}>{ticker}</span>
                        <span className={selectorStyles.actionLabel}>
                          {selected ? 'Remove' : 'Add'}
                        </span>
                      </PharoButton>
                    </li>
                  );
                })}
              </ul>
              <nav aria-label="Instrument pages" className={selectorStyles.pagination}>
                <PharoButton
                  variant="quiet"
                  isDisabled={page === 0}
                  onPress={() => changePage(page - 1)}
                >
                  Previous page
                </PharoButton>
                <PharoButton
                  variant="quiet"
                  isDisabled={page === pageCount - 1}
                  onPress={() => changePage(page + 1)}
                >
                  Next page
                </PharoButton>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}
