import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useSchemaForm } from '../../hooks/useSchemaForm/useSchemaForm';
import { PharoFormTextField } from './PharoFormTextField';

describe('PharoFormTextField', () => {
  it('binds nested edits, blur validation, descriptions, and the controller error-focus ref', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    function Form() {
      const form = useSchemaForm(
        z.object({ profile: z.object({ name: z.string().min(2, 'Enter your name.') }) }),
        {
          defaultValues: { profile: { name: '' } },
          mode: 'onBlur',
        },
      );
      return (
        <form noValidate onSubmit={form.handleSubmit(submitted)}>
          <PharoFormTextField
            control={form.control}
            name="profile.name"
            label="Name"
            description="Shown with your work."
            inputProps={{ autoComplete: 'name', placeholder: 'Full name' }}
          />
          <button type="submit">Submit</button>
          <output aria-label="Touched">
            {String(Boolean(form.formState.touchedFields.profile?.name))}
          </output>
        </form>
      );
    }
    render(<Form />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    await user.tab();
    expect(await screen.findByText('Enter your name.')).toBeVisible();
    expect(screen.getByLabelText('Touched')).toHaveTextContent('true');
    expect(input).toHaveAccessibleDescription(/Shown with your work\./);
    expect(input).toHaveAccessibleDescription(/Enter your name\./);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('name', 'profile.name');
    expect(input).toHaveAttribute('autocomplete', 'name');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(submitted).not.toHaveBeenCalled();
    await user.type(input, 'Ada');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted.mock.calls[0]?.[0]).toEqual({ profile: { name: 'Ada' } });
  });

  it('displays untouched undefined without writing it, while deliberate clearing writes an empty string', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    function Form() {
      const form = useSchemaForm(z.object({ note: z.string().optional() }), { defaultValues: {} });
      return (
        <form onSubmit={form.handleSubmit(submitted)}>
          <PharoFormTextField control={form.control} name="note" label="Optional note" />
          <output aria-label="Draft">
            {JSON.stringify({ value: form.watch('note'), dirty: form.formState.isDirty })}
          </output>
          <button type="submit">Submit</button>
        </form>
      );
    }
    render(<Form />);
    const input = screen.getByRole('textbox', { name: 'Optional note' });
    expect(input).toHaveValue('');
    expect(screen.getByLabelText('Draft')).toHaveTextContent('{"dirty":false}');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted.mock.calls[0]?.[0].note).toBeUndefined();
    await user.type(input, 'Edited');
    await user.clear(input);
    expect(screen.getByLabelText('Draft')).toHaveTextContent('{"value":"","dirty":true}');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2));
    expect(submitted.mock.calls[1]?.[0]).toEqual({ note: '' });
  });

  it.each(['field', 'form'])(
    'honors %s disabled state, omission, and re-enable transitions',
    async (mode) => {
      const user = userEvent.setup();
      const submitted = vi.fn();
      function Form() {
        const [disabled, setDisabled] = useState(true);
        const form = useSchemaForm(z.object({ title: z.string().optional() }), {
          defaultValues: { title: 'Saved' },
          disabled: mode === 'form' && disabled,
        });
        return (
          <form onSubmit={form.handleSubmit(submitted)}>
            <PharoFormTextField
              control={form.control}
              name="title"
              label="Title"
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
      const input = screen.getByRole('textbox', { name: 'Title' });
      expect(input).toBeDisabled();
      await user.tab();
      expect(input).not.toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
      expect(submitted.mock.calls[0]?.[0].title).toBeUndefined();
      expect(JSON.stringify(submitted.mock.calls[0]?.[0])).toBe('{}');
      await user.click(screen.getByRole('button', { name: 'Enable' }));
      expect(input).toBeEnabled();
      expect(input).toHaveValue('Saved');
      await user.type(input, ' again');
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2));
      expect(submitted.mock.calls[1]?.[0]).toEqual({ title: 'Saved again' });
    },
  );

  it('keeps read-only values focusable, schema-validated, and included in submission', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    function Form() {
      const form = useSchemaForm(z.object({ code: z.string().min(3, 'Code is incomplete.') }), {
        defaultValues: { code: 'x' },
      });
      return (
        <form noValidate onSubmit={form.handleSubmit(submitted)}>
          <PharoFormTextField control={form.control} name="code" label="Code" isReadOnly />
          <button type="button" onClick={() => form.reset({ code: 'ABC' })}>
            Load valid code
          </button>
          <button type="submit">Submit</button>
        </form>
      );
    }
    render(<Form />);
    const input = screen.getByRole('textbox', { name: 'Code' });
    await user.tab();
    expect(input).toHaveFocus();
    await user.type(input, 'change');
    expect(input).toHaveValue('x');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Code is incomplete.')).toBeVisible();
    expect(submitted).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Load valid code' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted.mock.calls[0]?.[0]).toEqual({ code: 'ABC' });
  });

  it.each(['value', 'onBlur', 'inputRef', 'isInvalid', 'errorMessage'])(
    'rejects untyped outer %s ownership overrides',
    (key) => {
      const override: Record<string, unknown> = { [key]: undefined };
      function Form() {
        const form = useSchemaForm(z.object({ name: z.string() }), { defaultValues: { name: '' } });
        return <PharoFormTextField control={form.control} name="name" label="Name" {...override} />;
      }
      expect(() => render(<Form />)).toThrow('PHARO-FORMS-TEXT-PROPS');
    },
  );

  it('preserves the base nested ownership guard', () => {
    const inputProps: Record<string, unknown> = { 'aria-label': undefined };
    function Form() {
      const form = useSchemaForm(z.object({ name: z.string() }));
      return (
        <PharoFormTextField
          control={form.control}
          name="name"
          label="Name"
          inputProps={inputProps}
        />
      );
    }
    expect(() => render(<Form />)).toThrow('PHARO-FIELD-INPUT-PROPS');
  });

  it('rejects untyped runtime default data instead of stringifying it', () => {
    const defaults = { name: '' };
    Object.defineProperty(defaults, 'name', { value: 42 });
    function Form() {
      const form = useSchemaForm(z.object({ name: z.string() }), { defaultValues: defaults });
      return <PharoFormTextField control={form.control} name="name" label="Name" />;
    }
    expect(() => render(<Form />)).toThrow('PHARO-FORMS-TEXT-VALUE');
  });
});
