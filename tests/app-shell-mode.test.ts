import { describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { useAppStore } from "@/store/app.store";
import { normalizeLayoutState } from "@/store/layout.utils";

const noopStorage = createJSONStorage(() => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}));

describe("app shell mode settings", () => {
  test("defaults to Stave mode and switches through settings", () => {
    expect(useAppStore.getInitialState().settings.appShellMode).toBe("stave");
    (
      useAppStore as typeof useAppStore & {
        persist: {
          setOptions: (options: { storage: typeof noopStorage }) => void;
        };
      }
    ).persist.setOptions({ storage: noopStorage });

    useAppStore.getState().updateSettings({
      patch: {
        appShellMode: "zen",
      },
    });

    expect(useAppStore.getState().settings.appShellMode).toBe("zen");

    useAppStore.getState().updateSettings({
      patch: {
        appShellMode: "stave",
      },
    });

    expect(useAppStore.getState().settings.appShellMode).toBe("stave");
  });

  test("strips the legacy layout zen flag during normalization", () => {
    const initialLayout = useAppStore.getInitialState().layout;
    const normalized = normalizeLayoutState({
      ...initialLayout,
      zenMode: true,
    } as typeof initialLayout & { zenMode: boolean });

    expect("zenMode" in normalized).toBe(false);
  });
});
