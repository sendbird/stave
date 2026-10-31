import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;
let restoreInitialAvailability: (() => void) | null = null;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext() {
  (globalThis as { window?: unknown }).window = {
    api: {},
    localStorage: createMemoryStorage(),
    location: { href: "https://stave.test/workspace" },
  } as unknown;
}

afterEach(() => {
  restoreInitialAvailability?.();
  restoreInitialAvailability = null;
  (globalThis as { window?: unknown }).window = originalWindow;
});

/**
 * Server rendering reads each store's initial snapshot, so a provider is "set
 * up" here by writing its availability and a ready probe into those snapshots.
 */
async function setUpOptionalProviders(ids: readonly ("cursor" | "kiro" | "opencode")[]) {
  const { useAppStore } = await import("@/store/app.store");
  const { useProviderReadinessStore } = await import("@/lib/providers/provider-readiness-store");
  const appInitial = useAppStore.getInitialState();
  const readinessInitial = useProviderReadinessStore.getInitialState();
  const previousAvailability = appInitial.providerAvailability;
  const previousReadiness = readinessInitial.providers;
  appInitial.providerAvailability = {
    ...previousAvailability,
    ...Object.fromEntries(ids.map((id) => [id, true])),
  };
  readinessInitial.providers = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        tool: {
          id,
          label: id,
          state: "ready",
          available: true,
          authState: id === "opencode" ? "not-required" : "authenticated",
          authDetail: null,
          summary: "",
          detail: "",
          version: null,
          executablePath: null,
        },
        configurationKey: "",
        checkedAt: 1,
        generation: 1,
        stale: false,
      },
    ]),
  );
  restoreInitialAvailability = () => {
    appInitial.providerAvailability = previousAvailability;
    readinessInitial.providers = previousReadiness;
  };
}

describe("Settings → Models → Selector Models", () => {
  test("offers Claude and Codex and explains what the default list holds back", async () => {
    setWindowContext();
    const { SettingsModelVisibilitySection } =
      await import("@/components/layout/settings-dialog-model-visibility");
    const html = renderToStaticMarkup(
      createElement(SettingsModelVisibilitySection),
    );

    expect(html).toContain("Selector Models");
    for (const providerLabel of ["Claude", "Codex"]) {
      expect(html).toContain(`>${providerLabel}</button>`);
    }
    // Providers that are not set up get no tab.
    for (const providerLabel of ["Cursor", "Kiro", "OpenCode"]) {
      expect(html).not.toContain(`>${providerLabel}</button>`);
    }
    // Hiding a model must never make it unreachable, so the card has to say
    // where the rest of the catalog still lives.
    expect(html).toContain("Show all models");
    expect(html).toContain("Reset all providers");
  });

  test("adds a tab for an optional provider once it is set up", async () => {
    setWindowContext();
    await setUpOptionalProviders(["cursor"]);
    const { SettingsModelVisibilitySection } =
      await import("@/components/layout/settings-dialog-model-visibility");
    const html = renderToStaticMarkup(
      createElement(SettingsModelVisibilitySection),
    );

    expect(html).toContain(">Cursor</button>");
    expect(html).not.toContain(">Kiro</button>");
  });

  test("lists one switchable row per Claude selector row, not per context variant", async () => {
    setWindowContext();
    const { useAppStore } = await import("@/store/app.store");
    // Server rendering reads the initial snapshot rather than current state.
    const initialState = useAppStore.getInitialState();
    const previous = initialState.providerAvailability;
    initialState.providerAvailability = { ...previous, "claude-code": true };
    restoreInitialAvailability = () => { initialState.providerAvailability = previous; };
    const { SettingsModelVisibilitySection } =
      await import("@/components/layout/settings-dialog-model-visibility");
    const html = renderToStaticMarkup(
      createElement(SettingsModelVisibilitySection),
    );

    expect(html).toContain('data-model-visibility-row="claude-sonnet-5-5"');
    expect(html).not.toContain(
      'data-model-visibility-row="claude-sonnet-5-5[1m]',
    );
    expect(html).toContain("Show Claude Sonnet 5.5 in the model selector");
    expect(html).toContain('data-model-visibility-row="claude-haiku-5-5"');
    expect(html).toContain("Show Claude Haiku 5.5 in the model selector");
    expect(html).not.toContain('data-model-visibility-row="claude-haiku-4-5"');
  });
});
