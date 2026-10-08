/** Ambiguous DOM IDs cannot establish an accessible control relationship. */
function resolveUniqueElement(document: Document, id: string): HTMLElement | undefined {
  if (!id.trim()) return undefined;
  const element = document.getElementById(id);
  if (!element) return undefined;
  const matches = [...document.querySelectorAll('[id]')].filter((item) => item.id === id);
  return matches.length === 1 ? element : undefined;
}

function hasName(element: HTMLElement, allowContents = true): boolean {
  const namedBy = element
    .getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
  return Boolean(
    (
      namedBy ||
      element.getAttribute('aria-label') ||
      (allowContents ? element.textContent : '')
    )?.trim(),
  );
}

/** Modal background masking may be waived; visual hiding may never be waived. */
function isVisiblyPresent(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected || element.closest('[hidden]')) return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = view.getComputedStyle(ancestor);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    )
      return false;
  }
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0;
}

/** Resolve a usable control before checking ordinary or active-modal reachability. */
export function resolveDataTrigger(owner: HTMLElement, triggerId: string): HTMLElement | undefined {
  if (!owner.isConnected) return undefined;
  const trigger = resolveUniqueElement(owner.ownerDocument, triggerId);
  if (
    !trigger ||
    trigger.tabIndex < 0 ||
    !trigger.matches('button, a[href], [role="button"]') ||
    trigger.matches(':disabled, [aria-disabled="true"]') ||
    !hasName(trigger) ||
    !isVisiblyPresent(trigger)
  )
    return undefined;
  return trigger;
}

/** Resolve only a named, enabled and visibly keyboard-reachable data trigger. */
export function isDataTriggerReachable(owner: HTMLElement, triggerId: string): boolean {
  const trigger = resolveDataTrigger(owner, triggerId);
  return Boolean(trigger && !trigger.closest('[inert], [aria-hidden="true"]'));
}

/** Preserve an established native button only while its real modal masks the chart. */
export function hasAssociatedDataDialog(
  owner: HTMLElement,
  triggerId: string,
  previouslyReachableButton: HTMLElement | undefined,
): boolean {
  const trigger = resolveDataTrigger(owner, triggerId);
  if (
    !trigger ||
    trigger !== previouslyReachableButton ||
    trigger.tagName !== 'BUTTON' ||
    trigger.getAttribute('aria-expanded') !== 'true'
  )
    return false;
  const controlledIds = trigger.getAttribute('aria-controls')?.trim().split(/\s+/);
  const dialogId = controlledIds?.length === 1 ? controlledIds[0] : undefined;
  const dialog = dialogId ? resolveUniqueElement(owner.ownerDocument, dialogId) : undefined;
  if (
    !dialog ||
    !dialog.matches('[role="dialog"], dialog[open]') ||
    (dialog.tagName === 'DIALOG' && !dialog.hasAttribute('open')) ||
    dialog.closest('[inert], [aria-hidden="true"]') ||
    !hasName(dialog, false) ||
    !isVisiblyPresent(dialog)
  )
    return false;
  let hasBackgroundMask = false;
  for (let ancestor: HTMLElement | null = trigger; ancestor; ancestor = ancestor.parentElement) {
    if (!ancestor.matches('[inert], [aria-hidden="true"]')) continue;
    if (ancestor === trigger || !ancestor.contains(owner) || ancestor.contains(dialog))
      return false;
    hasBackgroundMask = true;
  }
  return hasBackgroundMask;
}
