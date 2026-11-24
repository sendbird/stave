import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityView, describeExternalAction } from "@/components/activity/ActivityView";
import { SidebarPrimaryNav, SidebarPrimaryNavCollapsed } from "@/components/layout/SidebarPrimaryNav";
import { createAppStorePersistenceOptions } from "@/store/app-store-persistence";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { resetExternalActivity } from "@/store/external-activity-store";
import { i18n } from "@/i18n";
import {
  groupExternalSessions,
  isPathWithin,
  placeExternalSession,
  type ExternalSessionProjectSource,
} from "@/lib/external-sessions/external-session-groups";
import { createExternalSessionsBridge } from "@/lib/external-sessions/external-sessions-bridge";
import {
  countRunningExternalWork,
  EXTERNAL_SESSIONS_IPC,
  ExternalSessionsSnapshotSchema,
  resolveExternalSessionsMode,
  type ExternalSession,
  type ExternalSessionsSnapshot,
} from "@/lib/external-sessions/external-sessions";
import {
  createExternalSessionSubscriptionRegistry,
  removeExternalSessionSubscriber,
  resolveExternalSessionsWatcherMode,
  setExternalSessionSubscriber,
} from "../electron/main/external-sessions/external-session-subscriptions";

const projects: ExternalSessionProjectSource[] = [
  {
    repositoryPath: "/work/stave",
    repositoryName: "stave",
    workspaces: [{ id: "w-main", name: "main" }, { id: "w-feat", name: "feat/activity" }],
    workspacePathById: { "w-main": "/work/stave", "w-feat": "/work/stave/.stave/workspaces/feat" },
  },
  { repositoryPath: "/work/other", repositoryName: "other", workspaces: [], workspacePathById: {} },
];

function session(overrides: Partial<ExternalSession>): ExternalSession {
  return { id: "s", source: "claude-code", status: "working", lastAt: 1, steps: 0, agents: [], ...overrides };
}

describe("placing sessions in Stave projects", () => {
  test("the deepest workspace wins, then the project, and partial folder names never match", () => {
    expect(placeExternalSession("/work/stave/.stave/workspaces/feat/src", projects)).toMatchObject({ projectName: "stave", workspaceId: "w-feat" });
    expect(placeExternalSession("/work/stave/docs", projects)).toMatchObject({ workspaceId: "w-main" });
    expect(placeExternalSession("/work/other/x", projects)).toEqual({ projectPath: "/work/other", projectName: "other" });
    expect(placeExternalSession("/work/stave-fork", projects)).toBeNull();
    expect(placeExternalSession(undefined, projects)).toBeNull();
    expect(isPathWithin("C:\\work\\a", "C:\\work\\a\\b")).toBe(true);
  });

  test("groups by project, keeping unknown folders apart", () => {
    const groups = groupExternalSessions([
      session({ id: "a", cwd: "/work/stave/src" }),
      session({ id: "b", cwd: "/tmp/scratch" }),
      session({ id: "c", cwd: "/work/stave/.stave/workspaces/feat" }),
      session({ id: "d" }),
    ], projects);
    expect(groups.map((group) => [group.label, group.inProject, group.rows.map((row) => row.session.id)])).toEqual([
      ["stave", true, ["a", "c"]],
      ["scratch", false, ["b"]],
      ["", false, ["d"]],
    ]);
  });
});

describe("subscription modes", () => {
  test("the setting off asks for nothing; the open page asks for live", () => {
    expect(resolveExternalSessionsMode({ enabled: false, pageOpen: true })).toBeNull();
    expect(resolveExternalSessionsMode({ enabled: true, pageOpen: false })).toBe("count");
    expect(resolveExternalSessionsMode({ enabled: true, pageOpen: true })).toBe("live");
  });

  test("main runs the widest mode any window asks for, and nothing with no window", () => {
    const registry = createExternalSessionSubscriptionRegistry();
    expect(resolveExternalSessionsWatcherMode(registry)).toBeNull();
    setExternalSessionSubscriber(registry, 1, "count");
    expect(resolveExternalSessionsWatcherMode(registry)).toBe("count");
    setExternalSessionSubscriber(registry, 2, "live");
    expect(resolveExternalSessionsWatcherMode(registry)).toBe("live");
    removeExternalSessionSubscriber(registry, 2);
    removeExternalSessionSubscriber(registry, 1);
    expect(resolveExternalSessionsWatcherMode(registry)).toBeNull();
  });

  test("the preload bridge folds a window's listeners into one request and coalesces a swap", async () => {
    const sent: Array<[string, unknown]> = [];
    let push: ((payload: unknown) => void) | null = null;
    const bridge = createExternalSessionsBridge({
      invoke: async () => null,
      send: (channel, args) => sent.push([channel, args]),
      on: (_channel, listener) => {
        push = listener;
      },
    });
    const received: ExternalSessionsSnapshot[] = [];
    const stopCount = bridge.subscribe("count", (snapshot) => received.push(snapshot));
    await Promise.resolve();
    expect(sent).toEqual([[EXTERNAL_SESSIONS_IPC.SUBSCRIBE, { mode: "count" }]]);
    // Swap count for live in one turn: main sees one change.
    stopCount();
    const stopLive = bridge.subscribe("live", (snapshot) => received.push(snapshot));
    await Promise.resolve();
    expect(sent.at(-1)).toEqual([EXTERNAL_SESSIONS_IPC.SUBSCRIBE, { mode: "live" }]);
    expect(sent).toHaveLength(2);
    push!({ state: "live", generatedAt: 1, runningCount: 0, sessions: [] });
    expect(received).toHaveLength(1);
    stopLive();
    stopLive();
    await Promise.resolve();
    expect(sent.at(-1)).toEqual([EXTERNAL_SESSIONS_IPC.UNSUBSCRIBE, undefined]);
    expect(sent).toHaveLength(3);
  });
});

const liveSnapshot: ExternalSessionsSnapshot = {
  state: "live",
  generatedAt: 10,
  runningCount: 2,
  sessions: [
    session({
      id: "claude-1",
      title: "Refactor the store",
      cwd: "/work/stave",
      branch: "feat/activity",
      action: { verb: "read", target: "src/store.ts" },
      steps: 4,
      contextTokens: 12_000,
      startedAt: 1,
      agents: [
        { id: "a1", agentType: "Explore", description: "Map the IPC layer", status: "running", startedAt: 2, lastAt: 3, steps: 2, action: { verb: "search", target: "ipcMain" } },
        { id: "a2", agentType: "general-purpose", description: "Write tests", status: "finished", startedAt: 2, lastAt: 9, steps: 5 },
      ],
    }),
    session({ id: "codex-1", source: "codex", title: "Check the build", cwd: "/tmp/scratch", status: "waiting" }),
  ],
};

describe("ActivityView", () => {
  test("the snapshot schema accepts what the watcher publishes", () => {
    expect(ExternalSessionsSnapshotSchema.safeParse(liveSnapshot).success).toBe(true);
    expect(countRunningExternalWork(liveSnapshot.sessions)).toBe(2);
  });

  test("off: explains what turning it on reads, with a way to turn it on", () => {
    const html = renderToStaticMarkup(createElement(ActivityView, { enabled: false, snapshot: liveSnapshot }));
    expect(html).toContain(i18n.t("shell:externalActivity.offTitle"));
    expect(html).toContain(i18n.t("shell:externalActivity.turnOn"));
    expect(html).not.toContain("Refactor the store");
  });

  test("live: project, session and agent cards with status, action and counts", () => {
    const html = renderToStaticMarkup(createElement(ActivityView, { enabled: true, snapshot: liveSnapshot }));
    expect(html).toContain(i18n.t("shell:externalActivity.running", { count: 2 }));
    expect(html).toContain("Refactor the store");
    expect(html).toContain("feat/activity");
    expect(html).toContain(describeExternalAction({ verb: "read", target: "src/store.ts" }));
    expect(html).toContain(i18n.t("shell:externalActivity.agentsRunning", { running: 1, count: 2 }));
    expect(html).toContain("Map the IPC layer");
    expect(html).toContain("scratch");
    expect(html).toContain(i18n.t("shell:externalActivity.status.waiting"));
  });

  test("a Codex sub-agent without a listed parent carries a sub-agent label", () => {
    const snapshot = { ...liveSnapshot, sessions: [session({ id: "codex-2", source: "codex", subagent: true, title: "Euler", cwd: "/tmp/scratch" })] };
    expect(ExternalSessionsSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const html = renderToStaticMarkup(createElement(ActivityView, { enabled: true, snapshot }));
    expect(html).toContain(i18n.t("shell:externalActivity.subagent"));
    expect(renderToStaticMarkup(createElement(ActivityView, { enabled: true, snapshot: liveSnapshot }))).not.toContain(i18n.t("shell:externalActivity.subagent"));
  });

  test("nothing running and still starting each have their own state", () => {
    const empty = renderToStaticMarkup(createElement(ActivityView, { enabled: true, snapshot: { ...liveSnapshot, runningCount: 0, sessions: [] } }));
    expect(empty).toContain(i18n.t("shell:externalActivity.emptyTitle"));
    const starting = renderToStaticMarkup(createElement(ActivityView, { enabled: true, snapshot: { ...liveSnapshot, state: "count", sessions: [] } }));
    expect(starting).toContain(i18n.t("shell:externalActivity.loading"));
  });

  test("both sidebar forms show Activity", () => {
    const originalWindow = globalThis.window;
    globalThis.window = { api: {} } as Window & typeof globalThis;
    try {
      for (const Component of [SidebarPrimaryNav, SidebarPrimaryNavCollapsed]) {
        const idle = renderToStaticMarkup(createElement(Component, { showFleetView: false }));
        expect(idle).toContain("data-external-activity-nav");
        expect(idle).toContain(`aria-label="${i18n.t("shell:externalActivity.nav")}"`);
        resetExternalActivity();
      }
    } finally {
      resetExternalActivity();
      globalThis.window = originalWindow;
    }
  });

  test("the setting is off by default, restores a saved choice, and ignores a malformed one", () => {
    const initialApp = useAppStore.getInitialState();
    expect(initialApp.settings.externalActivityEnabled).toBe(false);
    const originalWindow = globalThis.window;
    globalThis.window = { api: {} } as Window & typeof globalThis;
    const options = createAppStorePersistenceOptions();
    const restore = (settings: Record<string, unknown>) => {
      const state = { ...initialApp, settings } as unknown as AppState;
      options.onRehydrateStorage()(state);
      return state.settings.externalActivityEnabled;
    };
    expect(restore({ externalActivityEnabled: true })).toBe(true);
    expect(restore({ externalActivityEnabled: "yes" })).toBe(false);
    expect(restore({})).toBe(false);
    globalThis.window = originalWindow;
  });

  test("actions read in Korean too", async () => {
    await i18n.changeLanguage("ko");
    try {
      expect(describeExternalAction({ verb: "run", target: "npm test" })).toBe("npm test 실행 중");
      expect(describeExternalAction({ verb: "tool", tool: "create_issue" })).toBe("create_issue 사용 중");
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
