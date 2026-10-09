import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
    api: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("Chat settings Behavior card", () => {
  test("Streaming UI explains that turning it off also stops reasoning auto-expand", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    const { ChatSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-chat-section"
    );
    const html = renderToStaticMarkup(createElement(ChatSection));
    expect(html).toContain("Streaming UI");
    expect(html).toContain(
      "When off, the turn appears all at once when it finishes, and the reasoning trace no longer expands on its own.",
    );
    expect(html).toContain("With Streaming UI off, Auto behaves like Manual.");
  });
});
