import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PharoSelectionAction } from '../../types';
import type { Key } from 'react-aria-components';
import type { UseSelectionActionsOptions } from './types';

/** Observe async outcomes without creating a second authoritative selection store. */
export function useSelectionActions(options: UseSelectionActionsOptions) {
  const [failed, setFailed] = useState(false);
  const [limited, setLimited] = useState(false);
  const current = useRef(options);
  const revision = useRef(0);
  const mounted = useRef(true);
  const removalPending = useRef(new Map<symbol, readonly Key[]>());
  useLayoutEffect(() => {
    if (current.current.inputValue !== options.inputValue) revision.current += 1;
    let observedRemoval = false;
    for (const [request, keys] of removalPending.current) {
      if (keys.every((key) => !options.selectedKeys.includes(key))) {
        removalPending.current.delete(request);
        observedRemoval = true;
      }
    }
    if (observedRemoval && options.selectedKeys.length === 0) options.inputRef.current?.focus();
    current.current = options;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const changeInput = (value: string) => {
    const latest = current.current;
    if (latest.isDisabled || latest.isReadOnly) return;
    revision.current += 1;
    latest.onInputChange(value);
  };
  const perform = async (action: PharoSelectionAction): Promise<void> => {
    const latest = current.current;
    if (latest.isDisabled || latest.isReadOnly) return;
    if (action.kind === 'add') {
      if (latest.selectedKeys.includes(action.key)) return;
      if (latest.maxSelected !== undefined && latest.selectedKeys.length >= latest.maxSelected) {
        setLimited(true);
        return;
      }
    }
    const draftRevision = revision.current;
    setFailed(false);
    setLimited(false);
    const removed =
      action.kind === 'clear'
        ? latest.selectedKeys
        : action.kind === 'remove'
          ? action.keys.filter((key) => latest.selectedKeys.includes(key))
          : [];
    const request = Symbol();
    if (removed.length) removalPending.current.set(request, removed);
    try {
      const outcome = await latest.onSelectionAction(action);
      if (!mounted.current) return;
      setLimited(outcome === 'limit');
      if (outcome === 'committed' && action.kind === 'add' && revision.current === draftRevision) {
        current.current.onInputChange('');
      }
      if (outcome !== 'committed') removalPending.current.delete(request);
    } catch {
      if (!mounted.current) return;
      removalPending.current.delete(request);
      setFailed(true);
    }
  };
  return { changeInput, perform, failed, limited };
}
