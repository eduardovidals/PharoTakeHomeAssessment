import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Key } from 'react-aria-components';
import { PharoComboBox } from './PharoComboBox';

const plants = [
  { id: 'orchid', name: 'Orchid' },
  { id: 'fern', name: 'Fern' },
  { id: 'maple', name: 'Maple' },
];

const itemKey = (item: { id: string; name: string }) => item.id;

const itemText = (item: { id: string; name: string }) => item.name;

describe('PharoComboBox', () => {
  it('preserves controlled input and selection through its public callbacks', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    const changed = vi.fn();

    function ControlledChoice() {
      const [input, setInput] = useState('');
      const [key, setKey] = useState<Key | null>(null);

      return (
        <>
          <PharoComboBox
            label="Plant"
            defaultItems={plants}
            itemKey={itemKey}
            itemText={itemText}
            inputValue={input}
            onInputChange={(value) => {
              setInput(value);
              changed(value);
            }}
            selectedKey={key}
            onSelectionChange={(value) => {
              setKey(value);
              // React Aria leaves both controlled values in the consumer's ownership.
              setInput(plants.find((plant) => plant.id === value)?.name ?? '');
              selected(value);
            }}
          />
          <output aria-label="Selected key">{key ?? 'none'}</output>
        </>
      );
    }

    render(<ControlledChoice />);
    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.type(input, 'Fer');

    expect(changed).toHaveBeenLastCalledWith('Fer');

    await user.click(await screen.findByRole('option', { name: 'Fern' }));

    expect(selected).toHaveBeenLastCalledWith('fern');
    expect(screen.getByLabelText('Selected key')).toHaveTextContent('fern');
    expect(input).toHaveValue('Fern');
  });

  it('filters default items and restores input focus after Escape', async () => {
    const user = userEvent.setup();
    render(
      <PharoComboBox label="Plant" defaultItems={plants} itemKey={itemKey} itemText={itemText} />,
    );
    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.type(input, 'map');

    expect(await screen.findByRole('option', { name: 'Maple' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Fern' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('exposes an empty result without inventing a selectable option', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(
      <PharoComboBox
        label="Plant"
        items={[]}
        itemKey={itemKey}
        itemText={itemText}
        onSelectionChange={selected}
      />,
    );

    await user.click(screen.getByRole('button'));

    const placeholder = await screen.findByText('No options found.');

    expect(placeholder).toBeVisible();

    await user.click(placeholder);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(selected).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Plant' })).toHaveValue('');
  });

  it('preserves label, help, invalid state, safe hints, and the real input ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <PharoComboBox
        label="Plant"
        items={plants}
        itemKey={itemKey}
        itemText={itemText}
        inputRef={ref}
        description="Choose a plant."
        isInvalid
        errorMessage="Selection is required."
        inputProps={{ autoComplete: 'off', placeholder: 'Search plants' }}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Plant' });

    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Choose a plant\./);
    expect(input).toHaveAccessibleDescription(/Selection is required\./);
    expect(input).toHaveAttribute('placeholder', 'Search plants');
  });

  it('respects disabled and read-only fields', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PharoComboBox
        label="Plant"
        items={plants}
        itemKey={itemKey}
        itemText={itemText}
        isDisabled
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Plant' })).toBeDisabled();

    rerender(
      <PharoComboBox
        label="Plant"
        items={plants}
        itemKey={itemKey}
        itemText={itemText}
        isReadOnly
        defaultSelectedKey="fern"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.type(input, 'orchid');

    expect(input).toHaveAttribute('readonly');
    expect(input).not.toHaveValue('orchid');
  });

  it('keeps disabled keys unselectable and forwards consumer state classes', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(
      <PharoComboBox
        label="Plant"
        defaultItems={plants}
        itemKey={itemKey}
        itemText={itemText}
        disabledKeys={['fern']}
        onSelectionChange={selected}
        className={({ isOpen }) => (isOpen ? 'consumer-open' : '')}
        inputProps={{ className: ({ isFocused }) => (isFocused ? 'consumer-focused' : '') }}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Plant' });

    await user.click(input);
    await user.keyboard('{ArrowDown}');

    const fern = await screen.findByRole('option', { name: 'Fern' });

    expect(fern).toHaveAttribute('aria-disabled', 'true');
    expect(input.closest('.consumer-open')).not.toBeNull();
    expect(input).toHaveClass('consumer-focused');

    await user.click(fern);

    expect(selected).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
  });

  it.each([
    'value',
    'name',
    'onChange',
    'onBlur',
    'ref',
    'id',
    'slot',
    'aria-label',
    'aria-describedby',
    'aria-invalid',
  ])('rejects an untyped owned %s input prop even when undefined', (key) => {
    const inputProps: Record<string, unknown> = { [key]: undefined };

    expect(() =>
      render(
        <PharoComboBox
          label="Plant"
          items={plants}
          itemKey={itemKey}
          itemText={itemText}
          inputProps={inputProps}
        />,
      ),
    ).toThrow();
  });
});
