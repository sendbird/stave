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
 * 3. A guest is revealed by a panel, so only a mounted panel may keep one
 *    revealed. Sessions share ids across workspaces (every agent-driven
 *    session is `default`), and a panel that is torn down without parking —
 *    or that briefly addresses another workspace's session of the same id —
 *    would otherwise leave a page presented that nothing on screen owns. The
 *    presenter registry below is the record of which sessions have a panel.
 */

export function shouldParkLensGuestForWorkspace(args: {
  guestWorkspaceId: string;
  activeWorkspaceId: string | null;
  presented: boolean;
  /** Whether a mounted panel currently claims this guest. */
  hasPresenter: boolean;
}): boolean {
  if (!args.presented) {
    return false;
  }
  return args.guestWorkspaceId !== args.activeWorkspaceId || !args.hasPresenter;
}

export type LensGuestPresenterRegistry = {
  /**
   * Record that a panel now presents the guest under `key`. Returns a release
   * that reports whether this claim was still the live one: a later claim for
   * the same key supersedes an earlier one, and the earlier release must then
   * not park what the newer panel is showing.
   */
  claim(key: string): () => boolean;
  has(key: string): boolean;
};

/**
 * Which guests have a mounted panel behind them, by guest key.
 *
 * Pure bookkeeping so the rule can be tested without a document: the host
 * consults it before honouring any `presented: true`, and parks whatever loses
 * its claim.
 */
export function createLensGuestPresenterRegistry(): LensGuestPresenterRegistry {
  const claims = new Map<string, symbol>();
  return {
    claim(key) {
      const token = Symbol(key);
      claims.set(key, token);
      return () => {
        if (claims.get(key) !== token) {
          return false;
        }
        claims.delete(key);
        return true;
      };
    },
    has(key) {
      return claims.has(key);
    },
  };
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
