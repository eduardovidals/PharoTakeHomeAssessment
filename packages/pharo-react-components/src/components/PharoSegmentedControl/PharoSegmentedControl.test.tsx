import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { PharoSegmentedControl } from './PharoSegmentedControl';

const options = [
  { value: 'summary', label: 'Summary' },
  { value: 'unavailable', label: 'Unavailable', isDisabled: true },
  { value: 'detail', label: 'Detail' },
] as const;

type Choice = (typeof options)[number]['value'];

function ControlledChoice() {
  const [value, setValue] = useState<Choice>('summary');

  return (
    <PharoSegmentedControl
      label="Presentation"
      options={options}
      value={value}
      onChange={setValue}
    />
  );
}

describe('PharoSegmentedControl', () => {
  test('labels one radio group and moves the exclusive choice with arrows, skipping disabled options', async () => {
    const user = userEvent.setup();
    render(<ControlledChoice />);
    const group = screen.getByRole('radiogroup', { name: 'Presentation' });
    const summary = within(group).getByRole('radio', { name: 'Summary' });
    const detail = within(group).getByRole('radio', { name: 'Detail' });

    expect(summary).toBeChecked();

    await user.tab();

    expect(summary).toHaveFocus();

    await user.keyboard('{ArrowRight}');

    expect(detail).toBeChecked();
    expect(detail).toHaveFocus();
    expect(summary).not.toBeChecked();

    await user.keyboard('{ArrowLeft}');

    expect(summary).toBeChecked();
    expect(within(group).getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  test('leaves selection with its consumer and emits only the selected generic value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <PharoSegmentedControl
        label="Presentation"
        options={options}
        value="summary"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Detail' }));

    expect(onChange).toHaveBeenCalledWith('detail');
    expect(screen.getByRole('radio', { name: 'Summary' })).toBeChecked();

    rerender(
      <PharoSegmentedControl
        label="Presentation"
        options={options}
        value="detail"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Detail' })).toBeChecked();
  });

  test('retains a readable selected value while the whole group is disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PharoSegmentedControl
        label="Presentation"
        options={options}
        value="summary"
        onChange={onChange}
        isDisabled
        className="gap-pharo-4"
      />,
    );

    expect(screen.getByRole('radiogroup')).toHaveClass('gap-pharo-4');
    expect(screen.getByRole('radiogroup')).not.toHaveClass('gap-pharo-2');
    expect(screen.getByRole('radio', { name: 'Summary' })).toBeChecked();

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Detail' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
