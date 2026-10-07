import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PharoTextField } from './PharoTextField';

describe('PharoTextField', () => {
  it('associates its visible label, help, and invalid message', () => {
    render(
      <PharoTextField
        label="Display name"
        description="Shown with your work."
        isInvalid
        errorMessage="Enter a display name."
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Display name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Shown with your work\./);
    expect(input).toHaveAccessibleDescription(/Enter a display name\./);
  });

  it('preserves controlled edits, name, and blur callbacks', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const blur = vi.fn();
    function ControlledField() {
      const [value, setValue] = useState('Ada');
      return (
        <PharoTextField
          label="Name"
          name="name"
          value={value}
          onChange={(next) => {
            setValue(next);
            change(next);
          }}
          onBlur={blur}
        />
      );
    }
    render(<ControlledField />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.type(input, ' Lovelace');
    await user.tab();
    expect(input).toHaveValue('Ada Lovelace');
    expect(input).toHaveAttribute('name', 'name');
    expect(change).toHaveBeenLastCalledWith('Ada Lovelace');
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('forwards the input ref and safe native hints while preserving consumer classes', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <PharoTextField
        label="Email"
        inputRef={ref}
        defaultValue="hello@example.test"
        className="consumer-field"
        inputProps={{
          autoComplete: 'email',
          inputMode: 'email',
          placeholder: 'name@example.test',
          className: 'consumer-input',
        }}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(ref.current).toBe(input);
    expect(input).toHaveValue('hello@example.test');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(input).toHaveAttribute('inputmode', 'email');
    expect(input).toHaveAttribute('placeholder', 'name@example.test');
    expect(input).toHaveClass('consumer-input');
    expect(input.closest('.consumer-field')).not.toBeNull();
  });

  it('distinguishes disabled from focusable read-only fields', async () => {
    const user = userEvent.setup();
    render(
      <>
        <PharoTextField label="Disabled name" isDisabled defaultValue="Fixed" />
        <PharoTextField label="Read-only name" isReadOnly defaultValue="Saved" />
      </>,
    );
    const disabled = screen.getByRole('textbox', { name: 'Disabled name' });
    const readOnly = screen.getByRole('textbox', { name: 'Read-only name' });
    await user.tab();
    expect(readOnly).toHaveFocus();
    await user.type(readOnly, ' changed');
    expect(readOnly).toHaveValue('Saved');
    expect(readOnly).not.toBeDisabled();
    expect(disabled).toBeDisabled();
  });

  it('passes real field and input state into consumer class callbacks', async () => {
    const user = userEvent.setup();
    render(
      <PharoTextField
        label="Name"
        isInvalid
        className={({ isInvalid }) => (isInvalid ? 'consumer-invalid' : '')}
        inputProps={{ className: ({ isFocused }) => (isFocused ? 'consumer-focused' : '') }}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    expect(input).toHaveClass('consumer-focused');
    expect(input.closest('.consumer-invalid')).not.toBeNull();
  });

  it.each([
    'value',
    'defaultValue',
    'name',
    'onChange',
    'onBlur',
    'ref',
    'disabled',
    'readOnly',
    'required',
    'id',
    'slot',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-invalid',
    'aria-errormessage',
  ])('rejects an untyped owned %s input prop even when undefined', (key) => {
    const inputProps: Record<string, unknown> = { [key]: undefined };
    expect(() => render(<PharoTextField label="Protected" inputProps={inputProps} />)).toThrow();
  });
});
