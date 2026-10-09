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

async function seedStore() {
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
      settingsOverrides: {
        modelCodex: "gpt-5.6",
        claudePermissionMode: "default",
      },
    },
  ];
  restoreInitialRepositories = () => {
    initialState.recentRepositories = previous;
  };
}

async function renderInScope(
  repositoryPath: string | null,
  element: () => Promise<ReactElement>,
) {
  await seedStore();
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

  test("non-overridable sections say they apply to all projects", async () => {
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
    expect(html).toContain("These settings apply to all projects");
    expect(html).toContain("Edit for all projects");
    expect(html).toContain("data-settings-scope-locked");
  });
});
