import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const PROJECT_PATH = "/tmp/stave-scope/alpha";
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

// Server rendering reads the store's initial state, so the seed goes there
// and is restored after each test.
let restoreInitialRepositories: (() => void) | null = null;

afterEach(() => {
  restoreInitialRepositories?.();
  restoreInitialRepositories = null;
  (globalThis as { window?: unknown }).window = originalWindow;
});

const DEFAULT_OVERRIDES = {
  modelCodex: "gpt-5.6",
  claudePermissionMode: "default",
};

async function seedStore(settingsOverrides: Record<string, unknown> = DEFAULT_OVERRIDES) {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  const initialState = useAppStore.getInitialState();
  const previous = initialState.recentRepositories;
  initialState.recentRepositories = [
    {
      repositoryPath: PROJECT_PATH,
      repositoryName: "alpha",
      lastOpenedAt: "2026-10-01T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      settingsOverrides,
    },
  ];
  restoreInitialRepositories = () => {
    initialState.recentRepositories = previous;
  };
}

async function renderInScope(
  repositoryPath: string | null,
  element: () => Promise<ReactElement>,
  settingsOverrides?: Record<string, unknown>,
) {
  await seedStore(settingsOverrides);
  const { SettingsScopeProvider } = await import(
    "../src/components/layout/settings-scope"
  );
  return renderToStaticMarkup(
    createElement(
      SettingsScopeProvider,
      {
        value: {
          repositoryPath,
          repositoryName: repositoryPath ? "alpha" : null,
          setRepositoryPath: () => {},
        },
      },
      await element(),
    ),
  );
}

async function modelsSection() {
  const { ModelsSection } = await import(
    "../src/components/layout/settings-sections/settings-dialog-models-section"
  );
  return createElement(ModelsSection);
}

async function providersSection() {
  const { ProvidersSection } = await import(
    "../src/components/layout/settings-dialog-providers-section"
  );
  return createElement(ProvidersSection, {});
}

describe("Settings scope rendering", () => {
  test("only Models and Providers are project scoped", async () => {
    const { isProjectScopedSettingsSection } = await import(
      "../src/components/layout/settings-scope"
    );
    expect(isProjectScopedSettingsSection("models")).toBe(true);
    expect(isProjectScopedSettingsSection("providers")).toBe(true);
    expect(isProjectScopedSettingsSection("chat")).toBe(false);
    expect(isProjectScopedSettingsSection("projects")).toBe(false);
  });

  test("global scope shows no project badges or locks", async () => {
    const html = await renderInScope(null, modelsSection);
    expect(html).not.toContain("data-settings-scope-status");
    expect(html).not.toContain("data-settings-scope-locked");
  });

  test("project scope marks project and global values in Models", async () => {
    const html = await renderInScope(PROJECT_PATH, modelsSection);
    expect(html).toContain("Project value");
    expect(html).toContain("Global value");
    expect(html).toContain("Use the global value for Codex");
    expect(html).not.toContain("Use the global value for Claude");
    // Model visibility is global-only, so it is read-only here.
    expect(html).toContain("data-settings-scope-locked");
  });

  test("project scope keeps posture fields editable and locks the rest in Providers", async () => {
    const html = await renderInScope(PROJECT_PATH, providersSection);
    expect(html).toContain("Use the global value for Permission Mode");
    expect(html).toContain("data-settings-scope-locked");
  });

  test("a project override inside Customize permissions opens it, with its badges", async () => {
    // `auto` is also the global value, so the Auto preset still matches: the
    // override alone opens the group.
    const html = await renderInScope(PROJECT_PATH, providersSection, {
      claudePermissionMode: "auto",
    });
    const groupAt = html.indexOf('id="settings-field-claude-permissions"');
    expect(groupAt).toBeGreaterThan(-1);
    expect(html.slice(0, groupAt)).toContain("Active preset: Auto");
    const trigger = html.slice(groupAt, html.indexOf("</button>", groupAt));
    expect(trigger).toContain('aria-expanded="true"');
    const group = html.slice(groupAt);
    expect(group).toContain("Use the global value for Permission Mode");
    expect(group).toContain("Project value");
    expect(group).toContain("Global value");
    // The preset row keeps its own badge for every field it sets.
    expect(html.slice(0, groupAt)).toContain("Use the global value for Mode Preset");
  });

  test("without a project override or Custom, Customize permissions stays closed", async () => {
    const html = await renderInScope(PROJECT_PATH, providersSection, {
      modelCodex: "gpt-5.6",
    });
    const groupAt = html.indexOf('id="settings-field-claude-permissions"');
    const trigger = html.slice(groupAt, html.indexOf("</button>", groupAt));
    expect(trigger).toContain('aria-expanded="false"');
    // Still editable per project: the folded fields keep their badges.
    expect(html.slice(groupAt)).toContain("data-settings-scope-status");
  });

  test("sections without per-project values ignore the project scope", async () => {
    await seedStore();
    const { SettingsScopeProvider, SettingsScopeSectionFrame } = await import(
      "../src/components/layout/settings-scope"
    );
    const html = renderToStaticMarkup(
      createElement(
        SettingsScopeProvider,
        {
          value: {
            repositoryPath: PROJECT_PATH,
            repositoryName: "alpha",
            setRepositoryPath: () => {},
          },
        },
        createElement(SettingsScopeSectionFrame, {
          sectionId: "chat",
          children: createElement("p", null, "chat body"),
        }),
      ),
    );
    expect(html).toBe("<p>chat body</p>");
  });
});
