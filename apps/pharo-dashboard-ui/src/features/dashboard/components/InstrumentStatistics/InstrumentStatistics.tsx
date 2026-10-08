import { PharoButton, PharoSpinner } from '@pharo/react-components';
import { statisticsStyles } from './styles';
import type { InstrumentStatisticsProps as Props } from './types';
import { formatPercentage, formatSignedPercentage } from '../../../../utils/number';

/**
 * Present supplied percentage-point statistics without changing cached values.
 * @example
 * ```tsx
 * <InstrumentStatistics ticker="AAPL" query={statisticsQuery} />
 * ```
 */
export function InstrumentStatistics(props: Props) {
  const { ticker, query } = props;
  const failed = query.isError && query.error.kind !== 'cancelled';
  return (
    <section aria-label={`${ticker} statistics`} className={statisticsStyles.resource}>
      <h4 className={statisticsStyles.heading}>Statistics</h4>
      {query.isPending && (
        <div className={statisticsStyles.loading}>
          <PharoSpinner label={`Loading ${ticker} statistics`} size="sm" />
          <p>Loading statistics…</p>
        </div>
      )}
      {failed && (
        <div>
          <p role="alert" className={statisticsStyles.error}>
            {query.error.message}
          </p>
          <PharoButton
            className={statisticsStyles.retry}
            variant="secondary"
            onPress={() => void query.refetch()}
          >
            Retry {ticker} statistics
          </PharoButton>
        </div>
      )}
      {query.data && (
        <dl className={statisticsStyles.metrics}>
          <div className={statisticsStyles.metric}>
            <dt className={statisticsStyles.label}>Total return</dt>
            <dd className={statisticsStyles.value}>
              {formatSignedPercentage(query.data.totalReturnPercent)}
              <p className={statisticsStyles.explanation}>First to last observation</p>
            </dd>
          </div>
          <div className={statisticsStyles.metric}>
            <dt className={statisticsStyles.label}>Daily volatility</dt>
            <dd className={statisticsStyles.value}>
              {query.data.dailyVolatilityPercent === null
                ? 'Not enough observations'
                : formatPercentage(query.data.dailyVolatilityPercent)}
              <p className={statisticsStyles.explanation}>Sample deviation of daily returns</p>
            </dd>
          </div>
          <div className={statisticsStyles.metric}>
            <dt className={statisticsStyles.label}>Maximum drawdown</dt>
            <dd className={statisticsStyles.value}>
              {formatPercentage(query.data.maxDrawdownPercent)}
              <p className={statisticsStyles.explanation}>Largest peak-to-trough decline</p>
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
