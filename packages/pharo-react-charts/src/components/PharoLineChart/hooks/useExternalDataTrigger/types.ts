/** Instance-owned DOM association needed before replacing inline data access. */
export interface UseExternalDataTriggerOptions {
  /** Mounted chart figure supplies the correct owner document. */
  readonly owner: HTMLElement | null;
  /** Nonblank external trigger ID, or undefined for inline mode. */
  readonly triggerId: string | undefined;
}
