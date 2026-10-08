import { mergeClasses } from '../../styles/mergeClasses';
import { PharoButton } from '../PharoButton';
import { iconButtonStyles } from './styles';
import type { PharoIconButtonProps as Props } from './types';

/**
 * A named icon action sharing PharoButton's appearances and accessible behavior.
 * @example
 * ```tsx
 * <PharoIconButton aria-label="Close observations" icon={<CloseIcon />} onPress={close} />
 * ```
 */
export function PharoIconButton(props: Props) {
  const { icon, variant = 'secondary', className, ...rest } = props;
  return (
    <PharoButton
      {...rest}
      variant={variant}
      className={(state) =>
        mergeClasses(
          iconButtonStyles.root,
          typeof className === 'function' ? className(state) : className,
        )
      }
    >
      <span aria-hidden="true" className={iconButtonStyles.icon}>
        {icon}
      </span>
    </PharoButton>
  );
}
