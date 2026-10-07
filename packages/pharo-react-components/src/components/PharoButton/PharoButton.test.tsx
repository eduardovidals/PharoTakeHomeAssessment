import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PharoButton } from './PharoButton';

describe('PharoButton', () => {
  it('preserves its accessible name and keyboard press handler without providers', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<PharoButton onPress={onPress}>Continue</PharoButton>);
    const button = screen.getByRole('button', { name: 'Continue' });
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['primary', 'secondary', 'quiet'])(
    'supports the %s appearance and consumer classes',
    (variant) => {
      if (variant !== 'primary' && variant !== 'secondary' && variant !== 'quiet')
        throw new Error('Invalid fixture.');
      render(
        <PharoButton variant={variant} className="consumer-action">
          A named action
        </PharoButton>,
      );
      expect(screen.getByRole('button', { name: 'A named action' })).toHaveClass('consumer-action');
    },
  );

  it('preserves state render functions for children and className', async () => {
    const user = userEvent.setup();
    render(
      <PharoButton
        className={({ isPressed }) => (isPressed ? 'consumer-pressed' : 'consumer-rest')}
      >
        {({ isPressed }) => (isPressed ? 'Pressed action' : 'Ready action')}
      </PharoButton>,
    );
    const button = screen.getByRole('button', { name: 'Ready action' });
    await user.pointer({ target: button, keys: '[MouseLeft>]' });
    expect(button).toHaveAccessibleName('Pressed action');
    expect(button).toHaveClass('consumer-pressed');
    await user.pointer('[/MouseLeft]');
    expect(button).toHaveAccessibleName('Ready action');
  });

  it('suppresses disabled and pending actions', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <>
        <PharoButton isDisabled onPress={onPress}>
          Disabled
        </PharoButton>
        <PharoButton isPending onPress={onPress}>
          Pending
        </PharoButton>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Disabled' }));
    await user.click(screen.getByRole('button', { name: 'Pending' }));
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
