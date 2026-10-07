/** Normalize display only; an untouched optional field stays undefined in the form. */
export function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  throw new Error('PHARO-FORMS-TEXT-VALUE: Expected a string or undefined field value.');
}

/** The empty string is the form's no-selection sentinel, not an item key. */
export function selectionKey(value: unknown): string | null {
  const key = textValue(value);
  return key === '' ? null : key;
}

/** React Aria signals clearing with null; other selected keys must be nonempty strings. */
export function selectionValue(key: unknown): string {
  if (key === null) return '';
  if (typeof key === 'string' && key.length > 0) return key;
  throw new Error('PHARO-FORMS-SELECTION-VALUE: Expected a nonempty string key or null.');
}

/** Reserve the empty string for explicit clearing without coercing consumer item keys. */
export function itemKeyValue(key: unknown): string {
  if (typeof key === 'string' && key.length > 0) return key;
  throw new Error('PHARO-FORMS-ITEM-KEY: Item keys must be nonempty strings.');
}
