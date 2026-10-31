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

/**
 * Seeds initial-snapshot state for one render: `settings` patches the app
 * settings, `focus` is a pending Settings deep link.
 */
async function seedInitialState(args: {
  settings?: Record<string, unknown>;
  focus?: string;
}) {
  const { useAppStore } = await import("../src/store/app.store");
  const { useSettingsFocusRequest } = await import(
    "../src/lib/providers/accounts-navigation"
  );
  const appInitial = useAppStore.getInitialState();
  const focusInitial = useSettingsFocusRequest.getInitialState();
  const previousSettings = appInitial.settings;
  const previousFocus = focusInitial.focus;
  appInitial.settings = { ...previousSettings, ...args.settings };
  focusInitial.focus = args.focus ?? null;
  const restorePrevious = restoreInitialState;
  restoreInitialState = () => {
    appInitial.settings = previousSettings;
    focusInitial.focus = previousFocus;
    restorePrevious?.();
  };
}

/**
 * The Customize permissions group: its trigger and its panel. ADS mounts
 * accordion panels eagerly, so a closed group's fields stay in the markup
 * inside a `hidden` region.
 */
function customizePermissions(html: string, fieldId: string) {
  const start = html.indexOf(`id="${fieldId}"`);
  expect(start).toBeGreaterThan(-1);
  const triggerEnd = html.indexOf("</button>", start);
  const trigger = html.slice(html.indexOf("<button", start), triggerEnd);
  const regionAt = html.indexOf('role="region"', triggerEnd);
  const panelOpenTag = html.slice(html.lastIndexOf("<div", regionAt), regionAt);
  return {
    start,
    trigger,
    open: trigger.includes('aria-expanded="true"') && !panelOpenTag.includes('hidden=""'),
    panel: html.slice(regionAt),
  };
}

async function resetStore() {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
}

async function renderProviders() {
  await resetStore();
  const { ProvidersSection } = await import(
    "../src/components/layout/settings-dialog-providers-section"
  );
  return renderToStaticMarkup(createElement(ProvidersSection));
}

async function renderCodexPosture() {
  await resetStore();
  const { CodexPermissionPostureFields } = await import(
    "../src/components/layout/settings-dialog-permission-posture-fields"
  );
  return renderToStaticMarkup(createElement(CodexPermissionPostureFields));
}

const CLAUDE_PERMISSIONS = "settings-field-claude-permissions";
const CODEX_PERMISSIONS = "settings-field-codex-permissions";

async function renderModels() {
  await resetStore();
  const { ModelsSection } = await import(
    "../src/components/layout/settings-sections/settings-dialog-models-section"
  );
  return renderToStaticMarkup(createElement(ModelsSection));
}

describe("Providers settings after the Models consolidation", () => {
  test("neither repeats default model and effort nor links to Models for them", async () => {
    const html = await renderProviders();
    // Models is the next page in the sidebar; the provider tabs carry no pointer.
    expect(html).not.toContain("Default Model and Effort");
    expect(html).not.toContain("Open Models");
    // The Claude tab no longer carries its own default-effort select.
    expect(html).not.toContain(">Effort<");
  });

  test("folds expert Claude controls into a collapsed Advanced options group", async () => {
    const html = await renderProviders();
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
    for (const folded of [
      "Resume At Message",
      "Strict MCP Config",
      "Setting Sources",
      "Agent Progress Summaries",
      "File Checkpointing",
    ]) {
      expect(before).not.toContain(folded);
      expect(panel.slice(panelStart)).toContain(folded);
    }
  });

  test("keeps Thinking Mode and Prompt Suggestions in view", async () => {
    const html = await renderProviders();
    const advancedAt = html.indexOf("Advanced options");
    for (const visible of ["Thinking Mode", "Prompt Suggestions"]) {
      expect(html.indexOf(visible)).toBeGreaterThan(-1);
      expect(html.indexOf(visible)).toBeLessThan(advancedAt);
    }
  });

  test("leads with the provider tabs; the shared cards follow them", async () => {
    const html = await renderProviders();
    const tabsAt = html.indexOf('role="tablist"');
    expect(tabsAt).toBeGreaterThan(-1);
    const presetAt = html.indexOf("Mode Preset");
    expect(presetAt).toBeGreaterThan(tabsAt);
    for (const shared of ["Account usage limit", "Trusted Approvals", "Delegated tasks"]) {
      expect(html.indexOf(shared)).toBeGreaterThan(presetAt);
    }
    // Search and deep links still land on the shared cards.
    expect(html).toContain('id="settings-field-account-usage-limit"');
    expect(html).toContain('id="settings-field-delegation"');
  });

  test("keeps the Claude preset and its summary in view and folds what it sets", async () => {
    const html = await renderProviders();
    const group = customizePermissions(html, CLAUDE_PERMISSIONS);
    expect(group.trigger).toContain("Customize permissions");
    expect(group.open).toBe(false);
    const above = html.slice(0, group.start);
    // The default settings match the Auto preset.
    expect(above).toContain("Active preset: Auto (Permission auto / Sandbox Off");
    for (const folded of [
      "Permission Mode",
      "Dangerous Skip Permissions",
      "Sandbox Enabled",
      "Allow Unsandboxed Commands",
      "Ask Before Writes Outside the Repository",
      "Ask Before Touching Credentials",
      "Ask Before Irreversible Remote Actions",
    ]) {
      expect(above).not.toContain(folded);
      expect(group.panel).toContain(folded);
    }
  });

  test("opens Customize permissions when the combination matches no preset", async () => {
    await seedInitialState({ settings: { claudeSandboxEnabled: true } });
    const html = await renderProviders();
    const group = customizePermissions(html, CLAUDE_PERMISSIONS);
    expect(group.trigger).toContain('aria-expanded="true"');
    expect(group.open).toBe(true);
    expect(html.slice(0, group.start)).toContain("matches no preset");
  });

  test("opens Customize permissions for a deep link to it", async () => {
    await seedInitialState({ focus: CLAUDE_PERMISSIONS });
    const html = await renderProviders();
    expect(customizePermissions(html, CLAUDE_PERMISSIONS).open).toBe(true);
  });

  test("folds the Codex fields a preset sets", async () => {
    const closed = customizePermissions(await renderCodexPosture(), CODEX_PERMISSIONS);
    expect(closed.open).toBe(false);
    for (const folded of ["Network Access", "File Access", "Approvals"]) {
      expect(closed.panel).toContain(folded);
    }

    await seedInitialState({ settings: { codexNetworkAccess: false } });
    expect(customizePermissions(await renderCodexPosture(), CODEX_PERMISSIONS).open).toBe(true);
  });

  test("a deep link to the Codex permissions switches to the Codex tab and opens them", async () => {
    await seedInitialState({ focus: CODEX_PERMISSIONS });
    const html = await renderProviders();
    expect(html).not.toContain(`id="${CLAUDE_PERMISSIONS}"`);
    const group = customizePermissions(html, CODEX_PERMISSIONS);
    expect(group.open).toBe(true);
    // Web search is part of every Codex preset, so it is folded with them.
    expect(html.slice(0, group.start)).not.toContain("Web Search");
    expect(group.panel).toContain("Web Search");
  });

  test("shows a tab only for providers that are set up", async () => {
    const before = await renderProviders();
    for (const label of ["Claude", "Codex"]) expect(before).toContain(`>${label}</button>`);
    for (const label of ["Cursor", "Kiro", "OpenCode"]) expect(before).not.toContain(`>${label}</button>`);

    await setUpOptionalProviders(["kiro"]);
    const after = await renderProviders();
    expect(after).toContain(">Kiro</button>");
    expect(after).not.toContain(">Cursor</button>");
  });

  test("names no provider in the shared usage-limit copy", async () => {
    const html = await renderProviders();
    const start = html.indexOf("Account usage limit");
    const card = html.slice(start, html.indexOf("</section>", start));
    expect(card).not.toContain("Cursor");
    expect(card).not.toContain("Kiro");
  });
});

describe("Models settings own every provider default", () => {
  test("has no utility model pointer, since Background AI is a tab of the same page", async () => {
    const html = await renderModels();
    expect(html).not.toContain("Open Background AI");
    expect(html).not.toContain("Utility model");
  });

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
