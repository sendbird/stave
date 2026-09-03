import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;

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
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("Settings → Models → Selector Models", () => {
  test("offers every provider and explains what the default list holds back", async () => {
    setWindowContext();
    const { SettingsModelVisibilitySection } =
      await import("@/components/layout/settings-dialog-model-visibility");
    const html = renderToStaticMarkup(
      createElement(SettingsModelVisibilitySection),
    );

    expect(html).toContain("Selector Models");
    for (const providerLabel of ["Claude", "Codex", "Cursor", "Kiro"]) {
      expect(html).toContain(`>${providerLabel}</button>`);
    }
    // Hiding a model must never make it unreachable, so the card has to say
    // where the rest of the catalog still lives.
    expect(html).toContain("Show all models");
    expect(html).toContain("Reset all providers");
  });

  test("lists one switchable row per Claude selector row, not per context variant", async () => {
    setWindowContext();
    const { SettingsModelVisibilitySection } =
      await import("@/components/layout/settings-dialog-model-visibility");
    const html = renderToStaticMarkup(
      createElement(SettingsModelVisibilitySection),
    );

    expect(html).toContain('data-model-visibility-row="claude-sonnet-5"');
    expect(html).not.toContain(
      'data-model-visibility-row="claude-sonnet-5[1m]',
    );
    expect(html).toContain("Show Claude Sonnet 5 in the model selector");
    expect(html).toContain('data-model-visibility-row="claude-haiku-4-5"');
    expect(html).toContain("Show Claude Haiku 4.5 in the model selector");
  });
});
