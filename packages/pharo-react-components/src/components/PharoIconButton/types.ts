import type { ReactNode } from 'react';
import type { PharoButtonProps } from '../PharoButton';

/** An icon-only action with a required accessible name and a 44px square target. */
export interface PharoIconButtonProps extends Omit<PharoButtonProps, 'children' | 'size'> {
  /** Describes the action to assistive technology, for example "Close observations". */
  'aria-label': string;
  /** Decorative icon; its content is hidden from the accessibility tree. */
  icon: ReactNode;
}
