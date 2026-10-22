import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { RightRail } from "@/components/layout/RightRail";
import { TopBar } from "@/components/layout/TopBar";
import { resolveKeybindingDisplay } from "@/lib/keybindings/keybinding-settings";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";

const originalWindow = globalThis.window;

beforeEach(() => {
  globalThis.window = { api: { platform: "darwin" } } as unknown as Window &
    typeof globalThis;
});

afterEach(() => {
  applyAppLocale("en");
  globalThis.window = originalWindow;
});

const REPOSITORY_STATE: Partial<AppState> = {
  repositoryPath: "/tmp/stave-repo",
  activeWorkspaceId: "ws-1",
  workspaces: [{ id: "ws-1", name: "feature", updatedAt: "2026-01-01T00:00:00Z" }],
  workspacePathById: { "ws-1": "/tmp/stave-repo/.stave/workspaces/feature" },
  workspaceBranchById: { "ws-1": "feature" },
};

/**
 * Server rendering reads a store's initial state, so the seeded fields are
 * written onto that object for one render and put back afterwards.
 */
function renderWithState(patch: Partial<AppState>, element: ReactElement) {
  const initial = useAppStore.getInitialState() as unknown as Record<string, unknown>;
  const saved = Object.fromEntries(
    Object.keys(patch).map((key) => [key, initial[key]]),
  );
  Object.assign(initial, patch);
  try {
    return renderToStaticMarkup(element);
  } finally {
    Object.assign(initial, saved);
  }
}

/** The markup of one labelled group, up to the next group. */
function groupMarkup(html: string, label: string) {
  const start = html.indexOf(`role="group" aria-label="${label}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('role="group"', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("top bar groups", () => {
  test("reads as location, search, views and app, keeping every control", () => {
    const html = renderWithState(REPOSITORY_STATE, createElement(TopBar));
    const order = ["Location", "Search", "Views", "App"].map((label) =>
      html.indexOf(`role="group" aria-label="${label}"`),
    );
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const location = groupMarkup(html, "Location");
    expect(location).toContain("Open workspace path actions");
    expect(location).toContain("feature");
    expect(location).toContain('aria-label="Commit graph"');
    expect(location).toContain("Create PR");

    const search = groupMarkup(html, "Search");
    expect(search).toContain('aria-label="Go to file"');
    expect(search).toContain('data-file-search-input="true"');
    // The idle field shows its quick-open keys.
    expect(search).toContain('aria-label="Keyboard shortcut ⌘ P"');

    const views = groupMarkup(html, "Views");
    for (const name of ["Open Fleet View", "Open Issues", "Open schedules", "Standalone CLI"]) {
      expect(views).toContain(name);
    }
    const app = groupMarkup(html, "App");
    expect(app).toContain('aria-label="notifications"');
    expect(app).toContain('aria-label="App update"');
  });

  test("without a repository the bar keeps its views and app groups", () => {
    const html = renderWithState({}, createElement(TopBar));
    expect(html).not.toContain('aria-label="Location"');
    expect(html).not.toContain('aria-label="Search"');
    const views = groupMarkup(html, "Views");
    for (const name of ["Open Issues", "Open schedules", "Standalone CLI"]) {
      expect(views).toContain(name);
    }
    expect(groupMarkup(html, "App")).toContain('aria-label="App update"');
  });

  test("group names are translated", () => {
    applyAppLocale("ko");
    const html = renderWithState(REPOSITORY_STATE, createElement(TopBar));
    for (const label of ["위치", "검색", "보기", "앱"]) {
      expect(html).toContain(`role="group" aria-label="${label}"`);
    }
  });
});

describe("right rail toolbar", () => {
  test("is one vertical toolbar with a panel group and a surface group", () => {
    const html = renderWithState(REPOSITORY_STATE, createElement(RightRail));
    expect(html).toContain('data-testid="workspace-bar"');
    expect(html).toContain('aria-orientation="vertical" role="toolbar" aria-label="Workspace panels"');
    expect(html.match(/role="group"/g)).toHaveLength(2);

    const names = [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(names).toEqual([
      "Explorer",
      "Source Control",
      "Information",
      "Skills",
      "Workspace Tools",
      "Task",
      "Lens",
      "Terminal",
    ]);
    // Every toggle states whether it is pressed, Lens included.
    expect(html.match(/<button[^>]*aria-pressed="false"/g)).toHaveLength(8);
  });

  test("a pressed panel keeps the filled rail look", () => {
    const html = renderWithState(
      {
        ...REPOSITORY_STATE,
        layout: {
          ...useAppStore.getInitialState().layout,
          sidebarOverlayVisible: true,
          sidebarOverlayTab: "explorer",
        },
      },
      createElement(RightRail),
    );
    expect(html).toMatch(/aria-label="Explorer" aria-pressed="true"[^>]*data-variant="primary"/);
    expect(html).toMatch(/aria-label="Source Control" aria-pressed="false"[^>]*data-variant="quiet"/);
  });
});

describe("shortcut hints", () => {
  test("a Cmd/Ctrl+K chord shows both steps and follows the user's key", () => {
    expect(
      resolveKeybindingDisplay("navigation.fleet-view", { platform: "mac" }),
    ).toEqual({ sequences: [["⌘", "K"], ["F"]], sequenceJoiner: "then" });
    expect(
      resolveKeybindingDisplay("view.show-explorer", {
        platform: "windows",
        settings: { appShortcutKeys: { "view.show-explorer": "x" } },
      }),
    ).toEqual({ sequences: [["Ctrl", "K"], ["X"]], sequenceJoiner: "then" });
  });

  test("a shortcut turned off in Settings shows no keys", () => {
    expect(
      resolveKeybindingDisplay("navigation.issues", {
        platform: "mac",
        settings: { appShortcutKeys: { "navigation.issues": "" } },
      }),
    ).toBeNull();
  });

  test("a plain shortcut shows its one step", () => {
    expect(
      resolveKeybindingDisplay("file.quick-open", { platform: "linux" }),
    ).toEqual({ sequences: [["Ctrl", "P"]], sequenceJoiner: "or" });
  });
});
