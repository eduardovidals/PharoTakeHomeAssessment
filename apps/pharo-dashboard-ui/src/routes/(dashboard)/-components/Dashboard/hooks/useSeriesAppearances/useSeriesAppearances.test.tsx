import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSeriesAppearances } from './useSeriesAppearances';

interface HookProps {
  readonly ids: readonly string[];
}

describe('Dashboard instance appearance lifetime', () => {
  it('shares stable assignments for survivors and unchanged IDs regardless of data arrival rerenders', () => {
    const hook = renderHook(({ ids }: HookProps) => useSeriesAppearances(ids), {
      initialProps: { ids: ['AAA', 'BBB', 'CCC'] },
    });
    const initial = hook.result.current;
    hook.rerender({ ids: ['AAA', 'BBB', 'CCC'] });
    expect(hook.result.current).toBe(initial);
    hook.rerender({ ids: ['CCC', 'BBB'] });
    expect([...hook.result.current]).toEqual([
      ['CCC', 'tertiary'],
      ['BBB', 'secondary'],
    ]);
    hook.rerender({ ids: ['CCC', 'BBB', 'AAA'] });
    expect(hook.result.current.get('AAA')).toBe('primary');
    hook.rerender({ ids: [] });
    hook.rerender({ ids: ['BBB'] });
    expect(hook.result.current.get('BBB')).toBe('secondary');
  });

  it('keeps allocation history isolated between mounted instances and discards it on unmount', () => {
    const first = renderHook(() => useSeriesAppearances(['AAA', 'BBB']));
    const second = renderHook(() => useSeriesAppearances(['BBB', 'AAA']));
    expect(first.result.current.get('BBB')).toBe('secondary');
    expect(second.result.current.get('BBB')).toBe('primary');
    first.unmount();
    const replacement = renderHook(() => useSeriesAppearances(['BBB']));
    expect(replacement.result.current.get('BBB')).toBe('primary');
    expect(second.result.current.get('AAA')).toBe('secondary');
  });
});
