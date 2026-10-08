import { expect, test } from 'vitest';
import { getComparisonTimeline } from './utils';

test('unions selected histories without inventing missing days or mutating their order', () => {
  const series = [
    {
      id: 'A',
      label: 'A',
      points: [
        { x: 300, y: 12 },
        { x: 100, y: 10 },
      ],
    },
    {
      id: 'B',
      label: 'B',
      points: [
        { x: 100, y: 20 },
        { x: 400, y: 22 },
      ],
    },
    { id: 'UNAVAILABLE', label: 'Unavailable', points: [] },
  ];
  const original = JSON.stringify(series);
  expect(getComparisonTimeline(series)).toEqual([100, 300, 400]);
  expect(JSON.stringify(series)).toBe(original);
  expect(getComparisonTimeline([])).toEqual([]);
});
