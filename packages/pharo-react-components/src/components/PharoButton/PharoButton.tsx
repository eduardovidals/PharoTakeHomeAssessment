import { Button } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { baseStyles, sizeStyles, variantStyles } from './styles';
import type { PharoButtonProps as Props } from './types';

/**
 * Accessible action with Pharo styling; disabled and pending behavior stays with React Aria.
 * @example
 * ```tsx
 * <PharoButton variant="secondary" size="sm">Clear selection</PharoButton>
 * ```
 */
export function PharoButton(props: Props) {
  const { variant = 'primary', size = 'md', className, ...rest } = props;
  return (
    <Button
      {...rest}
      className={(state) =>
        mergeClasses(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          typeof className === 'function' ? className(state) : className,
        )
      }
    />
  );
}
