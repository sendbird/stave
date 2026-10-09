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

async function resetStore() {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
}

async function renderProviders(args: { navigable: boolean }) {
  await resetStore();
  const { ProvidersSection } = await import(
    "../src/components/layout/settings-dialog-providers-section"
  );
  return renderToStaticMarkup(
    createElement(ProvidersSection, {
      onNavigateSection: args.navigable ? () => {} : undefined,
    }),
  );
}

async function renderModels() {
  await resetStore();
  const { ModelsSection } = await import(
    "../src/components/layout/settings-sections/settings-dialog-models-section"
  );
  return renderToStaticMarkup(createElement(ModelsSection));
}

describe("Providers settings after the Models consolidation", () => {
  test("points to Models for default model and effort instead of repeating them", async () => {
    const html = await renderProviders({ navigable: true });
    expect(html).toContain("Default Model and Effort");
    expect(html).toContain("Open Models");
    // The Claude tab no longer carries its own default-effort select.
    expect(html).not.toContain(">Effort<");
  });

  test("omits the navigation button when the host cannot switch sections", async () => {
    const html = await renderProviders({ navigable: false });
    expect(html).toContain("Default Model and Effort");
    expect(html).not.toContain("Open Models");
  });

  test("folds expert Claude controls into a collapsed Advanced options group", async () => {
    const html = await renderProviders({ navigable: true });
    const triggerAt = html.indexOf("Advanced options");
    expect(triggerAt).toBeGreaterThan(-1);
    // ADS mounts accordion panels eagerly, so folded fields stay in the DOM
    // inside a `hidden` region rather than disappearing.
    const panel = html.slice(triggerAt);
    const panelStart = panel.indexOf('role="region"');
    const panelOpen = panel.slice(0, panelStart).lastIndexOf("<div");
    expect(panel.slice(panelOpen, panelStart)).toContain('hidden=""');
    const before = html.slice(0, triggerAt);
    expect(before.slice(before.lastIndexOf("<button"))).toContain(
      'aria-expanded="false"',
    );
    for (const folded of ["Resume At Message", "Strict MCP Config", "Setting Sources"]) {
      expect(before).not.toContain(folded);
      expect(panel.slice(panelStart)).toContain(folded);
    }
  });

  test("keeps safety and permission controls directly visible", async () => {
    const html = await renderProviders({ navigable: true });
    expect(html).toContain("Permission Mode");
    expect(html).toContain("Sandbox Enabled");
  });
});

describe("Models settings own every provider default", () => {
  test("renders one model + effort row for Claude, Codex, Cursor, and Kiro", async () => {
    const html = await renderModels();
    expect(html).toContain("Default Models and Effort");
    for (const effortLabel of [
      "Claude Effort",
      "Codex Effort",
      "Cursor default effort",
      "Kiro default effort",
    ]) {
      expect(html).toContain(`aria-label="${effortLabel}"`);
    }
    expect(html).toContain('aria-label="Cursor default model"');
    expect(html).toContain('aria-label="Kiro default model"');
  });
});
