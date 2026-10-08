import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Key } from 'react-aria-components';
import { PharoMultiComboBox } from './PharoMultiComboBox';
import type { PharoMultiComboBoxProps, PharoSelectionAction, PharoSelectionOutcome } from './types';

const items = [
  { id: 7, name: 'Fern' },
  { id: 8, name: 'Maple' },
  { id: 9, name: 'Orchid' },
];
interface Item {
  id: number;
  name: string;
}
interface HarnessProps extends Partial<PharoMultiComboBoxProps<Item>> {
  initialKeys?: readonly Key[];
}
function Harness(props: HarnessProps) {
  const { initialKeys = [], ...overrides } = props;
  const [keys, setKeys] = useState<readonly Key[]>(initialKeys);
  const [query, setQuery] = useState('');
  const handleAction = (action: PharoSelectionAction) => {
    setKeys((previous) =>
      action.kind === 'add'
        ? [...previous, action.key]
        : action.kind === 'clear'
          ? []
          : previous.filter((key) => !action.keys.includes(key)),
    );
    return 'committed' as const;
  };
  return (
    <PharoMultiComboBox
      label="Plants"
      items={items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))}
      itemKey={(item) => item.id}
      itemText={(item) => item.name}
      selectedKeys={keys}
      selectedText={(key) => items.find((item) => item.id === key)?.name ?? `Unknown ${key}`}
      inputValue={query}
      onInputChange={setQuery}
      onSelectionAction={handleAction}
      {...overrides}
    />
  );
}

describe('PharoMultiComboBox', () => {
  it('opens on focus and makes the first filtered result active for Enter without submitting', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={submitted}>
        <Harness />
        <button type="submit">Submit</button>
      </form>,
    );
    const input = screen.getByRole('combobox', { name: 'Plants' });
    await user.click(input);
    await user.type(input, 'Ma');
    const option = await screen.findByRole('option', { name: 'Maple' });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', option.id));
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: 'Remove Maple' })).toBeVisible();
    expect(input).toHaveValue('');
    expect(submitted).not.toHaveBeenCalled();
    await user.type(input, 'Or');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Or');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
  it('preserves unknown controlled tags through filtering, pending and failed collections', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness initialKeys={['retired', 7]} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'Map');
    expect(screen.getByText('Unknown retired')).toBeVisible();
    expect(screen.getByText('Fern')).toBeVisible();
    rerender(<Harness initialKeys={['retired', 7]} items={[]} isLoading />);
    expect(await screen.findByText('Loading options…')).toBeVisible();
    expect(screen.queryAllByRole('option', { selected: false })).toHaveLength(0);
    rerender(
      <Harness
        initialKeys={['retired', 7]}
        items={[]}
        isInvalid
        errorMessage="Collection unavailable. Retry later."
      />,
    );
    expect(input).toHaveAccessibleDescription(/Collection unavailable/);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Remove Unknown retired' }));
    expect(
      screen.queryByRole('button', { name: 'Remove Unknown retired' }),
    ).not.toBeInTheDocument();
  });
  it('disables only additional choices at the configurable limit and restores input after final removal', async () => {
    const user = userEvent.setup();
    render(<Harness initialKeys={[7]} maxSelected={1} />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    const disabledOption = await screen.findByRole('option', { name: 'Maple' });
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true');
    expect(disabledOption).toHaveTextContent('Limit reached');
    expect(screen.getByRole('option', { name: 'Fern' })).not.toHaveAttribute('aria-disabled');
    await user.click(disabledOption);
    expect(screen.queryByRole('button', { name: 'Remove Maple' })).not.toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(input).toHaveAccessibleDescription(/1\/1.*Selection limit/);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Remove Fern' }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Remove Fern' })).not.toBeInTheDocument();
    const availableOption = await screen.findByRole('option', { name: 'Maple' });
    expect(availableOption).not.toHaveAttribute('aria-disabled');
    expect(availableOption).not.toHaveTextContent('Limit reached');
    await user.click(availableOption);
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: 'Remove Maple' })).toBeVisible();
  });
  it('keeps read-only values readable and suppresses every mutation', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const changed = vi.fn();
    const { rerender } = render(
      <Harness initialKeys={[7]} isReadOnly onSelectionAction={action} onInputChange={changed} />,
    );
    const input = screen.getByRole('combobox');
    await user.type(input, 'Map');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.getByText('Fern')).toBeVisible();
    expect(action).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    rerender(<Harness initialKeys={[7]} isDisabled />);
    expect(input).toBeDisabled();
  });
  it('updates native selection and tags when its parent changes keys while open', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const { rerender } = render(<Harness selectedKeys={[7]} onSelectionAction={action} />);
    await user.click(screen.getByRole('combobox'));
    rerender(<Harness selectedKeys={[8, 'unlisted']} onSelectionAction={action} />);
    expect(await screen.findByRole('option', { name: 'Maple' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Remove Unknown unlisted' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove Fern' })).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
  it('preserves IME composing Enter without making a selection', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockReturnValue('committed');
    render(<Harness onSelectionAction={action} />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'Ma' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    fireEvent.keyUp(input, { key: 'Enter', code: 'Enter', isComposing: true });
    expect(action).not.toHaveBeenCalled();
    expect(input).toHaveValue('Ma');
    fireEvent.compositionEnd(input);
  });
  it('exposes safe rejection text and recovers on a later interaction', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error('SECRET DETAIL'))
      .mockResolvedValueOnce('committed');
    render(<Harness onSelectionAction={action} errorMessage="Could not update. Try again." />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'Ma');
    await user.click(await screen.findByRole('option', { name: 'Maple' }));
    await waitFor(() => expect(input).toHaveAccessibleDescription(/Could not update/));
    expect(input).toHaveValue('Ma');
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Maple' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(action).toHaveBeenCalledTimes(2);
  });
  it('forwards the real input ref and leaves empty text inert', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    const action = vi.fn();
    render(<Harness items={[]} inputRef={ref} onSelectionAction={action} />);
    await user.click(screen.getByRole('combobox'));
    expect(ref.current).toBe(screen.getByRole('combobox'));
    await user.click(await screen.findByText('No options found.'));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(action).not.toHaveBeenCalled();
    await user.type(screen.getByRole('combobox'), 'No matching value');
    await user.keyboard('{Enter}');
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('No matching value');
  });
  it('preserves a newer draft while a native option addition awaits its owner', async () => {
    const user = userEvent.setup();
    let complete: (value: PharoSelectionOutcome) => void = () => undefined;
    const pending = new Promise<PharoSelectionOutcome>((resolve) => {
      complete = resolve;
    });
    const action = vi.fn().mockReturnValue(pending);
    const { rerender } = render(<Harness onSelectionAction={action} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'Ma');
    await user.click(await screen.findByRole('option', { name: 'Maple' }));
    expect(input).toHaveValue('Ma');
    await user.clear(input);
    await user.type(input, 'Or');
    rerender(<Harness selectedKeys={[8]} onSelectionAction={action} />);
    await act(async () => {
      complete('committed');
      await pending;
    });
    expect(input).toHaveValue('Or');
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'add', key: 8 });
  });
});
