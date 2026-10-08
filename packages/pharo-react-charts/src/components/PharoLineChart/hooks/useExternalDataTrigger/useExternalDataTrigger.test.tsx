import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useExternalDataTrigger } from './useExternalDataTrigger';

interface HarnessProps {
  readonly triggerId: string;
}
function Harness(props: HarnessProps) {
  const { triggerId } = props;
  const [owner, setOwner] = useState<HTMLElement | null>(null);
  const available = useExternalDataTrigger({ owner, triggerId });
  return (
    <figure ref={setOwner}>
      <span>{available ? 'External available' : 'Inline available'}</span>
    </figure>
  );
}
it('reacts to external hide/remove mutations and disconnects its observer on unmount', async () => {
  const trigger = document.createElement('button');
  trigger.id = 'actual-data';
  trigger.textContent = 'View data';
  document.body.append(trigger);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
  const view = render(<Harness triggerId="actual-data" />);
  expect(screen.getByText('External available')).toBeVisible();
  await act(async () => {
    trigger.hidden = true;
  });
  await waitFor(() => expect(screen.getByText('Inline available')).toBeVisible());
  await act(async () => {
    trigger.hidden = false;
  });
  await waitFor(() => expect(screen.getByText('External available')).toBeVisible());
  await act(async () => {
    trigger.remove();
  });
  await waitFor(() => expect(screen.getByText('Inline available')).toBeVisible());
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});

it('restores fallback when an external custom action loses its interactive role', async () => {
  const trigger = document.createElement('span');
  trigger.id = 'custom-data';
  trigger.textContent = 'View records';
  trigger.setAttribute('role', 'button');
  trigger.tabIndex = 0;
  document.body.append(trigger);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  const view = render(<Harness triggerId="custom-data" />);
  expect(screen.getByText('External available')).toBeVisible();
  await act(async () => {
    trigger.removeAttribute('role');
  });
  await waitFor(() => expect(screen.getByText('Inline available')).toBeVisible());
  view.unmount();
  trigger.remove();
});
