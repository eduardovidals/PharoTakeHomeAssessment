import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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

afterEach(() => document.body.replaceChildren());

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

function createModalFixture(id: string) {
  const background = document.createElement('main');
  const container = document.createElement('div');
  const trigger = document.createElement('button');
  trigger.id = id;
  trigger.textContent = 'View data';
  background.append(container, trigger);
  const dialog = document.createElement('section');
  dialog.id = `${id}-dialog`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'Raw observations');
  for (const element of [trigger, dialog]) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  }
  document.body.append(background);
  const open = () => {
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', dialog.id);
    background.setAttribute('inert', '');
    background.setAttribute('aria-hidden', 'true');
    document.body.append(dialog);
  };
  const close = () => {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    background.removeAttribute('inert');
    background.removeAttribute('aria-hidden');
    dialog.remove();
  };
  return { background, container, trigger, dialog, open, close };
}

it('retains an established trigger through its modal mask and reacts to broken or closed associations', async () => {
  const fixture = createModalFixture('modal-data');
  const view = render(<Harness triggerId={fixture.trigger.id} />, { container: fixture.container });
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => fixture.open());
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => fixture.trigger.setAttribute('aria-controls', 'missing-dialog'));
  expect(view.getByText('Inline available')).toBeVisible();
  await act(async () => fixture.trigger.setAttribute('aria-controls', fixture.dialog.id));
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => fixture.trigger.setAttribute('aria-expanded', 'false'));
  expect(view.getByText('Inline available')).toBeVisible();
  await act(async () => fixture.trigger.setAttribute('aria-expanded', 'true'));
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => {
    fixture.dialog.hidden = true;
  });
  expect(view.getByText('Inline available')).toBeVisible();
  await act(async () => {
    fixture.dialog.hidden = false;
  });
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => fixture.dialog.remove());
  expect(view.getByText('Inline available')).toBeVisible();
  await act(async () => {
    document.body.append(fixture.dialog);
  });
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => fixture.close());
  expect(view.getByText('External available')).toBeVisible();
  await act(async () => {
    fixture.trigger.disabled = true;
  });
  expect(view.getByText('Inline available')).toBeVisible();
  await act(async () => {
    fixture.trigger.disabled = false;
    fixture.open();
  });
  expect(view.getByText('Inline available')).toBeVisible();
  view.unmount();
});

it('never inherits prior eligibility from another instance, a new owner or a replacement button', async () => {
  const first = createModalFixture('first-data');
  const second = createModalFixture('second-data');
  second.open();
  const firstView = render(<Harness triggerId={first.trigger.id} />, {
    container: first.container,
  });
  const secondView = render(<Harness triggerId={second.trigger.id} />, {
    container: second.container,
  });
  expect(firstView.getByText('External available')).toBeVisible();
  expect(secondView.getByText('Inline available')).toBeVisible();
  await act(async () => first.open());
  expect(firstView.getByText('External available')).toBeVisible();
  firstView.rerender(<Harness triggerId={second.trigger.id} />);
  expect(firstView.getByText('Inline available')).toBeVisible();
  firstView.rerender(<Harness triggerId={first.trigger.id} />);
  expect(firstView.getByText('Inline available')).toBeVisible();
  await act(async () => first.close());
  expect(firstView.getByText('External available')).toBeVisible();
  await act(async () => first.open());
  const replacement = document.createElement('button');
  replacement.id = first.trigger.id;
  replacement.textContent = 'View data';
  replacement.setAttribute('aria-expanded', 'true');
  replacement.setAttribute('aria-controls', first.dialog.id);
  vi.spyOn(replacement, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  await act(async () => first.trigger.replaceWith(replacement));
  expect(firstView.getByText('Inline available')).toBeVisible();
  firstView.unmount();
  const newView = render(<Harness triggerId={replacement.id} />);
  expect(within(newView.container).getByText('Inline available')).toBeVisible();
  newView.unmount();
  secondView.unmount();
});
