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
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function renderMentions() {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  const { MentionsSection } = await import(
    "../src/components/layout/settings-sections/settings-dialog-mentions-section"
  );
  return renderToStaticMarkup(createElement(MentionsSection));
}

describe("Mentions settings section", () => {
  test("keeps the browser access controls without the @ reference card", async () => {
    const html = await renderMentions();
    expect(html).toContain("When the agent may use Chrome");
    // The reference list had no control of its own; the composer's @ menu covers it.
    expect(html).not.toContain("Prompt mentions");
    expect(html).not.toContain("settings-field-prompt-mentions");
    expect(html).not.toContain("@info:notes");
    expect(html).not.toContain("Lens settings");
  });

  test("defaults the browser mode to Lens first", async () => {
    // The auto-arm switch only renders in the Lens first mode.
    expect(await renderMentions()).toContain("Connect Chrome in advance for listed hosts");
  });
});

describe("Providers settings after Browser access moved", () => {
  test("no longer renders the browser access card", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    const { ProvidersSection } = await import(
      "../src/components/layout/settings-dialog-providers-section"
    );
    const html = renderToStaticMarkup(createElement(ProvidersSection, {}));
    expect(html).not.toContain("settings-field-browser-access");
  });
});
