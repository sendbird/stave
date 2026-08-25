import { afterEach, describe, expect, test } from "bun:test";

/**
 * zustand's default persist storage resolves `window.localStorage` ONCE, when the
 * store module is first imported. The defect this guards against only appears when
 * a `window` WITHOUT `localStorage` is already installed at that moment: the default
 * resolver then returns undefined without throwing, `createJSONStorage` builds a
 * persistStorage around it anyway, and the first write calls `undefined.setItem`.
 * So the hostile global has to be in place before the dynamic import below — a test
 * that swaps it inside the test body cannot reproduce the failure.
 *
 * That also means this file only bites while it is the FIRST file in the process to
 * import the store: once `standalone-cli-store.test.ts` has imported it, the module
 * is cached and the dynamic import below re-uses the already-resolved storage. The
 * current filenames sort this file first; renaming either file so it sorts after
 * `standalone-cli-store.test.ts` would silently neuter this guard.
 */
describe("standalone cli persist storage resilience", () => {
  const globalWithWindow = globalThis as { window?: unknown };
  const previousWindow = globalWithWindow.window;

  afterEach(() => {
    if (previousWindow === undefined) {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = previousWindow;
    }
  });

  test("mutating state does not throw when window has no localStorage", async () => {
    globalWithWindow.window = { api: {} };

    const { useStandaloneCliStore } = await import(
      "../src/store/standalone-cli.store"
    );

    expect(() => {
      useStandaloneCliStore.getState().toggleOverlay();
    }).not.toThrow();
    expect(useStandaloneCliStore.getState().open).toBe(true);
    useStandaloneCliStore.getState().reset();
  });
});
