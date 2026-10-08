/** Resolve only a named, enabled and visibly keyboard-reachable data trigger. */
export function isDataTriggerReachable(owner: HTMLElement, triggerId: string): boolean {
  if (!triggerId.trim()) return false;
  const document = owner.ownerDocument;
  const trigger = document.getElementById(triggerId);
  const view = document.defaultView;
  if (
    !trigger ||
    !view ||
    !trigger.isConnected ||
    trigger.tabIndex < 0 ||
    !trigger.matches('button, a[href], [role="button"]') ||
    trigger.matches(':disabled, [aria-disabled="true"]') ||
    trigger.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  const namedBy = trigger
    .getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  const name = namedBy || trigger.getAttribute('aria-label') || trigger.textContent;
  if (!name?.trim()) return false;
  const style = view.getComputedStyle(trigger);
  const bounds = trigger.getBoundingClientRect();
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}
