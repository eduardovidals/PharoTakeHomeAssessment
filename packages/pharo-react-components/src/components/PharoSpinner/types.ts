import type { ProgressBarProps } from 'react-aria-components';

/** Small and medium ring sizes. */
export type PharoSpinnerSize = 'sm' | 'md';

type ManagedSpinnerKey =
  | 'children'
  | 'isIndeterminate'
  | 'value'
  | 'minValue'
  | 'maxValue'
  | 'valueLabel'
  | 'aria-label'
  | 'aria-labelledby';

/** An indeterminate progress indicator with an accessible loading label. */
export type PharoSpinnerProps = Omit<ProgressBarProps, ManagedSpinnerKey> & {
  /** Meaningful loading label; defaults to "Loading". */
  label?: string;
  /** Medium by default. */
  size?: PharoSpinnerSize;
} & {
  [Key in ManagedSpinnerKey]?: never;
};
