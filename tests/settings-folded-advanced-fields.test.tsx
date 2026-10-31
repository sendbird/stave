import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";

/**
 * Expert or rarely changed fields sit in a collapsed Advanced disclosure in
 * their card. ADS mounts accordion panels eagerly, so a folded field stays in
 * the DOM (its saved value still applies) inside a `hidden` region.
 */

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

async function render(component: ComponentType) {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  return renderToStaticMarkup(
    createElement(TooltipProvider, null, createElement(component)),
  );
}

/**
 * The disclosure whose trigger carries `description` starts closed, and each
 * of `fields` renders inside its hidden panel, before `endMarker`.
 */
function expectFoldedClosed(
  html: string,
  args: { description: string; fields: string[]; endMarker?: string },
) {
  const anchor = html.indexOf(args.description);
  expect(anchor).toBeGreaterThan(-1);
  const trigger = html.slice(html.lastIndexOf("<button", anchor), anchor);
  expect(trigger).toContain('aria-expanded="false"');
  const regionAt = html.indexOf('role="region"', anchor);
  expect(regionAt).toBeGreaterThan(anchor);
  expect(html.slice(html.lastIndexOf("<div", regionAt), regionAt)).toContain(
    'hidden=""',
  );
  const end = args.endMarker ? html.indexOf(args.endMarker, regionAt) : html.length;
  expect(end).toBeGreaterThan(regionAt);
  for (const field of args.fields) {
    const at = html.indexOf(field, regionAt);
    expect(at).toBeGreaterThan(regionAt);
    expect(at).toBeLessThan(end);
    // Nothing of the folded field shows above the disclosure.
    expect(html.slice(0, anchor)).not.toContain(field);
  }
}

describe("Settings folds expert fields into a closed Advanced disclosure", () => {
  test("Chat typography: mono and Korean fonts and the Information panel scale", async () => {
    const { ChatSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-chat-section"
    );
    const html = await render(ChatSection);
    // The everyday fields stay in view.
    expect(html.indexOf("Message Font Size")).toBeLessThan(
      html.indexOf("Mono and Korean font families"),
    );
    expectFoldedClosed(html, {
      description: "Mono and Korean font families and the Information panel scale.",
      fields: ["Mono Font Family", "Korean Font Family", "Information Panel Scale"],
      endMarker: "Streaming UI",
    });
  });

  test("Appearance: the raw design token editor", async () => {
    const { ThemeSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-theme-section"
    );
    const html = await render(ThemeSection);
    expect(html).toContain("Design Tokens");
    expectFoldedClosed(html, {
      description: "Override single light or dark tokens.",
      fields: ["Light Tokens", "Dark Tokens"],
    });
  });

  test("Editor: language server command overrides", async () => {
    const { EditorSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-editor-section"
    );
    const html = await render(EditorSection);
    // The on/off switch stays in view.
    expect(html.indexOf("Enable LSP Runtime")).toBeLessThan(
      html.indexOf("Language server commands."),
    );
    expectFoldedClosed(html, {
      description: "Language server commands.",
      fields: ["TypeScript LSP Command", "Python LSP Command"],
      endMarker: "ESLint",
    });
  });

  test("Lens: React debug source mapping and the CDP developer controls", async () => {
    const { LensSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-lens-section"
    );
    const html = await render(LensSection);
    expect(html.indexOf("Heuristic Search")).toBeLessThan(
      html.indexOf("React debug source mapping for development builds."),
    );
    expectFoldedClosed(html, {
      description: "React debug source mapping for development builds.",
      fields: ["React _debugSource"],
      endMarker: "CDP tools and approved CDP hosts.",
    });
    expectFoldedClosed(html, {
      description: "CDP tools and approved CDP hosts.",
      fields: ["CDP Tools", "Approved CDP Hosts"],
    });
  });
});
