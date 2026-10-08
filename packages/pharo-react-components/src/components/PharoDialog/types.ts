import type { ReactNode } from 'react';

/** A controlled, named overlay with a real trigger and consumer-owned content. */
export interface PharoDialogProps {
  /** Stable identity for external associations with this actual trigger button. */
  readonly triggerId: string;
  /** Visible and accessible name of the trigger. */
  readonly triggerLabel: string;
  /** Visible heading and accessible dialog name. */
  readonly title: string;
  /** Content and any domain-specific actions, rendered within the scrolling body. */
  readonly children: ReactNode;
  /** The consumer owns whether the dialog is open. */
  readonly isOpen: boolean;
  /** Receives trigger, Close, Escape and optional backdrop dismissal changes. */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Prevent opening through the trigger. */
  readonly triggerDisabled?: boolean;
  /** Visible close action; defaults to Close. */
  readonly closeLabel?: string;
  /** Allow backdrop dismissal; defaults to true. Escape remains supported. */
  readonly isDismissable?: boolean;
  /** Classes merged onto the modal surface, including responsive size overrides. */
  readonly className?: string;
}
