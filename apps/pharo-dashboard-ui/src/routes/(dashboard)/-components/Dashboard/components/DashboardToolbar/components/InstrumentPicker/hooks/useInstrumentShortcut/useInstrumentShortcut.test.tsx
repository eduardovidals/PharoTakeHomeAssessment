import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useInstrumentShortcut } from './useInstrumentShortcut';

function ShortcutFixture() {
  const inputRef = useRef<HTMLInputElement>(null);
  useInstrumentShortcut({ inputRef });
  return (
    <>
      <input ref={inputRef} aria-label="Picker" />
      <input aria-label="Other input" />
      <textarea aria-label="Notes" />
      <select aria-label="Selection">
        <option>One</option>
      </select>
      <div contentEditable suppressContentEditableWarning>
        <span data-testid="editable-child">Draft</span>
      </div>
      <button>Outside</button>
    </>
  );
}

describe('optional instrument focus shortcut', () => {
  test('focuses an available input and removes its document handler on unmount', () => {
    const { unmount } = render(<ShortcutFixture />);

    const picker = screen.getByRole('textbox', { name: 'Picker' });
    const outside = screen.getByRole('button', { name: 'Outside' });

    outside.focus();

    expect(fireEvent.keyDown(outside, { key: '/' })).toBe(false);
    expect(picker).toHaveFocus();

    unmount();

    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(true);
  });

  test('respects editable descendants, composition, modifiers, prevented events and dialogs', () => {
    render(<ShortcutFixture />);

    const picker = screen.getByRole('textbox', { name: 'Picker' });
    const outside = screen.getByRole('button', { name: 'Outside' });

    outside.focus();

    for (const target of [
      screen.getByRole('textbox', { name: 'Other input' }),
      screen.getByRole('textbox', { name: 'Notes' }),
      screen.getByRole('combobox', { name: 'Selection' }),
      screen.getByTestId('editable-child'),
    ]) {
      expect(fireEvent.keyDown(target, { key: '/' })).toBe(true);
      expect(picker).not.toHaveFocus();
    }
    for (const extra of [
      { isComposing: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
    ]) {
      expect(fireEvent.keyDown(outside, { key: '/', ...extra })).toBe(true);
      expect(picker).not.toHaveFocus();
    }

    const prevented = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    prevented.preventDefault();
    outside.dispatchEvent(prevented);

    expect(picker).not.toHaveFocus();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    try {
      expect(fireEvent.keyDown(outside, { key: '/' })).toBe(true);
      expect(picker).not.toHaveFocus();
    } finally {
      dialog.remove();
    }
  });
});
