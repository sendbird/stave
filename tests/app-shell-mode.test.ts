import { describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { useAppStore } from "@/store/app.store";
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
  test("defaults the sidebar to the Projects view", () => {
    const settings = useAppStore.getInitialState().settings;

    expect(settings.sidebarShowFleetView).toBe(true);
    expect(settings.sidebarNavView).toBe("projects");
  });

  test("normalizes sidebar view updates and keeps the last choice", () => {
    (
      useAppStore as typeof useAppStore & {
        persist?: {
          setOptions: (options: { storage: typeof noopStorage }) => void;
        };
      }
    ).persist?.setOptions({ storage: noopStorage });

    // The header toggle and the settings row write this same key, so switching
    // views IS the preference change — the sidebar reopens where you left it.
    useAppStore.getState().updateSettings({
      patch: { sidebarNavView: "work-queue" },
    });
    expect(useAppStore.getState().settings.sidebarNavView).toBe("work-queue");

    useAppStore.getState().updateSettings({
      patch: { sidebarNavView: "tree" as never },
    });
    expect(useAppStore.getState().settings.sidebarNavView).toBe("projects");
  });
});

describe("turn activity settings", () => {
  test("defaults to docked and normalizes invalid placement updates", () => {
    const settings = useAppStore.getInitialState().settings;

    expect(settings.turnActivityPlacement).toBe("docked");

    useAppStore.getState().updateSettings({
      patch: { turnActivityPlacement: "floating" },
    });
    expect(useAppStore.getState().settings.turnActivityPlacement).toBe(
      "floating",
    );

    useAppStore.getState().updateSettings({
      patch: { turnActivityPlacement: "invalid" as never },
    });
    expect(useAppStore.getState().settings.turnActivityPlacement).toBe(
      "docked",
    );
  });
});

describe("composer layout settings", () => {
  test("ships framed and falls back to framed for unknown values", () => {
    expect(useAppStore.getInitialState().settings.composerLayout).toBe(
      "framed",
    );

    useAppStore.getState().updateSettings({
      patch: { composerLayout: "classic" },
    });
    expect(useAppStore.getState().settings.composerLayout).toBe("classic");

    useAppStore.getState().updateSettings({
      patch: { composerLayout: "wide" as never },
    });
    expect(useAppStore.getState().settings.composerLayout).toBe("framed");
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
