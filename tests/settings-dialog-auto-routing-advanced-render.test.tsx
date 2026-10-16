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

async function renderSection() {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  const { SettingsAutoRoutingSection } = await import(
    "../src/components/layout/settings-dialog-auto-routing-section"
  );
  return renderToStaticMarkup(createElement(SettingsAutoRoutingSection, {}));
}

describe("Auto settings advanced disclosure", () => {
  test("the Advanced settings trigger renders a chevron affordance", async () => {
    const html = await renderSection();
    expect(html).toContain("Advanced settings");
    // ADS's compound Accordion.Trigger renders only the children it is given,
    // so a bare string leaves the disclosure with no open/closed affordance.
    expect(html).toContain("atelier-accordion-trigger");
    expect(html).toContain("lucide-chevron-down");
  });

  test("the trigger label is a styled element rather than a bare text node", async () => {
    const html = await renderSection();
    const trigger = html.slice(html.indexOf("atelier-accordion-trigger"));
    const label = trigger.slice(0, trigger.indexOf("Advanced settings"));
    // A bare child would put the text straight in the trigger's grid cell,
    // inheriting whatever font the dialog happens to set.
    expect(label).toContain("<span");
  });

  test("the disclosure starts collapsed and is controlled from the call site", async () => {
    const html = await renderSection();
    // The panel's own controls must not be exposed while it is collapsed, and
    // an expanded trigger would mean the local open state never took effect.
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("Auto settings routing levels", () => {
  test("every level has an edit control and a customized level is marked", async () => {
    const profile = await import("../src/lib/providers/auto-routing-profile");
    const { getSdkModelOptions } = await import("../src/lib/providers/model-catalog");
    const custom = profile.withRouteLevel(
      profile.cloneProfileAsCustom(profile.buildStarterProfile("starter-quality-first")),
      "extreme",
      { tier: "frontier", effort: "high", effortRange: ["medium", "xhigh"] },
    );
    const { RoutingLevelsTable } = await import(
      "../src/components/layout/settings-dialog-auto-routing-section"
    );
    const table = renderToStaticMarkup(createElement(RoutingLevelsTable, {
      profile: custom,
      modelsByProvider: {
        "claude-code": getSdkModelOptions({ providerId: "claude-code" }),
        codex: getSdkModelOptions({ providerId: "codex" }),
      },
      onLevelChange: () => {},
    }));
    for (const level of ["Simple", "Standard", "Complex", "Expert", "Extreme"]) {
      expect(table).toContain(`aria-label="Edit ${level} level"`);
    }
    expect(table.match(/>Custom</g)?.length).toBe(1);
    // Quality-first on the customized Extreme level runs its own high end.
    expect(table).toContain("Fable 5.1 · Xhigh");
    expect(table).toContain("GPT-6 Astra · Xhigh");
    // Expert keeps the built-in ceiling.
    expect(table).toContain("Fable 5.1 · Medium");
  });

  test("the decision model comes before the levels it feeds, with its classification switch", async () => {
    const html = await renderSection();
    const at = (text: string) => html.indexOf(text);
    expect(at("Routing decision model")).toBeGreaterThan(at("Preference"));
    expect(at("Model classification")).toBeGreaterThan(at("Routing decision model"));
    expect(at("Routing levels")).toBeGreaterThan(at("Model classification"));
    expect(at("Allowed models")).toBeGreaterThan(at("Routing levels"));
    expect(html).toContain("All (default)");
  });

  test("Auto off says the settings below wait for it instead of repeating the switch in a badge", async () => {
    // The default settings start with Auto off.
    const html = await renderSection();
    expect(html).toContain("Auto is off. These settings are kept and apply once you turn it on.");
  });
});
