import { useMemo, useSyncExternalStore } from 'react';
import { hasAssociatedDataDialog, isDataTriggerReachable, resolveDataTrigger } from './utils';
import type { UseExternalDataTriggerOptions } from './types';

/** Instance-owned external store; only subscription callbacks update DOM identity. */
function createTriggerStore(owner: HTMLElement | null, triggerId: string | undefined) {
  // This DOM identity belongs to one owner/id subscription, never shared chart state.
  let previouslyReachableButton: HTMLElement | undefined;
  const snapshot = () =>
    owner &&
    triggerId &&
    (isDataTriggerReachable(owner, triggerId) ||
      hasAssociatedDataDialog(owner, triggerId, previouslyReachableButton))
      ? triggerId
      : undefined;
  const subscribe = (refresh: () => void) => {
    if (!owner || !triggerId) return () => undefined;
    const view = owner.ownerDocument.defaultView;
    if (!view) return () => undefined;
    const update = () => {
      const candidate = resolveDataTrigger(owner, triggerId);
      if (candidate && isDataTriggerReachable(owner, triggerId)) {
        previouslyReachableButton = candidate.tagName === 'BUTTON' ? candidate : undefined;
      } else if (candidate !== previouslyReachableButton) {
        previouslyReachableButton = undefined;
      }
      refresh();
    };
    update();
    const observer = new view.MutationObserver(update);
    observer.observe(owner.ownerDocument.body, {
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
        'aria-expanded',
        'aria-controls',
        'open',
      ],
    });
    return () => {
      observer.disconnect();
      previouslyReachableButton = undefined;
    };
  };
  return { snapshot, subscribe };
}

/** Keep inline access available until an actual external trigger is usable. */
export function useExternalDataTrigger(options: UseExternalDataTriggerOptions): string | undefined {
  const { owner, triggerId } = options;
  const store = useMemo(() => createTriggerStore(owner, triggerId), [owner, triggerId]);
  return useSyncExternalStore(store.subscribe, store.snapshot, () => undefined);
}
