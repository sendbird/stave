import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { WorkspaceMartinProjectLink } from "../src/lib/workspace-information";

type ProjectStatus = "active" | "archived";

interface RuntimeCall {
  method: "resumeWorkspace" | "discardWorkspaceEntries";
  args: unknown;
}

const state = {
  bundleStatus: "active" as ProjectStatus,
  martinProject: null as WorkspaceMartinProjectLink | null,
  runtimeCalls: [] as RuntimeCall[],
  enqueuedEvents: [] as Array<{ projectRef: string; kind: string }>,
  savedProjects: [] as Array<WorkspaceMartinProjectLink | null>,
  syncEnabled: true,
};

function contextBundle() {
  return {
    contract: "stave-sync-v1",
    project: {
      id: "project-id",
      slug: "sync-outbox",
      name: "Sync outbox",
      summary: "",
      status: state.bundleStatus,
      visibility: "shared",
      syncIntervalMinutes: 60,
      lastSyncedAt: null,
      archivedAt: null,
      archiveReason: null,
      createdBy: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    sections: {},
    events: [],
    markdown: "# Sync outbox",
  };
}

mock.module("../electron/main/stave-mcp-service", () => ({
  getWorkspaceInformation: async () => ({
    workspaceInformation: {
      martinProject: state.martinProject,
      linkedPullRequests: [],
      figmaResources: [],
      slackThreads: [],
      jiraIssues: [],
      confluencePages: [],
      storybookResources: [],
      amplifyLinks: [],
    },
  }),
  listKnownProjects: async () => [
    {
      workspaces: [
        {
          id: "workspace-1",
          name: "Sync workspace",
          branch: "feat/sync",
          path: "/tmp/stave-test-workspace",
        },
      ],
    },
  ],
  setWorkspaceMartinProject: async (args: {
    project: WorkspaceMartinProjectLink | null;
  }) => {
    state.savedProjects.push(args.project);
    state.martinProject = args.project;
    return {
      workspaceInformation: {
        martinProject: args.project,
        linkedPullRequests: [],
        figmaResources: [],
        slackThreads: [],
        jiraIssues: [],
        confluencePages: [],
        storybookResources: [],
        amplifyLinks: [],
      },
    };
  },
}));

mock.module("../electron/main/martin-sync/context-snapshot", () => ({
  writeMartinContextSnapshot: async () => ({
    relativePath: ".stave/context/martin/sync-outbox.md",
  }),
}));

mock.module("../electron/main/martin-sync/service", () => ({
  getMartinSyncCredential: async () => ({
    baseUrl: "https://atelier.example.com",
    secret: "stc_test-only",
    scopes: ["martin"],
  }),
  createMartinHttpClient: () => ({
    getMartinContextBundle: async () => contextBundle(),
  }),
  getMartinSyncRuntime: () => ({
    getSettings: () => ({
      enabled: state.syncEnabled,
      resourceLinks: true,
      turnSummaries: false,
    }),
    resumeWorkspace: (workspaceId: string, projectRef?: string) => {
      state.runtimeCalls.push({
        method: "resumeWorkspace",
        args: { workspaceId, projectRef },
      });
    },
    discardWorkspaceEntries: (args: unknown) => {
      state.runtimeCalls.push({ method: "discardWorkspaceEntries", args });
      return 0;
    },
  }),
  enqueueMartinSyncEvent: (args: {
    projectRef: string;
    event: { kind: string };
  }) => {
    state.enqueuedEvents.push({
      projectRef: args.projectRef,
      kind: args.event.kind,
    });
  },
  noteMartinWorkspaceLinksChanged: () => {},
}));

const { linkMartinProject, refreshMartinContext, unlinkMartinProject } =
  await import("../electron/main/martin-sync/project-link");

function activeLink(
  overrides?: Partial<WorkspaceMartinProjectLink>,
): WorkspaceMartinProjectLink {
  return {
    ref: "sync-outbox",
    slug: "sync-outbox",
    name: "Sync outbox",
    url: "https://atelier.example.com/apps/martin/p/sync-outbox",
    linkedAt: "2026-08-01T00:00:00.000Z",
    lastPulledAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Martin project link lifecycle", () => {
  beforeEach(() => {
    state.bundleStatus = "active";
    state.martinProject = null;
    state.runtimeCalls = [];
    state.enqueuedEvents = [];
    state.savedProjects = [];
    state.syncEnabled = true;
  });

  test("rejects archived projects before any local state is written", async () => {
    state.bundleStatus = "archived";

    expect(
      linkMartinProject({
        workspaceId: "workspace-1",
        projectRef: "sync-outbox",
      }),
    ).rejects.toThrow("martin_project_archived");

    await Bun.sleep(0);
    expect(state.savedProjects).toEqual([]);
    expect(state.runtimeCalls).toEqual([]);
    expect(state.enqueuedEvents).toEqual([]);
  });

  test("discards other projects' rows and resumes only the linked project", async () => {
    await linkMartinProject({
      workspaceId: "workspace-1",
      projectRef: "sync-outbox",
    });

    expect(state.runtimeCalls).toEqual([
      {
        method: "discardWorkspaceEntries",
        args: {
          workspaceId: "workspace-1",
          exceptProjectRef: "sync-outbox",
        },
      },
      {
        method: "resumeWorkspace",
        args: { workspaceId: "workspace-1", projectRef: "sync-outbox" },
      },
    ]);
    expect(state.enqueuedEvents).toEqual([
      { projectRef: "sync-outbox", kind: "workspace_linked" },
    ]);
  });

  test("discards the unlinked project's rows before queueing the farewell event", async () => {
    state.martinProject = activeLink();

    await unlinkMartinProject({ workspaceId: "workspace-1" });

    expect(state.runtimeCalls).toEqual([
      {
        method: "discardWorkspaceEntries",
        args: { workspaceId: "workspace-1", projectRef: "sync-outbox" },
      },
    ]);
    expect(state.enqueuedEvents).toEqual([
      { projectRef: "sync-outbox", kind: "workspace_unlinked" },
    ]);
  });

  test("discards a stale project's rows and queues nothing", async () => {
    state.martinProject = activeLink({ stale: true });

    await unlinkMartinProject({ workspaceId: "workspace-1" });

    expect(state.runtimeCalls).toEqual([
      {
        method: "discardWorkspaceEntries",
        args: { workspaceId: "workspace-1", projectRef: "sync-outbox" },
      },
    ]);
    expect(state.enqueuedEvents).toEqual([]);
  });

  test("refresh keeps an archived project stale and never resumes its outbox", async () => {
    state.martinProject = activeLink({ stale: true });
    state.bundleStatus = "archived";

    const result = await refreshMartinContext({ workspaceId: "workspace-1" });

    expect(result.project.stale).toBe(true);
    expect(state.savedProjects).toMatchObject([{ stale: true }]);
    expect(state.runtimeCalls).toEqual([]);
  });

  test("refresh clears the stale flag once the project is active again", async () => {
    state.martinProject = activeLink({ stale: true });

    const result = await refreshMartinContext({ workspaceId: "workspace-1" });

    expect(result.project.stale).toBeUndefined();
    expect(state.runtimeCalls).toEqual([
      {
        method: "resumeWorkspace",
        args: { workspaceId: "workspace-1", projectRef: "sync-outbox" },
      },
    ]);
  });
});
