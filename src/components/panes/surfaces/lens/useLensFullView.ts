import type { IDockviewPanelProps } from "dockview-react";
import { useMemo, useSyncExternalStore } from "react";
import {
  decodeLensFullViewState,
  encodeLensFullViewState,
  resolveLensFullViewState,
  type LensFullViewState,
} from "@/lib/lens/lens-full-view";

export type LensFullViewHandle = LensFullViewState & {
  toggle: () => void;
};

type Disposable = { dispose: () => void };
type Subscribe = (listener: () => void) => Disposable;

/** The slice of a Dockview panel API that full view reads and drives. */
export type LensFullViewPanelApi = {
  readonly location: { type: string };
  isMaximized: () => boolean;
  maximize: () => void;
  exitMaximized: () => void;
  setActive: () => void;
  onDidLocationChange: Subscribe;
  onDidGroupChange: Subscribe;
};

/** The slice of a Dockview container API that full view reads. */
export type LensFullViewContainerApi = {
  readonly groups: ReadonlyArray<{ api: { location: { type: string } } }>;
  onDidMaximizedGroupChange: Subscribe;
  onDidLayoutChange: Subscribe;
  onDidAddGroup: Subscribe;
  onDidRemoveGroup: Subscribe;
};

export type LensFullViewSource = {
  subscribe: (onChange: () => void) => () => void;
  /** A primitive key, so the store compares snapshots by value. */
  getSnapshot: () => string;
  toggle: () => void;
};

/**
 * Full view as an external store over the pane host's own maximize.
 *
 * Kept outside React so the subscription and toggle rules can be tested
 * against a fake host. Every layout event that can change the answer is
 * subscribed, because maximize is also left by the host itself: adding or
 * moving a pane exits it without going through `toggle`.
 */
export function createLensFullViewSource(
  panelApi: LensFullViewPanelApi,
  containerApi: LensFullViewContainerApi,
): LensFullViewSource {
  const getSnapshot = () =>
    encodeLensFullViewState(
      resolveLensFullViewState({
        location: panelApi.location.type,
        isMaximized: panelApi.isMaximized(),
        gridGroupCount: containerApi.groups.filter(
          (group) => group.api.location.type === "grid",
        ).length,
      }),
    );

  return {
    subscribe: (onChange) => {
      const disposables = [
        containerApi.onDidMaximizedGroupChange(onChange),
        containerApi.onDidLayoutChange(onChange),
        containerApi.onDidAddGroup(onChange),
        containerApi.onDidRemoveGroup(onChange),
        panelApi.onDidLocationChange(onChange),
        panelApi.onDidGroupChange(onChange),
      ];
      return () => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      };
    },
    getSnapshot,
    toggle: () => {
      if (panelApi.isMaximized()) {
        panelApi.exitMaximized();
        return;
      }
      if (!decodeLensFullViewState(getSnapshot()).available) {
        return;
      }
      panelApi.setActive();
      panelApi.maximize();
    },
  };
}

/**
 * Full view for one Lens pane, backed by the pane host's own maximize.
 *
 * Maximizing the group rather than painting an overlay keeps the page where it
 * already lives: the guest keeps tracking the same placeholder, other panes are
 * hidden by the layout and park their guests the usual way, and any layout
 * change that adds or moves a pane leaves full view on its own.
 */
export function useLensFullView(args: {
  panelApi: IDockviewPanelProps["api"];
  containerApi: IDockviewPanelProps["containerApi"];
}): LensFullViewHandle {
  const { panelApi, containerApi } = args;
  const source = useMemo(
    () => createLensFullViewSource(panelApi, containerApi),
    [containerApi, panelApi],
  );
  const key = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return useMemo(
    () => ({ ...decodeLensFullViewState(key), toggle: source.toggle }),
    [key, source],
  );
}
