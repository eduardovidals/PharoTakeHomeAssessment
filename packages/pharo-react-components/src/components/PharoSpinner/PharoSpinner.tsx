import { ProgressBar } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { ringStyles, rootStyles, sizeStyles } from './styles';
import type { PharoSpinnerProps as Props } from './types';

/**
 * Named indeterminate progress with a decorative ring and reduced-motion support.
 * Consumers own any broader busy region or live announcement.
 * @example
 * ```tsx
 * <PharoSpinner label="Loading options" size="sm" />
 * ```
 */
export function PharoSpinner(props: Props) {
  const { label = 'Loading', size = 'md', className, ...rest } = props;

  return (
    <ProgressBar
      {...rest}
      isIndeterminate
      aria-label={label}
      className={(state) =>
        mergeClasses(rootStyles, typeof className === 'function' ? className(state) : className)
      }
    >
      <span aria-hidden="true" className={mergeClasses(ringStyles, sizeStyles[size])} />
    </ProgressBar>
  );
}
