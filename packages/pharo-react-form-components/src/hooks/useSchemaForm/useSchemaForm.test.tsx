import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useSchemaForm } from './useSchemaForm';

describe('useSchemaForm', () => {
  it('keeps string drafts and submits the schema transformed output', async () => {
    const schema = z.object({ quantity: z.string().regex(/^\d+$/).transform(Number) });
    const submitted = vi.fn();
    const { result } = renderHook(() =>
      useSchemaForm(schema, { defaultValues: { quantity: '12' } }),
    );

    expect(result.current.getValues()).toEqual({ quantity: '12' });

    await act(async () => result.current.handleSubmit(submitted)());

    expect(submitted.mock.calls[0]?.[0]).toEqual({ quantity: 12 });
    expect(result.current.getValues()).toEqual({ quantity: '12' });
  });

  it('reports resolver errors and permits a corrected submission with the same form', async () => {
    const schema = z.object({ title: z.string().min(3, 'Use at least three characters.') });
    const submitted = vi.fn();
    const invalid = vi.fn();
    const { result } = renderHook(() => {
      const form = useSchemaForm(schema, { defaultValues: { title: '' }, mode: 'onBlur' });

      return { form, errors: form.formState.errors };
    });

    await act(async () => result.current.form.handleSubmit(submitted, invalid)());

    expect(submitted).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(result.current.errors.title?.message).toBe('Use at least three characters.');

    act(() => result.current.form.setValue('title', 'Ready'));
    await act(async () => result.current.form.handleSubmit(submitted)());

    expect(submitted.mock.calls[0]?.[0]).toEqual({ title: 'Ready' });
    expect(result.current.errors).toEqual({});
  });

  it('preserves typed context and native options without a second form state', () => {
    const schema = z.object({ title: z.string() });
    const context = { locale: 'en-GB' };
    const { result } = renderHook(() =>
      useSchemaForm<z.input<typeof schema>, z.output<typeof schema>, typeof context>(schema, {
        context,
        defaultValues: { title: 'Initial' },
        disabled: true,
        shouldFocusError: false,
      }),
    );

    expect(result.current.getValues('title')).toBe('Initial');
    expect(result.current.formState.disabled).toBe(true);

    act(() => result.current.reset({ title: 'Reset' }));

    expect(result.current.getValues('title')).toBe('Reset');
  });

  it.each([undefined, () => ({ values: {}, errors: {} })])(
    'rejects an own resolver override, including undefined',
    (resolver) => {
      const options: Record<string, unknown> = { resolver };

      expect(() =>
        renderHook(() => useSchemaForm(z.object({ title: z.string() }), options)),
      ).toThrow('PHARO-FORMS-SCHEMA-OPTIONS');
    },
  );
});
