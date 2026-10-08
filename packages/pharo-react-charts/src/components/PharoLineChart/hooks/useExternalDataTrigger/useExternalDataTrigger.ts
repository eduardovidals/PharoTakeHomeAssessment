import { useCallback, useSyncExternalStore } from 'react';
import { isDataTriggerReachable } from './utils';
import type { UseExternalDataTriggerOptions } from './types';

/** Keep inline access available until an actual external trigger is usable. */
export function useExternalDataTrigger(options: UseExternalDataTriggerOptions): string | undefined {
  const { owner, triggerId } = options;
  const snapshot = useCallback(() => {
    const element = owner;
    return element && triggerId && isDataTriggerReachable(element, triggerId)
      ? triggerId
      : undefined;
  }, [owner, triggerId]);
  const subscribe = useCallback(
    (refresh: () => void) => {
      const element = owner;
      if (!element || !triggerId) return () => undefined;
      const view = element.ownerDocument.defaultView;
      if (!view) return () => undefined;
      const observer = new view.MutationObserver(refresh);
      observer.observe(element.ownerDocument.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'id',
          'href',
          'role',
          'hidden',
          'inert',
          'disabled',
          'aria-disabled',
          'aria-hidden',
          'tabindex',
          'style',
          'class',
          'aria-label',
          'aria-labelledby',
        ],
      });
      return () => observer.disconnect();
    },
    [owner, triggerId],
  );
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
