/**
 * Pointer and workspace rules for a hoisted Lens guest.
 *
 * The guest is a `<webview>` in a window-sized surface root, not a child of
 * the pane. Two consequences follow:
 *
 * 1. A page shown for workspace A stays in the document when the user switches
 *    to workspace B. Parking has to happen at the workspace change, not when
 *    the old panel finally unmounts — otherwise the previous page floats over
 *    the new workspace like a leftover attachment.
 * 2. Native guest hits never reach the host. A sash drag that starts on the
 *    splitter and then crosses the page loses `pointerup` in the guest, so the
 *    pane stays in resize mode. Host-initiated drags therefore make every
 *    guest ignore pointers until the drag ends.
 */

export function shouldParkLensGuestForWorkspace(args: {
  guestWorkspaceId: string;
  activeWorkspaceId: string | null;
  presented: boolean;
}): boolean {
  return args.presented && args.guestWorkspaceId !== args.activeWorkspaceId;
}

/**
 * Whether a host event landed on a Lens guest page or its over-the-page chrome.
 *
 * Structural on purpose so the rule can be tested without constructing a real
 * `<webview>`. The live hook passes `event.target`.
 */
export function isLensGuestPointerTarget(
  target: {
    tagName?: string;
    closest?: (selector: string) => unknown;
  } | null,
): boolean {
  if (!target) {
    return false;
  }
  if (target.tagName?.toUpperCase() === "WEBVIEW") {
    return true;
  }
  return Boolean(
    target.closest?.("webview") || target.closest?.("[data-lens-guest-chrome]"),
  );
}

export type LensGuestPointerPassthroughTracker = {
  acquire(pointerId: number): void;
  release(pointerId: number): void;
  reset(): void;
};

/**
 * Track every host pointer that requires Lens guests to ignore hit-testing.
 *
 * Pointer ids are acquisition tokens. Passthrough ends only after the last
 * token is released, so an unrelated pointerup cannot expose the guest while
 * another sash, sidebar, or tab drag is still active.
 */
export function createLensGuestPointerPassthroughTracker(
  onActiveChange: (active: boolean) => void,
): LensGuestPointerPassthroughTracker {
  const activePointerIds = new Set<number>();

  const publishIfChanged = (wasActive: boolean) => {
    const isActive = activePointerIds.size > 0;
    if (isActive !== wasActive) {
      onActiveChange(isActive);
    }
  };

  return {
    acquire(pointerId) {
      const wasActive = activePointerIds.size > 0;
      activePointerIds.add(pointerId);
      publishIfChanged(wasActive);
    },
    release(pointerId) {
      const wasActive = activePointerIds.size > 0;
      activePointerIds.delete(pointerId);
      publishIfChanged(wasActive);
    },
    reset() {
      const wasActive = activePointerIds.size > 0;
      activePointerIds.clear();
      publishIfChanged(wasActive);
    },
  };
}
