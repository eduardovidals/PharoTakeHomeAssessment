import { describe, expect, it } from 'vitest';
import { prepareChartGeometry } from './geometry';
import type { PharoChartPoint, PharoChartSeries } from './types';

const day = 86_400_000;
const dateLimit = 8_640_000_000_000_000;

function series(points: readonly PharoChartPoint[], id = 'temperature'): PharoChartSeries {
  return { id, label: id, points };
}

function ready(input: readonly PharoChartSeries[], width = 672, height = 320) {
  const result = prepareChartGeometry(input, width, height);
  expect(result.kind).toBe('ready');
  if (result.kind !== 'ready') throw new Error(`Expected ready geometry, got ${result.kind}`);
  return result;
}

describe('prepareChartGeometry', () => {
  it('projects sorted recorded candidates through UTC spacing, retaining null records and source data', () => {
    const input = Object.freeze([
      series(
        Object.freeze([
          { x: 0, y: 10 },
          { x: day, y: null },
          { x: 4 * day, y: 20 },
        ]),
      ),
    ]);
    const candidates = Object.freeze([4 * day, day, 0, -day, 5 * day]);
    const result = prepareChartGeometry(input, 672, 320, candidates);
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('Expected candidate geometry.');
    expect(result.xTicks).toEqual([
      { value: 0, position: 56 },
      { value: day, position: 206 },
      { value: 4 * day, position: 656 },
    ]);
    expect(result.series[0]?.path).toBe('M56,272ZM656,16Z');
    expect(candidates).toEqual([4 * day, day, 0, -day, 5 * day]);
    expect(input[0]?.points[1]).toEqual({ x: day, y: null });
  });

  it('distinguishes omitted, empty, singleton and wholly out-of-domain candidates', () => {
    const input = [
      series([
        { x: 0, y: 10 },
        { x: 4 * day, y: 20 },
      ]),
    ];
    for (const candidates of [[], [-day, 5 * day]]) {
      expect(prepareChartGeometry(input, 672, 320, candidates)).toMatchObject({
        kind: 'ready',
        xTicks: [],
      });
    }
    expect(prepareChartGeometry(input, 672, 320, [day])).toMatchObject({
      kind: 'ready',
      xTicks: [{ value: day, position: 206 }],
    });
    expect(ready(input).xTicks.length).toBeGreaterThan(0);
    expect(prepareChartGeometry([series([{ x: day, y: 5 }])], 672, 320, [day])).toMatchObject({
      kind: 'ready',
      xTicks: [{ value: day, position: 356 }],
    });
  });

  it.each([[0, 0], [NaN], [Infinity], [-Infinity], [0.5], [dateLimit + 1], [-dateLimit - 1]])(
    'rejects malformed candidate values %j before empty or measured rendering',
    (...candidates) => {
      for (const input of [[], [series([{ x: 0, y: 1 }])]]) {
        expect(prepareChartGeometry(input, 672, 320, candidates)).toMatchObject({
          kind: 'invalid',
          reason: 'PHARO-CHART-DATA',
        });
      }
    },
  );

  it('rejects untyped candidate containers and missing sparse entries safely', () => {
    const input = [series([{ x: 0, y: 1 }])];
    // @ts-expect-error Runtime callers may violate the readonly-array contract.
    expect(prepareChartGeometry(input, 672, 320, '0')).toMatchObject({ kind: 'invalid' });
    expect(prepareChartGeometry(input, 672, 320, Array<number>(1))).toMatchObject({
      kind: 'invalid',
    });
  });

  it('projects literal shared domain endpoints and midpoint with straight segments', () => {
    const result = ready([
      series([
        { x: 0, y: 0 },
        { x: day, y: 10 },
        { x: 2 * day, y: 20 },
      ]),
    ]);
    expect(result.width).toBe(672);
    expect(result.height).toBe(320);
    expect(result.plot).toEqual({ left: 56, top: 16, right: 656, bottom: 272 });
    expect(result.xDomain).toEqual([0, 172_800_000]);
    expect(result.yDomain).toEqual([0, 20]);
    expect(result.series[0]?.path).toBe('M56,272L356,144L656,16');
    expect(result.series[0]?.markers).toEqual([]);
  });

  it('sorts a copy of frozen caller points without mutating their objects or order', () => {
    const last = Object.freeze({ x: 2 * day, y: 20 });
    const first = Object.freeze({ x: 0, y: 0 });
    const middle = Object.freeze({ x: day, y: 10 });
    const points = Object.freeze([last, first, middle]);
    const input = Object.freeze([Object.freeze(series(points))]);
    const result = ready(input);
    expect(points).toEqual([last, first, middle]);
    expect(points[0]).toBe(last);
    expect(result.series[0]?.points).toEqual([first, middle, last]);
    expect(result.series[0]?.points).not.toBe(points);
    expect(result.series[0]?.path).toBe('M56,272L356,144L656,16');
  });

  it('keeps null timestamps in the temporal domain and visibly marks an isolated observation', () => {
    const result = ready([
      series([
        { x: 0, y: null },
        { x: day, y: 20 },
        { x: 2 * day, y: null },
      ]),
    ]);
    expect(result.xDomain).toEqual([0, 172_800_000]);
    expect(result.yDomain).toEqual([19, 21]);
    expect(result.series[0]?.markers).toEqual([{ x: 356, y: 144, point: { x: day, y: 20 } }]);
  });

  it('breaks the line at every missing value without bridging or replacing null by zero', () => {
    const result = ready([
      series([
        { x: 0, y: 0 },
        { x: day, y: null },
        { x: 2 * day, y: 20 },
      ]),
    ]);
    expect(result.yDomain).toEqual([0, 20]);
    expect(result.series[0]?.path).toBe('M56,272ZM656,16Z');
    expect(result.series[0]?.markers).toEqual([
      { x: 56, y: 272, point: { x: 0, y: 0 } },
      { x: 656, y: 16, point: { x: 2 * day, y: 20 } },
    ]);
  });

  it('retains multi-point segments and only marks the isolated segment', () => {
    const result = ready([
      series([
        { x: 0, y: 0 },
        { x: day, y: 10 },
        { x: 2 * day, y: null },
        { x: 3 * day, y: 20 },
        { x: 4 * day, y: null },
      ]),
    ]);
    expect(result.xDomain).toEqual([0, 345_600_000]);
    expect(result.series[0]?.path).toBe('M56,272L206,144M506,16Z');
    expect(result.series[0]?.markers).toEqual([{ x: 506, y: 16, point: { x: 3 * day, y: 20 } }]);
  });

  it.each([
    { value: 0, domain: [-1, 1] },
    { value: 20, domain: [19, 21] },
    { value: 100, domain: [95, 105] },
    { value: -100, domain: [-105, -95] },
  ])('pads flat $value without forcing zero into its domain', ({ value, domain }) => {
    const result = ready([series([{ x: day, y: value }])]);
    expect(result.xDomain).toEqual([43_200_000, 129_600_000]);
    expect(result.yDomain).toEqual(domain);
    expect(result.series[0]?.markers).toEqual([{ x: 356, y: 144, point: { x: day, y: value } }]);
  });

  it.each([
    { x: dateLimit, domain: [dateLimit - 43_200_000, dateLimit], position: 656 },
    { x: -dateLimit, domain: [-dateLimit, -dateLimit + 43_200_000], position: 56 },
  ])(
    'clamps singleton temporal padding at $x without changing the observation',
    ({ x, domain, position }) => {
      const result = ready([series([{ x, y: 20 }])]);
      expect(result.xDomain).toEqual(domain);
      expect(result.series[0]?.markers).toEqual([{ x: position, y: 144, point: { x, y: 20 } }]);
    },
  );

  it('shares domains across three independent series including negative generic values', () => {
    const result = ready([
      series(
        [
          { x: 0, y: -15 },
          { x: 2 * day, y: 0 },
        ],
        'cold',
      ),
      series(
        [
          { x: 0, y: 0 },
          { x: 2 * day, y: 15 },
        ],
        'warm',
      ),
      series([{ x: day, y: 0 }], 'reference'),
    ]);
    expect(result.yDomain).toEqual([-15, 15]);
    expect(result.series.map((item) => item.path)).toEqual([
      'M56,272L656,144',
      'M56,144L656,16',
      'M356,144Z',
    ]);
    expect(result.series[2]?.markers).toEqual([{ x: 356, y: 144, point: { x: day, y: 0 } }]);
  });

  it('uses exact nonblank identifiers without normalizing identity', () => {
    const result = ready([series([{ x: 0, y: 1 }], 'A'), series([{ x: 0, y: 2 }], 'a')]);
    expect(result.series.map((item) => item.id)).toEqual(['A', 'a']);
  });

  it.each([
    { name: 'no series', input: [] },
    { name: 'no points', input: [series([])] },
    {
      name: 'all missing',
      input: [
        series([
          { x: 0, y: null },
          { x: day, y: null },
        ]),
      ],
    },
  ])('returns an intentional empty state for $name', ({ input }) => {
    const result = prepareChartGeometry(input, 672, 320);
    expect(result.kind).toBe('empty');
    expect(result).not.toHaveProperty('series');
  });

  it('rejects a subnormal span which cannot produce safe ticks without throwing', () => {
    const result = prepareChartGeometry(
      [
        series([
          { x: 0, y: -Number.MIN_VALUE },
          { x: day, y: Number.MIN_VALUE },
        ]),
      ],
      672,
      320,
    );
    expect(result).toMatchObject({ kind: 'invalid', reason: 'PHARO-CHART-DOMAIN' });
    expect(result).not.toHaveProperty('series');
  });

  it('bounds tick density before processing very large finite measurements', () => {
    const result = ready(
      [
        series([
          { x: 0, y: 0 },
          { x: 2 * day, y: 20 },
        ]),
      ],
      1e12,
      1e12,
    );
    expect(result.xTicks.length).toBeGreaterThan(0);
    expect(result.xTicks.length).toBeLessThanOrEqual(12);
    expect(result.yTicks.length).toBeGreaterThan(0);
    expect(result.yTicks.length).toBeLessThanOrEqual(12);
    for (const tick of [...result.xTicks, ...result.yTicks]) {
      expect(Number.isFinite(tick.value)).toBe(true);
      expect(Number.isFinite(tick.position)).toBe(true);
    }
    expect(result.series[0]?.path).not.toMatch(/NaN|Infinity/);
  });

  const malformed: { name: string; input: readonly PharoChartSeries[] }[] = [
    {
      name: 'duplicate dates',
      input: [
        series([
          { x: 0, y: 1 },
          { x: 0, y: 2 },
        ]),
      ],
    },
    { name: 'fractional timestamp', input: [series([{ x: 0.5, y: 1 }])] },
    { name: 'NaN timestamp', input: [series([{ x: NaN, y: 1 }])] },
    { name: 'infinite timestamp', input: [series([{ x: Infinity, y: 1 }])] },
    { name: 'timestamp above Date range', input: [series([{ x: dateLimit + 1, y: 1 }])] },
    { name: 'timestamp below Date range', input: [series([{ x: -dateLimit - 1, y: 1 }])] },
    { name: 'NaN value', input: [series([{ x: 0, y: NaN }])] },
    { name: 'infinite value', input: [series([{ x: 0, y: Infinity }])] },
    { name: 'blank identity', input: [series([{ x: 0, y: 1 }], ' ')] },
    { name: 'blank label', input: [{ id: 'a', label: ' ', points: [{ x: 0, y: 1 }] }] },
    { name: 'duplicate identity', input: [series([{ x: 0, y: 1 }]), series([{ x: day, y: 2 }])] },
    {
      name: 'four active series',
      input: ['a', 'b', 'c', 'd'].map((id) => series([{ x: 0, y: 1 }], id)),
    },
    {
      name: 'explicit appearance collision',
      input: [
        { ...series([{ x: 0, y: 1 }], 'a'), appearance: 'primary' },
        { ...series([{ x: 0, y: 2 }], 'b'), appearance: 'primary' },
      ],
    },
  ];
  it.each(malformed)(
    'rejects $name as malformed rather than dropping observations',
    ({ input }) => {
      const result = prepareChartGeometry(input, 672, 320);
      expect(result).toMatchObject({ kind: 'invalid', reason: 'PHARO-CHART-DATA' });
      expect(result).not.toHaveProperty('series');
    },
  );

  it.each([
    [
      { x: 0, y: -Number.MAX_VALUE },
      { x: day, y: Number.MAX_VALUE },
    ],
    [{ x: 0, y: Number.MAX_VALUE }],
    [{ x: 0, y: -Number.MAX_VALUE }],
  ])('rejects unsafe finite-domain arithmetic without rendering Infinity', (...points) => {
    const result = prepareChartGeometry([series(points)], 672, 320);
    expect(result).toMatchObject({ kind: 'invalid', reason: 'PHARO-CHART-DOMAIN' });
    expect(result).not.toHaveProperty('series');
  });

  it.each([
    [0, 320],
    [672, 0],
    [-1, 320],
    [72, 320],
    [672, 64],
    [NaN, 320],
    [672, Infinity],
  ])('withholds geometry for unusable dimensions %s × %s', (width, height) => {
    const result = prepareChartGeometry([series([{ x: 0, y: 1 }])], width, height);
    expect(result).toMatchObject({ kind: 'unmeasured', reason: 'PHARO-CHART-SIZE' });
  });

  it('changes measured projection without changing source observations or shared domains', () => {
    const input = [
      series([
        { x: 0, y: 0 },
        { x: 2 * day, y: 20 },
      ]),
    ];
    const result = ready(input, 372, 192);
    expect(result.plot).toEqual({ left: 56, top: 16, right: 356, bottom: 144 });
    expect(result.xDomain).toEqual([0, 172_800_000]);
    expect(result.yDomain).toEqual([0, 20]);
    expect(result.series[0]?.path).toBe('M56,144L356,16');
    for (const tick of [...result.xTicks, ...result.yTicks]) {
      expect(Number.isFinite(tick.value)).toBe(true);
      expect(Number.isFinite(tick.position)).toBe(true);
    }
  });
});
