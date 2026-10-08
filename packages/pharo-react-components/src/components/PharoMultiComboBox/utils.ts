import type { Key } from 'react-aria-components';
import type { PharoSelectionAction } from './types';

/** Reject unusable limits before they can make a control permanently inoperable. */
export function validateSelectionLimit(limit: number | undefined): void {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
    throw new RangeError('maxSelected must be a positive safe integer.');
  }
}

/** Ignore native no-ops and preserve keys absent from the current collection. */
export function selectionActions(
  previous: readonly Key[],
  next: readonly Key[],
  available: readonly Key[],
): readonly PharoSelectionAction[] {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  const availableSet = new Set(available);
  const additions: PharoSelectionAction[] = [...nextSet]
    .filter((key) => !previousSet.has(key) && availableSet.has(key))
    .map((key) => ({ kind: 'add', key }));
  const removed = previous.filter((key) => availableSet.has(key) && !nextSet.has(key));
  return removed.length ? [...additions, { kind: 'remove', keys: removed }] : additions;
}
