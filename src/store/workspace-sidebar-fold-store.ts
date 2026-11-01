import { create } from "zustand";
import {
  isNarrowWindowForWorkspaceSidebar,
  planWorkspaceSidebarCollapse,
  resolveWorkspaceSidebarCollapsed,
} from "@/store/layout.utils";
import { useAppStore } from "@/store/app.store";

/**
 * The repository sidebar's automatic fold in a narrow window. Session state
 * only: the saved layout keeps the user's own choice for wide windows, and a
 * narrow window's "open it anyway" lasts until the window crosses the width.
 */
interface WorkspaceSidebarFoldState {
  narrowWindow: boolean;
  openedInNarrowWindow: boolean;
  setNarrowWindow: (narrowWindow: boolean) => void;
}

export const useWorkspaceSidebarFoldStore = create<WorkspaceSidebarFoldState>((set) => ({
  narrowWindow:
    typeof window === "undefined"
      ? false
      : isNarrowWindowForWorkspaceSidebar(window.innerWidth),
  openedInNarrowWindow: false,
  setNarrowWindow: (narrowWindow) =>
    set((state) =>
      state.narrowWindow === narrowWindow
        ? state
        : { narrowWindow, openedInNarrowWindow: false },
    ),
}));

/** Whether the sidebar shows as its rail right now. */
export function useWorkspaceSidebarCollapsed(): boolean {
  const savedCollapsed = useAppStore((state) => state.layout.workspaceSidebarCollapsed);
  const narrowWindow = useWorkspaceSidebarFoldStore((state) => state.narrowWindow);
  const openedInNarrowWindow = useWorkspaceSidebarFoldStore((state) => state.openedInNarrowWindow);
  return resolveWorkspaceSidebarCollapsed({ savedCollapsed, narrowWindow, openedInNarrowWindow });
}

/** The same answer outside React (keybindings, command handlers). */
export function readWorkspaceSidebarCollapsed(): boolean {
  const fold = useWorkspaceSidebarFoldStore.getState();
  return resolveWorkspaceSidebarCollapsed({
    savedCollapsed: useAppStore.getState().layout.workspaceSidebarCollapsed,
    narrowWindow: fold.narrowWindow,
    openedInNarrowWindow: fold.openedInNarrowWindow,
  });
}

/** Folds or opens the sidebar, keeping a narrow window's choice for the session. */
export function setWorkspaceSidebarCollapsed(collapsed: boolean): void {
  const app = useAppStore.getState();
  const fold = useWorkspaceSidebarFoldStore.getState();
  const plan = planWorkspaceSidebarCollapse({
    collapsed,
    narrowWindow: fold.narrowWindow,
    savedCollapsed: app.layout.workspaceSidebarCollapsed,
  });
  if (plan.savedCollapsed !== app.layout.workspaceSidebarCollapsed) {
    app.setLayout({ patch: { workspaceSidebarCollapsed: plan.savedCollapsed } });
  }
  if (plan.openedInNarrowWindow !== fold.openedInNarrowWindow) {
    useWorkspaceSidebarFoldStore.setState({ openedInNarrowWindow: plan.openedInNarrowWindow });
  }
}

export function toggleWorkspaceSidebarCollapsed(): void {
  setWorkspaceSidebarCollapsed(!readWorkspaceSidebarCollapsed());
}
