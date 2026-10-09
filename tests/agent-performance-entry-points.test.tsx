import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { AgentsView } from "@/components/agents/AgentsView";
import { UsageView } from "@/components/usage/UsageView";
import { SidebarPrimaryNav, SidebarPrimaryNavCollapsed } from "@/components/layout/SidebarPrimaryNav";
import { getCommandPaletteCoreCommands } from "@/components/layout/command-palette-registry";
import {
  AGENTS_APP_SURFACE,
  FLEET_VIEW_APP_SURFACE,
  USAGE_APP_SURFACE,
  WORKSPACE_APP_SURFACE,
  createAppSurfaceActions,
  type AppActiveSurface,
} from "@/store/app-surface";
import { useAppStore } from "@/store/app.store";
import { useAgentsViewStore, type AgentsViewTab } from "@/store/agents-view-store";

const repoRoot = path.join(import.meta.dir, "..");
const initial = useAppStore.getInitialState();
const originalWindow = globalThis.window;
beforeEach(() => {
  globalThis.window = { api: {} } as Window & typeof globalThis;
  applyAppLocale("en");
  useAgentsViewStore.setState({ activeTab: "agents" });
});
afterEach(() => {
  useAppStore.setState(initial, true);
  useAgentsViewStore.setState({ activeTab: "agents" });
  globalThis.window = originalWindow;
});

/** The text of the Agents view tab marked as the current page. */
function currentTabText(html: string) {
  const tag = html.match(/<button[^>]*aria-current="page"[^>]*>/);
  if (!tag || tag.index === undefined) return null;
  const rest = html.slice(tag.index + tag[0].length);
  return rest.slice(0, rest.indexOf("</button>")).replace(/<[^>]*>/g, "");
}

/** Server rendering reads a zustand store's initial state, so pass the tab. */
function renderAgentsViewOn(tab: AgentsViewTab) {
  return renderToStaticMarkup(createElement(AgentsView, { tab }));
}

function makeSurfaceStore(start: AppActiveSurface) {
  let state = { activeAppSurface: start };
  const actions = createAppSurfaceActions<typeof state>((updater) => {
    state = { ...state, ...updater(state) };
  });
  return { actions, get: () => state.activeAppSurface };
}

describe("Agent performance lives on the Agents surface", () => {
  test("openAgentPerformance opens Agents on the Performance tab from every surface", () => {
    for (const start of [
      WORKSPACE_APP_SURFACE,
      FLEET_VIEW_APP_SURFACE,
      AGENTS_APP_SURFACE,
      USAGE_APP_SURFACE,
      { kind: "usage", providerId: "codex", accountProfileId: "system-default" } as const,
    ] satisfies AppActiveSurface[]) {
      useAgentsViewStore.setState({ activeTab: "standards" });
      const store = makeSurfaceStore(start);
      store.actions.openAgentPerformance();
      expect(store.get()).toBe(AGENTS_APP_SURFACE);
      expect(useAgentsViewStore.getState().activeTab).toBe("performance");
    }
  });

  test("closing Agents closes the Performance tab like any other Agents tab", () => {
    const store = makeSurfaceStore(WORKSPACE_APP_SURFACE);
    store.actions.openAgentPerformance();
    store.actions.closeUsage();
    expect(store.get()).toBe(AGENTS_APP_SURFACE);
    store.actions.closeAgents();
    expect(store.get()).toBe(WORKSPACE_APP_SURFACE);
  });

  test("the command palette keeps its Open agent performance entry (pins and recents keep the id)", () => {
    const entry = getCommandPaletteCoreCommands().find((candidate) => candidate.id === "navigation.results");
    expect(entry?.title).toBe("Open agent performance");
    expect(entry?.group).toBe("navigation");
  });

  test("the Stave menu and the Fleet header route through openAgentPerformance", () => {
    // Both render inside portals or behind heavy state, so assert the wiring.
    for (const file of ["src/components/layout/StaveAppMenuButton.tsx", "src/components/layout/FleetView.tsx"]) {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      expect(source).toContain("openAgentPerformance");
      expect(source).not.toContain("openResults");
    }
  });

  test("the store exposes no separate Results surface", () => {
    const state = useAppStore.getState() as unknown as Record<string, unknown>;
    expect(state.openResults).toBeUndefined();
    expect(state.closeResults).toBeUndefined();
    expect(typeof state.openAgentPerformance).toBe("function");
  });
});

describe("Agents view Performance tab", () => {
  for (const locale of ["en", "ko"] as const) {
    test(`renders Agents, My standards and Performance, with Performance embedded in ${locale}`, () => {
      applyAppLocale(locale);
      const html = renderAgentsViewOn("performance");
      for (const key of ["extraCopy30", "extraCopy31", "performanceTab"] as const) {
        expect(html).toContain(i18n.t(`agents:agentsView.${key}`));
      }
      expect(currentTabText(html)).toBe(i18n.t("agents:agentsView.performanceTab"));
      // The tab's toolbar note says what the page is for.
      expect(html).toContain(i18n.t("compare:agentPerformance.purpose"));
      // Range and refresh stay; the standalone title and close do not.
      expect(html).toContain(i18n.t("compare:resultsView.period"));
      expect(html).toContain(i18n.t("compare:agentPerformance.refresh"));
      expect(html).not.toContain(i18n.t("compare:resultsView.closeResults"));
      expect(html).not.toContain(`>${i18n.t("compare:agentPerformance.title")}</h1>`);
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
      expect(html).not.toContain('data-testid="agents-tab"');
    });
  }

  test("the Agents tab does not mount the performance page", () => {
    const html = renderAgentsViewOn("agents");
    expect(currentTabText(html)).toBe(i18n.t("agents:agentsView.extraCopy30"));
    expect(html).not.toContain(i18n.t("compare:agentPerformance.refresh"));
  });
});

describe("AI usage is one screen", () => {
  test("AI usage renders UsageView with no outer Usage | Agent performance tab bar", () => {
    expect(existsSync(path.join(repoRoot, "src/components/usage/AiUsageView.tsx"))).toBe(false);
    const shell = readFileSync(path.join(repoRoot, "src/components/layout/AppShell.tsx"), "utf8");
    expect(shell).toContain("<UsageView");
    expect(shell).not.toContain("AiUsageView");
    const html = renderToStaticMarkup(createElement(UsageView));
    expect(html).toContain(i18n.t("usage:usageView.accountLimitsTokenUsageAndWhen"));
    expect(html).not.toContain(i18n.t("compare:agentPerformance.title"));
    expect(html).not.toContain(i18n.t("compare:agentPerformance.purpose"));
  });

  test("the sidebar has one AI usage entry and no separate Agent performance button", () => {
    for (const Component of [SidebarPrimaryNav, SidebarPrimaryNavCollapsed]) {
      const html = renderToStaticMarkup(createElement(Component, { showFleetView: true }));
      expect(html).toContain(i18n.t("shell:sidebarPrimaryNav.aIUsage"));
      expect(html).not.toContain(i18n.t("shell:sidebarPrimaryNav.results"));
    }
  });
});
