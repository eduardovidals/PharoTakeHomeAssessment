import { afterEach, expect, it, vi } from 'vitest';
import { hasAssociatedDataDialog, isDataTriggerReachable } from './utils';

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

function createDialogRelationship() {
  const background = document.createElement('main');
  const owner = document.createElement('figure');
  const trigger = document.createElement('button');
  trigger.id = 'records';
  trigger.textContent = 'View data';
  background.append(owner, trigger);
  const dialog = document.createElement('section');
  dialog.id = 'records-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'Raw observations');
  document.body.append(background, dialog);
  for (const element of [trigger, dialog]) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  }
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', dialog.id);
  background.setAttribute('inert', '');
  background.setAttribute('aria-hidden', 'true');
  return { background, owner, trigger, dialog };
}

it('accepts only a previously usable native button associated with its visible named modal', () => {
  const { owner, trigger, dialog } = createDialogRelationship();
  expect(isDataTriggerReachable(owner, trigger.id)).toBe(false);
  expect(hasAssociatedDataDialog(owner, trigger.id, undefined)).toBe(false);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(true);
  dialog.removeAttribute('aria-label');
  dialog.textContent = 'Unnamed dialog body is not its accessible name';
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  const heading = document.createElement('h2');
  heading.id = 'records-title';
  heading.textContent = 'Recorded closing prices';
  dialog.append(heading);
  dialog.setAttribute('aria-labelledby', heading.id);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(true);
});

it.each([
  ['hidden', ''],
  ['disabled', ''],
  ['aria-disabled', 'true'],
  ['tabindex', '-1'],
  ['aria-expanded', 'false'],
  ['aria-controls', 'missing'],
  ['aria-controls', 'records-dialog another-dialog'],
  ['style', 'display: none'],
])('does not waive a button’s explicit %s=%s state', (attribute, value) => {
  const { owner, trigger } = createDialogRelationship();
  trigger.setAttribute(attribute, value);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
});

it.each([
  ['hidden', ''],
  ['inert', ''],
  ['aria-hidden', 'true'],
  ['role', 'region'],
  ['style', 'visibility: hidden'],
])('does not accept a dialog’s %s=%s state', (attribute, value) => {
  const { owner, trigger, dialog } = createDialogRelationship();
  dialog.setAttribute(attribute, value);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
});

it('requires unique trigger and dialog IDs and the actual retained button identity', () => {
  const { owner, trigger, dialog } = createDialogRelationship();
  const duplicateTrigger = trigger.cloneNode(true);
  document.body.append(duplicateTrigger);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  duplicateTrigger.parentNode?.removeChild(duplicateTrigger);
  const duplicateDialog = dialog.cloneNode(true);
  document.body.append(duplicateDialog);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  duplicateDialog.parentNode?.removeChild(duplicateDialog);
  expect(hasAssociatedDataDialog(owner, trigger.id, document.createElement('button'))).toBe(false);
  dialog.remove();
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
});

it('rejects masks unrelated to the chart, masks hiding the dialog and visual background hiding', () => {
  const { background, owner, trigger, dialog } = createDialogRelationship();
  const triggerOnly = document.createElement('div');
  triggerOnly.setAttribute('inert', '');
  background.append(triggerOnly);
  triggerOnly.append(trigger);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  background.append(trigger);
  background.append(dialog);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  document.body.append(dialog);
  background.style.display = 'none';
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
});

it('does not grant the active-modal exception to custom actions or closed native dialogs', () => {
  const { background, owner, trigger, dialog } = createDialogRelationship();
  const custom = document.createElement('span');
  custom.id = trigger.id;
  custom.tabIndex = 0;
  custom.textContent = 'View data';
  custom.setAttribute('role', 'button');
  custom.setAttribute('aria-expanded', 'true');
  custom.setAttribute('aria-controls', dialog.id);
  vi.spyOn(custom, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  trigger.replaceWith(custom);
  expect(hasAssociatedDataDialog(owner, custom.id, custom)).toBe(false);
  custom.replaceWith(trigger);
  const nativeDialog = document.createElement('dialog');
  nativeDialog.id = dialog.id;
  nativeDialog.setAttribute('role', 'dialog');
  nativeDialog.setAttribute('aria-label', 'Raw observations');
  vi.spyOn(nativeDialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));
  dialog.replaceWith(nativeDialog);
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  nativeDialog.setAttribute('open', '');
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(true);
  background.removeAttribute('inert');
  background.removeAttribute('aria-hidden');
  expect(hasAssociatedDataDialog(owner, trigger.id, trigger)).toBe(false);
  expect(isDataTriggerReachable(owner, trigger.id)).toBe(true);
  const duplicate = trigger.cloneNode(true);
  document.body.append(duplicate);
  expect(isDataTriggerReachable(owner, trigger.id)).toBe(false);
});
