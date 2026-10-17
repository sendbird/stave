import type { DockviewPanelApi } from "dockview-react";
import { useEffect, useState } from "react";

/**
 * How long an editor panel stays mounted after Dockview hides it.
 *
 * Editor panels use Dockview's default `onlyWhenVisible` renderer, which only
 * detaches the panel DOM: the React portal, and with it the Monaco editor,
 * stays alive. Unmounting Monaco while hidden releases the editor widget (DOM,
 * view model, decorations, diff computation) for every background tab. The
 * delay keeps quick back-and-forth tab switches and transient visibility
 * flips (drag, re-layout) from tearing the editor down and rebuilding it.
 */
export const EDITOR_HIDDEN_UNMOUNT_DELAY_MS = 1500;

export interface PanelMountGateTimers {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultTimers: PanelMountGateTimers = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Turns panel visibility into "should the editor be mounted": showing mounts
 * immediately, hiding unmounts only after `hideDelayMs` without being shown
 * again. `onChange` fires only when the mounted state actually flips.
 */
export function createPanelMountGate(args: {
  initiallyVisible: boolean;
  hideDelayMs?: number;
  onChange: (mounted: boolean) => void;
  timers?: PanelMountGateTimers;
}) {
  const hideDelayMs = args.hideDelayMs ?? EDITOR_HIDDEN_UNMOUNT_DELAY_MS;
  const timers = args.timers ?? defaultTimers;
  let mounted = args.initiallyVisible;
  let hideTimer: unknown = null;
  let disposed = false;

  const cancelHide = () => {
    if (hideTimer !== null) {
      timers.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  return {
    isMounted: () => mounted,
    setVisible: (isVisible: boolean) => {
      if (disposed) {
        return;
      }
      if (isVisible) {
        cancelHide();
        if (!mounted) {
          mounted = true;
          args.onChange(true);
        }
        return;
      }
      if (!mounted || hideTimer !== null) {
        return;
      }
      hideTimer = timers.setTimeout(() => {
        hideTimer = null;
        if (disposed || !mounted) {
          return;
        }
        mounted = false;
        args.onChange(false);
      }, hideDelayMs);
    },
    dispose: () => {
      disposed = true;
      cancelHide();
    },
  };
}

/**
 * Whether a Dockview editor panel should keep its Monaco editor mounted.
 * A panel that starts hidden (restored background tab) mounts nothing until
 * it is first shown.
 */
export function useEditorPanelMountGate(
  panelApi: Pick<DockviewPanelApi, "isVisible" | "onDidVisibilityChange">,
) {
  const [mounted, setMounted] = useState(panelApi.isVisible);

  useEffect(() => {
    const gate = createPanelMountGate({
      initiallyVisible: panelApi.isVisible,
      onChange: setMounted,
    });
    setMounted(gate.isMounted());
    const visibilityDisposable = panelApi.onDidVisibilityChange((event) => {
      gate.setVisible(event.isVisible);
    });
    return () => {
      visibilityDisposable.dispose();
      gate.dispose();
    };
  }, [panelApi]);

  return mounted;
}
