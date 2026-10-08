import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { ComboBoxStateContext } from 'react-aria-components';
import type { PharoActiveOptionProps as Props } from './types';

/**
 * Restore eligible native virtual focus after controlled collection updates.
 * @example
 * ```tsx
 * <ComboBox selectionMode="multiple"><PharoActiveOption query={query} /></ComboBox>
 * ```
 */
export function PharoActiveOption(props: Props) {
  const { query } = props;
  const state = useContext(ComboBoxStateContext);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });
  const collection = state?.collection;
  const isOpen = state?.isOpen;
  useEffect(() => {
    if (!isOpen) return;
    // Native ComboBox clears virtual focus in its effect after an input edit.
    // Set its own manager after that update; never intercept keyboard selection.
    const frame = requestAnimationFrame(() => {
      const current = latest.current;
      if (!current?.isOpen) return;
      const first = [...current.collection.getKeys()].find(
        (key) =>
          current.selectionManager.canSelectItem(key) && !current.selectionManager.isSelected(key),
      );
      current.selectionManager.setFocusedKey(first ?? null);
    });
    return () => cancelAnimationFrame(frame);
  }, [query, collection, isOpen]);
  return null;
}
