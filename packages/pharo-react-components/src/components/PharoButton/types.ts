import type { ButtonProps } from 'react-aria-components';

/** The visual emphasis of an action, independent of its application behavior. */
export type PharoButtonVariant = 'primary' | 'secondary' | 'quiet';

/** Both sizes retain a 44px minimum target; typography and padding differ. */
export type PharoButtonSize = 'sm' | 'md';

/** Accessible React Aria button behavior with Pharo appearances and sizing. */
export interface PharoButtonProps extends ButtonProps {
  /** Primary by default; secondary and quiet suit supporting actions. */
  variant?: PharoButtonVariant;
  /** Medium by default. Small retains the same minimum touch target. */
  size?: PharoButtonSize;
}
