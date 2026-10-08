import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useSchemaForm } from '../../hooks/useSchemaForm/useSchemaForm';
import { PharoFormComboBox } from './PharoFormComboBox';

const plants = [
  { id: 'orchid', name: 'Orchid' },
  { id: 'fern', name: 'Fern' },
];

const itemKey = (item: (typeof plants)[number]) => item.id;

const itemText = (item: (typeof plants)[number]) => item.name;

describe('PharoFormComboBox', () => {
  it('binds required selection, validation associations, controller focus, and successful submission', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string().min(1, 'Choose a plant.') }), {
        defaultValues: { plant: '' },
      });

      return (
        <form noValidate onSubmit={form.handleSubmit(submitted)}>
          <PharoFormComboBox
            control={form.control}
            name="plant"
            label="Plant"
            description="One plant per pot."
            defaultItems={plants}
            itemKey={itemKey}
            itemText={itemText}
            inputProps={{ autoComplete: 'off', placeholder: 'Search plants' }}
          />
          <button type="submit">Submit</button>
        </form>
      );
    }

    render(<Form />);
    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Choose a plant.')).toBeVisible();
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription(/One plant per pot\./);
    expect(input).toHaveAccessibleDescription(/Choose a plant\./);
    expect(input).toHaveAttribute('placeholder', 'Search plants');

    await user.type(input, 'Fer');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(input).toHaveValue('Fern');

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted.mock.calls[0]?.[0]).toEqual({ plant: 'fern' });
  });

  it('keeps optional nested values undefined during filtering and Escape, but commits a real clear', async () => {
    const user = userEvent.setup();
    const nativeInput = vi.fn();
    const inputProps = Object.freeze({ onInput: nativeInput });

    function Form() {
      const form = useSchemaForm(
        z.object({ preferences: z.object({ plant: z.string().optional() }) }),
        { defaultValues: { preferences: {} } },
      );

      return (
        <>
          <PharoFormComboBox
            control={form.control}
            name="preferences.plant"
            label="Plant"
            defaultItems={plants}
            itemKey={itemKey}
            itemText={itemText}
            inputProps={inputProps}
          />
          <output aria-label="Draft">
            {JSON.stringify({
              value: form.watch('preferences.plant'),
              dirty: form.formState.isDirty,
            })}
          </output>
        </>
      );
    }

    render(<Form />);
    const input = screen.getByRole('combobox', { name: 'Plant' });

    expect(input).toHaveValue('');
    expect(screen.getByLabelText('Draft')).toHaveTextContent('{"dirty":false}');

    await user.type(input, 'Fer');

    expect(await screen.findByRole('option', { name: 'Fern' })).toBeVisible();
    expect(screen.getByLabelText('Draft')).toHaveTextContent('{"dirty":false}');

    await user.keyboard('{Escape}');

    expect(input).toHaveValue('');
    expect(screen.getByLabelText('Draft')).toHaveTextContent('{"dirty":false}');

    await user.type(input, 'Or');
    await user.clear(input);

    expect(screen.getByLabelText('Draft')).toHaveTextContent('{"value":"","dirty":true}');
    expect(nativeInput).toHaveBeenCalled();
  });

  it('retains a selected key while filtering and restores its label on Escape, then clears deliberately', async () => {
    const user = userEvent.setup();

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string() }), {
        defaultValues: { plant: 'fern' },
      });

      return (
        <>
          <PharoFormComboBox
            control={form.control}
            name="plant"
            label="Plant"
            defaultItems={plants}
            itemKey={itemKey}
            itemText={itemText}
          />
          <output aria-label="Selected key">{JSON.stringify(form.watch('plant'))}</output>
        </>
      );
    }

    render(<Form />);
    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.type(input, 'x');

    expect(screen.getByLabelText('Selected key')).toHaveTextContent('"fern"');

    await user.keyboard('{Escape}');

    expect(input).toHaveValue('Fern');

    await user.clear(input);

    expect(screen.getByLabelText('Selected key')).toHaveTextContent('""');
  });

  it.each(['field', 'form'])(
    'honors %s disabled state and resumes preserved selection when enabled',
    async (mode) => {
      const user = userEvent.setup();
      const submitted = vi.fn();

      function Form() {
        const [disabled, setDisabled] = useState(true);
        const form = useSchemaForm(z.object({ plant: z.string().optional() }), {
          defaultValues: { plant: 'fern' },
          disabled: mode === 'form' && disabled,
        });

        return (
          <form onSubmit={form.handleSubmit(submitted)}>
            <PharoFormComboBox
              control={form.control}
              name="plant"
              label="Plant"
              defaultItems={plants}
              itemKey={itemKey}
              itemText={itemText}
              isDisabled={mode === 'field' && disabled}
            />
            <button type="button" onClick={() => setDisabled(false)}>
              Enable
            </button>
            <button type="submit">Submit</button>
          </form>
        );
      }

      render(<Form />);
      const input = screen.getByRole('combobox', { name: 'Plant' });

      expect(input).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Show options Plant' }));

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
      expect(submitted.mock.calls[0]?.[0].plant).toBeUndefined();
      expect(JSON.stringify(submitted.mock.calls[0]?.[0])).toBe('{}');

      await user.click(screen.getByRole('button', { name: 'Enable' }));

      expect(input).toBeEnabled();
      expect(input).toHaveValue('Fern');

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2));
      expect(submitted.mock.calls[1]?.[0]).toEqual({ plant: 'fern' });
    },
  );

  it('keeps read-only selection focusable and included while blocking edits', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string().min(1) }), {
        defaultValues: { plant: 'fern' },
      });

      return (
        <form onSubmit={form.handleSubmit(submitted)}>
          <PharoFormComboBox
            control={form.control}
            name="plant"
            label="Plant"
            defaultItems={plants}
            itemKey={itemKey}
            itemText={itemText}
            isReadOnly
          />
          <button type="submit">Submit</button>
        </form>
      );
    }

    render(<Form />);
    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.tab();

    expect(input).toHaveFocus();

    await user.type(input, 'change');

    expect(input).toHaveValue('Fern');

    await user.keyboard('{ArrowDown}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted.mock.calls[0]?.[0]).toEqual({ plant: 'fern' });
  });

  it.each([
    'selectedKey',
    'onSelectionChange',
    'inputValue',
    'onInputChange',
    'isInvalid',
    'errorMessage',
  ])('rejects untyped outer %s ownership overrides', (key) => {
    const override: Record<string, unknown> = { [key]: undefined };

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string().optional() }));

      return (
        <PharoFormComboBox
          control={form.control}
          name="plant"
          label="Plant"
          defaultItems={plants}
          itemKey={itemKey}
          itemText={itemText}
          {...override}
        />
      );
    }

    expect(() => render(<Form />)).toThrow('PHARO-FORMS-COMBO-PROPS');
  });

  it('preserves the actual base guard for nested input overrides', () => {
    const inputProps: Record<string, unknown> = { value: undefined };

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string().optional() }));

      return (
        <PharoFormComboBox
          control={form.control}
          name="plant"
          label="Plant"
          defaultItems={plants}
          itemKey={itemKey}
          itemText={itemText}
          inputProps={inputProps}
        />
      );
    }

    expect(() => render(<Form />)).toThrow('PHARO-FIELD-INPUT-PROPS');
  });

  it('preserves nonenumerable own input keys for the actual base ownership guard', () => {
    const inputProps: Record<string, unknown> = {};
    Object.defineProperty(inputProps, 'value', { value: undefined });

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string().optional() }));

      return (
        <PharoFormComboBox
          control={form.control}
          name="plant"
          label="Plant"
          defaultItems={plants}
          itemKey={itemKey}
          itemText={itemText}
          inputProps={inputProps}
        />
      );
    }

    expect(() => render(<Form />)).toThrow('PHARO-FIELD-INPUT-PROPS');
  });

  it.each([42, ''])('rejects the invalid runtime item key %s', (invalidKey) => {
    const item = { id: 'valid', name: 'Plant' };
    Object.defineProperty(item, 'id', { value: invalidKey });

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string().optional() }));

      return (
        <PharoFormComboBox
          control={form.control}
          name="plant"
          label="Plant"
          defaultItems={[item]}
          itemKey={itemKey}
          itemText={itemText}
        />
      );
    }

    expect(() => render(<Form />)).toThrow('PHARO-FORMS-ITEM-KEY');
  });

  it('rejects an untyped nonstring draft instead of converting it into a key', () => {
    const defaults = { plant: '' };
    Object.defineProperty(defaults, 'plant', { value: 42 });

    function Form() {
      const form = useSchemaForm(z.object({ plant: z.string() }), { defaultValues: defaults });

      return (
        <PharoFormComboBox
          control={form.control}
          name="plant"
          label="Plant"
          defaultItems={plants}
          itemKey={itemKey}
          itemText={itemText}
        />
      );
    }

    expect(() => render(<Form />)).toThrow('PHARO-FORMS-TEXT-VALUE');
  });
});
