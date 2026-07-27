import { describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN,
  useAppStore,
} from "@/store/app.store";
import {
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  normalizeLayoutState,
} from "@/store/layout.utils";

const noopStorage = createJSONStorage(() => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}));

describe("layout settings", () => {
  test("strips unknown layout fields during normalization", () => {
    const initialLayout = useAppStore.getInitialState().layout;
    const normalized = normalizeLayoutState({
      ...initialLayout,
      unexpectedFlag: true,
    } as typeof initialLayout & { unexpectedFlag: boolean });

    expect("unexpectedFlag" in normalized).toBe(false);
  });

  test("defaults workspace sidebar items to expanded mode", () => {
    expect(
      useAppStore.getInitialState().layout.workspaceSidebarItemDisplayMode,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE);
  });

  test("normalizes invalid workspace sidebar item display mode", () => {
    const initialLayout = useAppStore.getInitialState().layout;
    const normalized = normalizeLayoutState({
      ...initialLayout,
      workspaceSidebarItemDisplayMode: "wide" as never,
    });

    expect(normalized.workspaceSidebarItemDisplayMode).toBe("expanded");
  });
});

describe("sidebar settings", () => {
  test("defaults sidebar navigation controls to the existing visible state", () => {
    const settings = useAppStore.getInitialState().settings;

    expect(settings.sidebarShowFleetView).toBe(true);
    expect(settings.sidebarShowActiveWorkspaces).toBe(true);
    expect(settings.sidebarActiveWorkspaceLimit).toBe(
      DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT,
    );
  });

  test("normalizes sidebar active workspace row limit updates", () => {
    (
      useAppStore as typeof useAppStore & {
        persist?: {
          setOptions: (options: { storage: typeof noopStorage }) => void;
        };
      }
    ).persist?.setOptions({ storage: noopStorage });

    useAppStore.getState().updateSettings({
      patch: {
        sidebarActiveWorkspaceLimit: SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX + 10,
      },
    });
    expect(useAppStore.getState().settings.sidebarActiveWorkspaceLimit).toBe(
      SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
    );

    useAppStore.getState().updateSettings({
      patch: {
        sidebarActiveWorkspaceLimit: SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN - 10,
      },
    });
    expect(useAppStore.getState().settings.sidebarActiveWorkspaceLimit).toBe(
      SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN,
    );
  });
});

describe("lens session scope settings", () => {
  test("defaults to project scope and normalizes invalid updates", () => {
    (
      useAppStore as typeof useAppStore & {
        persist?: {
          setOptions: (options: { storage: typeof noopStorage }) => void;
        };
      }
    ).persist?.setOptions({ storage: noopStorage });

    expect(useAppStore.getInitialState().settings.lensSessionScope).toBe(
      "project",
    );

    useAppStore.getState().updateSettings({
      patch: {
        lensSessionScope: "workspace",
      },
    });

    expect(useAppStore.getState().settings.lensSessionScope).toBe("workspace");

    useAppStore.getState().updateSettings({
      patch: {
        lensSessionScope: "invalid" as never,
      },
    });

    expect(useAppStore.getState().settings.lensSessionScope).toBe("project");
  });

  test("defaults agent activity to a visible split and normalizes updates", () => {
    expect(
      useAppStore.getInitialState().settings.lensAgentPresentationMode,
    ).toBe("split-right");

    useAppStore.getState().updateSettings({
      patch: {
        lensAgentPresentationMode: "background-tab",
      },
    });
    expect(
      useAppStore.getState().settings.lensAgentPresentationMode,
    ).toBe("background-tab");

    useAppStore.getState().updateSettings({
      patch: {
        lensAgentPresentationMode: "invalid" as never,
      },
    });
    expect(
      useAppStore.getState().settings.lensAgentPresentationMode,
    ).toBe("split-right");
  });
});
