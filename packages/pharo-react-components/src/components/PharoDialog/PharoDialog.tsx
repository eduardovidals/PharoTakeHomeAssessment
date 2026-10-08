import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { PharoButton } from '../PharoButton';
import { styles } from './styles';
import type { PharoDialogProps as Props } from './types';

/**
 * Responsive dialog with React Aria focus containment, dismissal and restoration.
 * @example
 * ```tsx
 * <PharoDialog triggerId="details" triggerLabel="View details" title="Details"
 *   isOpen={isOpen} onOpenChange={setIsOpen}>
 *   <p>Consumer-owned content.</p>
 * </PharoDialog>
 * ```
 */
export function PharoDialog(props: Props) {
  const {
    triggerId,
    triggerLabel,
    title,
    children,
    isOpen,
    onOpenChange,
    triggerDisabled,
    closeLabel = 'Close',
    isDismissable = true,
    className,
  } = props;
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <PharoButton id={triggerId} variant="secondary" isDisabled={triggerDisabled}>
        {triggerLabel}
      </PharoButton>
      <ModalOverlay isDismissable={isDismissable} className={styles.overlay}>
        <Modal className={mergeClasses(styles.modal, className)}>
          <Dialog className={styles.dialog}>
            {({ close }) => (
              <>
                <div className={styles.header}>
                  <Heading slot="title" className={styles.title}>
                    {title}
                  </Heading>
                  {/* eslint-disable-next-line jsx-a11y-x/no-autofocus -- An intentionally opened modal moves focus to its visible dismissal control through React Aria. */}
                  <PharoButton autoFocus variant="quiet" className={styles.close} onPress={close}>
                    {closeLabel}
                  </PharoButton>
                </div>
                <div className={styles.content}>{children}</div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
