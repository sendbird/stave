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
    location: {
      href: "https://stave.test/workspace",
    },
  } as unknown;
}

describe("ProviderModelPicker", () => {
  test("renders fixed-width provider and full-width model triggers", async () => {
    setWindowContext();
    const { ProviderModelPicker } = await import(
      "@/components/session/ProviderModelPicker"
    );
    const { sx } = await import("@/components/ads/utils/stylex");
    const { providerModelPickerStyles } = await import(
      "@/components/session/provider-model-picker.styles"
    );
    const html = renderToStaticMarkup(
      createElement(ProviderModelPicker, {
        selectedProvider: "codex",
        selectedModel: "gpt-5.4",
        onProviderChange: () => {},
        onModelChange: () => {},
      }),
    );

    // Both triggers keep their accessible names and DOM presence.
    expect(html).toContain('aria-label="Model provider"');
    expect(html).toContain('aria-label="Model model"');
    // Fixed-width provider trigger and full-width model trigger are distinct
    // StyleX styles; assert the compiled classes both appear rather than the
    // Tailwind strings the migration removed.
    expect(html).toContain(sx(providerModelPickerStyles.providerTriggerWidth));
    expect(html).toContain(sx(providerModelPickerStyles.modelTriggerWidth));
  });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});
