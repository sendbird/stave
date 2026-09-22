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
