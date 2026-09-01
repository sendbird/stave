import type { LensSessionCloseReason } from "./lens.types";

/**
 * What the renderer should do when a Lens session ends.
 *
 * One event, `lens:session-closed`, carries three different situations, and the
 * renderer used to treat them alike: it dropped the tab every time. That is
 * right for exactly one of them.
 *
 * - `"closed"` — a deliberate teardown. The tab goes with it.
 * - `"guest-gone"` — the page died on its own, under a tab the user still has
 *   open. Dropping the tab makes a crash look like a Lens pane that silently
 *   vanished, and it also races the panel's own rebuild, which is why the
 *   bounded recovery budget and its "Lens keeps closing" message were
 *   unreachable in the one case they were written for.
 * - `"evicted"` — reclaimed by the hidden-guest cap. Also rebuildable, but not
 *   immediately: rebuilding a session nobody is looking at puts it straight back
 *   over the cap and evicts a different one, indefinitely.
 *
 * Split out as pure functions because the two decisions are made in different
 * modules — the tab lives at the app root, the rebuild lives in the panel — and
 * they have to stay consistent with each other.
 */

/**
 * Whether the tab should be removed. `undefined` covers payloads from builds
 * that predate the reason field, which only ever emitted the deliberate case.
 */
export function shouldCloseLensTabOnSessionClose(
  reason?: LensSessionCloseReason,
): boolean {
  return reason === undefined || reason === "closed";
}

export type LensSessionCloseRecovery =
  /** The tab is going away too; there is nothing to restore onto. */
  | "none"
  /** Rebuild through the bounded recovery budget. */
  | "rebuild-now"
  /** Rebuild the next time this panel is actually presented. */
  | "rebuild-when-presented";

export function resolveLensSessionCloseRecovery(args: {
  reason?: LensSessionCloseReason;
  isPresented: boolean;
}): LensSessionCloseRecovery {
  const { reason, isPresented } = args;
  if (shouldCloseLensTabOnSessionClose(reason)) {
    return "none";
  }
  if (reason === "evicted" && !isPresented) {
    return "rebuild-when-presented";
  }
  return "rebuild-now";
}
