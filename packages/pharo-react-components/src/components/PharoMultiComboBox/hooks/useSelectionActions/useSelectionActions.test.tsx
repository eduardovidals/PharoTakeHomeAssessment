import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PharoSelectionOutcome } from '../../types';
import { useSelectionActions } from './useSelectionActions';
import type { UseSelectionActionsOptions } from './types';

const base: UseSelectionActionsOptions = {
  selectedKeys: [],
  inputValue: 'Fern',
  onInputChange: () => undefined,
  onSelectionAction: () => 'committed',
  inputRef: { current: null },
};

describe('selection action lifecycle', () => {
  it('does not erase a newer draft when an older addition resolves', async () => {
    let finish: (value: PharoSelectionOutcome) => void = () => undefined;
    const onInputChange = vi.fn();
    const pending = new Promise<PharoSelectionOutcome>((resolve) => {
      finish = resolve;
    });
    const { result, rerender } = renderHook(useSelectionActions, {
      initialProps: {
        ...base,
        onInputChange,
        onSelectionAction: () => pending,
      },
    });
    let operation: Promise<void> = Promise.resolve();
    act(() => {
      operation = result.current.perform({ kind: 'add', key: 'fern' });
    });
    act(() => result.current.changeInput('Maple'));
    rerender({ ...base, inputValue: 'Maple', onInputChange, onSelectionAction: () => pending });
    await act(async () => {
      finish('committed');
      await operation;
    });
    expect(onInputChange).toHaveBeenCalledExactlyOnceWith('Maple');
  });
  it('observes rejection and permits a subsequent committed action', async () => {
    const onInputChange = vi.fn();
    const callback = vi
      .fn<UseSelectionActionsOptions['onSelectionAction']>()
      .mockRejectedValueOnce(new Error('private server detail'))
      .mockResolvedValueOnce('committed');
    const { result } = renderHook(useSelectionActions, {
      initialProps: {
        ...base,
        onInputChange,
        onSelectionAction: callback,
      },
    });
    await act(() => result.current.perform({ kind: 'add', key: 7 }));
    expect(result.current.failed).toBe(true);
    expect(onInputChange).not.toHaveBeenCalled();
    await act(() => result.current.perform({ kind: 'add', key: 8 }));
    expect(result.current.failed).toBe(false);
    expect(onInputChange).toHaveBeenCalledExactlyOnceWith('');
  });
  it('preserves the query on unchanged or limit outcomes and guards configured limits', async () => {
    const onInputChange = vi.fn();
    const callback = vi
      .fn<UseSelectionActionsOptions['onSelectionAction']>()
      .mockReturnValueOnce('unchanged')
      .mockReturnValueOnce('limit');
    const { result, rerender } = renderHook(useSelectionActions, {
      initialProps: {
        ...base,
        onInputChange,
        onSelectionAction: callback,
        maxSelected: 2,
      },
    });
    await act(() => result.current.perform({ kind: 'add', key: 7 }));
    await act(() => result.current.perform({ kind: 'add', key: 8 }));
    expect(result.current.limited).toBe(true);
    expect(onInputChange).not.toHaveBeenCalled();
    rerender({
      ...base,
      selectedKeys: [7, 8],
      onInputChange,
      onSelectionAction: callback,
      maxSelected: 2,
    });
    await act(() => result.current.perform({ kind: 'add', key: 9 }));
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it('forwards successive intentions without constructing a stale replacement array', async () => {
    const callback = vi
      .fn<UseSelectionActionsOptions['onSelectionAction']>()
      .mockResolvedValue('unchanged');
    const { result } = renderHook(useSelectionActions, {
      initialProps: { ...base, onSelectionAction: callback },
    });
    await act(async () => {
      await Promise.all([
        result.current.perform({ kind: 'add', key: 7 }),
        result.current.perform({ kind: 'add', key: 8 }),
      ]);
    });
    expect(callback.mock.calls).toEqual([[{ kind: 'add', key: 7 }], [{ kind: 'add', key: 8 }]]);
  });
  it('retires a completed removal with survivors before an unrelated parent clear', async () => {
    const input = document.createElement('input');
    const focus = vi.spyOn(input, 'focus');
    const options = { ...base, selectedKeys: [7, 8], inputRef: { current: input } };
    const { result, rerender } = renderHook(useSelectionActions, { initialProps: options });
    await act(() => result.current.perform({ kind: 'remove', keys: [7] }));
    rerender({ ...options, selectedKeys: [8] });
    rerender({ ...options, selectedKeys: [] });
    expect(focus).not.toHaveBeenCalled();
  });
  it('tracks overlapping removals independently when they complete out of order', async () => {
    const input = document.createElement('input');
    const focus = vi.spyOn(input, 'focus');
    let finishFirst: (value: PharoSelectionOutcome) => void = () => undefined;
    let finishSecond: (value: PharoSelectionOutcome) => void = () => undefined;
    const first = new Promise<PharoSelectionOutcome>((resolve) => {
      finishFirst = resolve;
    });
    const second = new Promise<PharoSelectionOutcome>((resolve) => {
      finishSecond = resolve;
    });
    const callback = vi
      .fn<UseSelectionActionsOptions['onSelectionAction']>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const options = {
      ...base,
      selectedKeys: [7, 8],
      inputRef: { current: input },
      onSelectionAction: callback,
    };
    const { result, rerender } = renderHook(useSelectionActions, { initialProps: options });
    let firstAction = Promise.resolve();
    let secondAction = Promise.resolve();
    act(() => {
      firstAction = result.current.perform({ kind: 'remove', keys: [7] });
      secondAction = result.current.perform({ kind: 'remove', keys: [8] });
    });
    rerender({ ...options, selectedKeys: [7] });
    await act(async () => {
      finishSecond('committed');
      await secondAction;
    });
    expect(focus).not.toHaveBeenCalled();
    rerender({ ...options, selectedKeys: [] });
    await act(async () => {
      finishFirst('committed');
      await firstAction;
    });
    expect(focus).toHaveBeenCalledOnce();
  });
});
