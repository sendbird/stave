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
});
