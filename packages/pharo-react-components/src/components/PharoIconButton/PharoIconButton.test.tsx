import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PharoIconButton } from './PharoIconButton';

describe('PharoIconButton', () => {
  it('names the action, hides its decorative icon, and supports keyboard activation', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <PharoIconButton
        aria-label="Close observations"
        icon={<svg role="img" aria-label="Cross icon" />}
        onPress={onPress}
      />,
    );
    const button = screen.getByRole('button', { name: 'Close observations' });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    await user.tab();

    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('forwards interaction state to consumer className render functions', async () => {
    const user = userEvent.setup();
    render(
      <PharoIconButton
        aria-label="Close observations"
        icon={<svg />}
        className={({ isPressed }) => (isPressed ? 'consumer-pressed' : 'consumer-rest')}
      />,
    );
    const button = screen.getByRole('button', { name: 'Close observations' });

    await user.pointer({ target: button, keys: '[MouseLeft>]' });

    expect(button).toHaveClass('consumer-pressed');

    await user.pointer('[/MouseLeft]');

    expect(button).toHaveClass('consumer-rest');
  });

  it('suppresses disabled and pending actions', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <>
        <PharoIconButton aria-label="Disabled action" icon={<svg />} isDisabled onPress={onPress} />
        <PharoIconButton aria-label="Pending action" icon={<svg />} isPending onPress={onPress} />
      </>,
    );
    const disabled = screen.getByRole('button', { name: 'Disabled action' });
    const pending = screen.getByRole('button', { name: 'Pending action' });

    await user.click(disabled);
    await user.click(pending);
    pending.focus();
    await user.keyboard('{Enter}');

    expect(disabled).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
