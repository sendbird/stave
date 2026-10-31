import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = (globalThis as { window?: unknown }).window;
let restoreInitialState: (() => void) | null = null;

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
  restoreInitialState?.();
  restoreInitialState = null;
  (globalThis as { window?: unknown }).window = originalWindow;
});

/**
 * Server rendering reads each store's initial snapshot, so a provider is "set
 * up" here by writing its availability and a ready probe into those snapshots.
 */
async function setUpOptionalProviders(ids: readonly ("cursor" | "kiro" | "opencode")[]) {
  const { useAppStore } = await import("../src/store/app.store");
  const { useProviderReadinessStore } = await import(
    "../src/lib/providers/provider-readiness-store"
  );
  const appInitial = useAppStore.getInitialState();
  const readinessInitial = useProviderReadinessStore.getInitialState();
  const previousAvailability = appInitial.providerAvailability;
  const previousReadiness = readinessInitial.providers;
  appInitial.providerAvailability = {
    ...previousAvailability,
    ...Object.fromEntries(ids.map((id) => [id, true])),
  };
  readinessInitial.providers = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        tool: {
          id,
          label: id,
          state: "ready",
          available: true,
          authState: id === "opencode" ? "not-required" : "authenticated",
          authDetail: null,
          summary: "",
          detail: "",
          version: null,
          executablePath: null,
        },
        configurationKey: "",
        checkedAt: 1,
        generation: 1,
        stale: false,
      },
    ]),
  );
  restoreInitialState = () => {
    appInitial.providerAvailability = previousAvailability;
    readinessInitial.providers = previousReadiness;
  };
}

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

  test("shows a tab only for providers that are set up", async () => {
    const before = await renderProviders({ navigable: true });
    for (const label of ["Claude", "Codex"]) expect(before).toContain(`>${label}</button>`);
    for (const label of ["Cursor", "Kiro", "OpenCode"]) expect(before).not.toContain(`>${label}</button>`);

    await setUpOptionalProviders(["kiro"]);
    const after = await renderProviders({ navigable: true });
    expect(after).toContain(">Kiro</button>");
    expect(after).not.toContain(">Cursor</button>");
  });

  test("names no provider in the shared usage-limit copy", async () => {
    const html = await renderProviders({ navigable: true });
    const start = html.indexOf("Account usage limit");
    const card = html.slice(start, html.indexOf("</section>", start));
    expect(card).not.toContain("Cursor");
    expect(card).not.toContain("Kiro");
  });
});

describe("Models settings own every provider default", () => {
  test("renders model + effort rows for Claude and Codex, and none for providers that are not set up", async () => {
    const html = await renderModels();
    expect(html).toContain("Default Models and Effort");
    for (const effortLabel of ["Claude Effort", "Codex Effort"]) {
      expect(html).toContain(`aria-label="${effortLabel}"`);
    }
    for (const label of [
      "Cursor default model",
      "Cursor default effort",
      "Kiro default model",
      "Kiro default effort",
      "OpenCode default model",
    ]) {
      expect(html).not.toContain(`aria-label="${label}"`);
    }
  });

  test("adds the row of each optional provider once it is set up", async () => {
    await setUpOptionalProviders(["cursor", "kiro"]);
    const html = await renderModels();
    for (const label of [
      "Cursor default model",
      "Cursor default effort",
      "Kiro default model",
      "Kiro default effort",
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).not.toContain('aria-label="OpenCode default model"');
  });
});
