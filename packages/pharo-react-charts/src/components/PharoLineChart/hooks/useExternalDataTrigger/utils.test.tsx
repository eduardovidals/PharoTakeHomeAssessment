import { afterEach, expect, it, vi } from 'vitest';
import { isDataTriggerReachable } from './utils';

afterEach(() => {
  document.body.replaceChildren();
});
it('requires a visible named enabled keyboard trigger from the owner document', () => {
  const owner = document.createElement('figure');
  const trigger = document.createElement('button');
  trigger.id = 'data-trigger';
  trigger.textContent = 'View recorded data';
  document.body.append(owner, trigger);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  expect(isDataTriggerReachable(owner, 'data-trigger')).toBe(true);
  for (const [attribute, value] of [
    ['hidden', ''],
    ['disabled', ''],
    ['aria-disabled', 'true'],
    ['aria-hidden', 'true'],
    ['tabindex', '-1'],
  ]) {
    if (attribute === undefined || value === undefined) throw new Error('Invalid test condition.');
    trigger.setAttribute(attribute, value);
    expect(isDataTriggerReachable(owner, 'data-trigger')).toBe(false);
    trigger.removeAttribute(attribute);
  }
  trigger.textContent = '';
  expect(isDataTriggerReachable(owner, 'data-trigger')).toBe(false);
  trigger.setAttribute('aria-label', 'Raw data');
  expect(isDataTriggerReachable(owner, 'data-trigger')).toBe(true);
  expect(isDataTriggerReachable(owner, '')).toBe(false);
  expect(isDataTriggerReachable(owner, 'missing')).toBe(false);
});
