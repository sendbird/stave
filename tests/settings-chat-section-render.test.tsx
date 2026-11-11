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

describe("Chat settings Layout card", () => {
  test("offers the conversation width as Narrow, Default and Wide, with Default selected", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    const { ChatSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-chat-section"
    );
    // Each radio's checked state and its own text, read from the radio to the next one.
    const widthChoices = () => {
      const html = renderToStaticMarkup(createElement(ChatSection));
      return html.split('role="radio"').slice(1).map((chunk) => ({
        checked: /^[^>]*aria-checked="true"/.test(chunk),
        label: chunk.replace(/<[^>]+>/g, " ").replace(/^[^>]*>/, "").trim().split(/\s+/)[0],
      })).filter((choice) => ["Narrow", "Default", "Wide"].includes(choice.label));
    };
    expect(renderToStaticMarkup(createElement(ChatSection))).toContain("Conversation width");
    expect(widthChoices()).toEqual([
      { checked: false, label: "Narrow" },
      { checked: true, label: "Default" },
      { checked: false, label: "Wide" },
    ]);
    // The chosen width's effect on the column is measured in `tests/e2e/transcript-width.e2e.ts`.
  });
});

describe("conversation width setting", () => {
  test("defaults to Default and reads only the three known values", async () => {
    const { defaultSettings, normalizeConversationWidth } = await import("../src/store/app-settings");
    expect(defaultSettings.conversationWidth).toBe("default");
    expect(normalizeConversationWidth("narrow")).toBe("narrow");
    expect(normalizeConversationWidth("wide")).toBe("wide");
    for (const value of ["full", "", null, undefined, 3]) expect(normalizeConversationWidth(value)).toBe("default");
  });
});
