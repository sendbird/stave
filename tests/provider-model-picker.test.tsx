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
    const html = renderToStaticMarkup(
      createElement(ProviderModelPicker, {
        selectedProvider: "codex",
        selectedModel: "gpt-5.4",
        onProviderChange: () => {},
        onModelChange: () => {},
      }),
    );

    expect(html).toContain("flex w-full");
    expect(html).toContain("w-[150px] shrink-0");
    expect(html).toContain("min-w-0 flex-1");
  });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});
