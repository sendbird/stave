import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationLocationFields } from "@/components/layout/automation-center/AutomationLocationFields";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createAutomationRuntime,
  type AutomationWorkspaceLocation,
} from "../electron/host-service/automation-runtime";
import {
  findAutomationWorkspace,
  resolveAutomationWorkspaceLocation,
} from "../electron/host-service/automation-workspace-location";
import { mcpAutomationCreateInput } from "../electron/main/stave-mcp-autonomy-guards";
import { buildEnvironmentOptions } from "@/components/layout/automation-center/automation-center.utils";
import {
  describeAutomationRunError,
  environmentForWorkspace,
  resolveAutomationLocation,
} from "@/components/layout/automation-center/automation-location";
import {
  AutomationRunSchema,
  AutomationUpsertInputSchema,
  createDefaultAutomationRuntime,
  createEmptyAutomationState,
  type AutomationState,
  type AutomationUpsertInput,
} from "@/lib/automations";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import type { RecentRepositoryState } from "@/store/repository.utils";

const ROOT: AutomationWorkspaceLocation = {
  workspaceId: "ws-root",
  name: "Default Workspace",
  path: "/tmp/project",
  branch: "main",
  repositoryPath: "/tmp/project",
  isDefault: true,
};
const FEATURE: AutomationWorkspaceLocation = {
  workspaceId: "ws-feature",
  name: "feature-search",
  path: "/tmp/project/.stave/workspaces/feature-search",
  branch: "feat/search",
  repositoryPath: "/tmp/project",
  isDefault: false,
};

function input(environment: Partial<AutomationUpsertInput["environment"]> = {}): AutomationUpsertInput {
  return {
    name: "Nightly review",
    prompt: "Review the branch.",
    enabled: false,
    schedule: { every: 1, unit: "days" },
    environment: {
      kind: "repository",
      workspaceId: "ws-root",
      path: "/tmp/project",
      repositoryPath: "/tmp/project",
      label: "project",
      ...environment,
    },
    runtime: createDefaultAutomationRuntime("codex"),
    trustPolicy: "review-required",
    maxConcurrentRuns: 1,
    informationReferences: [],
  };
}

function harness(workspaces: AutomationWorkspaceLocation[] = [ROOT, FEATURE]) {
  let state: AutomationState = createEmptyAutomationState();
  const runTaskCalls: Array<{ workspaceId: string }> = [];
  const known = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
  const runtime = createAutomationRuntime({
    persistence: {
      loadAutomationState: () => structuredClone(state),
      saveAutomationState: ({ state: next }) => {
        state = structuredClone(next);
      },
      loadAutomationProviderTimeoutMs: () => null,
      saveAutomationProviderTimeoutMs: () => {},
      completeTurn: () => {},
    },
    runTask: async (args) => {
      runTaskCalls.push({ workspaceId: args.workspaceId });
      return { workspaceId: args.workspaceId, taskId: "task-1", taskTitle: args.title, turnId: "turn-1", provider: args.provider, model: "m" };
    },
    getTaskStatus: async () => ({
      workspaceId: "ws", taskId: "task-1", activeTurnId: "turn-1", latestTurnId: "turn-1",
      latestTurnCompletedAt: null, latestTurnError: null, latestAssistantText: null, pendingApprovals: [], pendingUserInputs: [],
    }),
    getWorkspaceInformation: async ({ workspaceId }) => ({ workspaceId, workspaceInformation: createEmptyWorkspaceInformation() }),
    findWorkspace: async (workspaceId) => known.get(workspaceId) ?? null,
    now: () => new Date("2026-10-22T09:00:00.000Z"),
    setInterval: (() => 1) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => {}) as typeof globalThis.clearInterval,
  });
  return { runtime, runTaskCalls, known, getState: () => state };
}

describe("schedule location schema", () => {
  test("a stored location without a workspace is the Default workspace, and a named one keeps its name and branch", () => {
    expect(AutomationUpsertInputSchema.safeParse(input()).success).toBe(true);
    expect(AutomationUpsertInputSchema.parse(input({ workspaceId: "ws-feature", workspace: { name: "feature-search", branch: "feat/search" } }))
      .environment.workspace).toEqual({ name: "feature-search", branch: "feat/search" });
    expect(AutomationUpsertInputSchema.safeParse(input({ workspace: { name: " " } })).success).toBe(false);
    expect(AutomationUpsertInputSchema.safeParse(input({ workspace: { name: "x", path: "/elsewhere" } as never })).success).toBe(false);
  });

  test("runs saved before the error code existed still read, and a missing workspace has its own code", () => {
    const run = {
      id: "run-1", automationId: "a", workspaceId: "ws", repositoryPath: "/tmp/project", taskId: null, turnId: null,
      status: "failed", trigger: "manual", scheduledFor: null, startedAt: "2026-10-22T09:00:00.000Z",
      completedAt: "2026-10-22T09:00:00.000Z", resultPreview: null, error: "boom",
    };
    expect(AutomationRunSchema.safeParse(run).success).toBe(true);
    expect(AutomationRunSchema.safeParse({ ...run, errorCode: "workspace-missing" }).success).toBe(true);
    expect(AutomationRunSchema.safeParse({ ...run, errorCode: "other" }).success).toBe(false);
  });
});

describe("schedule location runtime", () => {
  test("saving names a chosen workspace with its path and branch, and the Default workspace with none", async () => {
    const { runtime } = harness();
    const chosen = await runtime.create(input({ workspaceId: "ws-feature" }));
    expect(chosen.environment).toEqual({
      kind: "repository",
      workspaceId: "ws-feature",
      path: FEATURE.path,
      repositoryPath: "/tmp/project",
      label: "project",
      workspace: { name: "feature-search", branch: "feat/search" },
    });
    const root = await runtime.update({ id: chosen.id, input: input({ workspaceId: "ws-root", workspace: { name: "stale" } }) });
    expect(root.environment.workspace).toBeUndefined();
    expect(root.environment.path).toBe("/tmp/project");
    const unknown = await runtime.create(input({ workspaceId: "ws-unknown", workspace: { name: "kept" } }));
    expect(unknown.environment.workspace).toEqual({ name: "kept" });
  });

  test("Run now and scheduled runs start in the stored workspace, never in the root", async () => {
    const { runtime, runTaskCalls } = harness();
    const automation = await runtime.create(input({ workspaceId: "ws-feature" }));
    const run = await runtime.runNow({ id: automation.id });
    expect(run).toMatchObject({ status: "running", workspaceId: "ws-feature" });
    expect(runTaskCalls).toEqual([{ workspaceId: "ws-feature" }]);
  });

  test("a workspace that is gone fails the run visibly before any task starts", async () => {
    const { runtime, runTaskCalls, known, getState } = harness();
    const automation = await runtime.create(input({ workspaceId: "ws-feature" }));
    known.delete("ws-feature");
    const run = await runtime.runNow({ id: automation.id });
    expect(run).toMatchObject({ status: "failed", errorCode: "workspace-missing", taskId: null });
    expect(run.error).toContain("no longer exists");
    expect(runTaskCalls).toEqual([]);
    expect(getState().runs[0]).toMatchObject({ errorCode: "workspace-missing" });
  });

  test("the registry lookup tells the Default workspace from a worktree", () => {
    const repository = {
      repositoryPath: "/tmp/project",
      repositoryName: "project",
      defaultBranch: "main",
      workspaces: [
        { id: "ws-feature", name: "feature-search", updatedAt: "2026-10-22T00:00:00.000Z" },
      ],
      workspaceBranchById: { "ws-feature": "feat/search" },
      workspacePathById: { "ws-feature": FEATURE.path },
      workspaceDefaultById: {},
    } as unknown as RecentRepositoryState;
    expect(resolveAutomationWorkspaceLocation([repository], "ws-feature")).toMatchObject({
      isDefault: false,
      path: FEATURE.path,
      branch: "feat/search",
    });
    expect(resolveAutomationWorkspaceLocation([repository], "ws-gone")).toBeNull();
  });
});

describe("a workspace without its own folder", () => {
  // A registry entry for a non-default workspace that names no folder, or the
  // repository root, would otherwise resolve to the root: the schedule would
  // run in, and change, the Default workspace's checkout.
  const registry = (root: string, feature: string) => ({
    repositoryPath: root,
    repositoryName: "project",
    defaultBranch: "main",
    workspaces: [
      { id: "ws-root", name: "Default Workspace", updatedAt: "" },
      { id: "ws-feature", name: "feature", updatedAt: "" },
      { id: "ws-nopath", name: "no-path", updatedAt: "" },
      { id: "ws-rootpath", name: "root-path", updatedAt: "" },
      { id: "ws-removed", name: "removed", updatedAt: "" },
    ],
    workspaceBranchById: { "ws-feature": "feat/x", "ws-nopath": "feat/y", "ws-rootpath": "feat/z", "ws-removed": "feat/r" },
    workspacePathById: {
      "ws-root": root,
      "ws-feature": feature,
      "ws-rootpath": `${root}/`,
      "ws-removed": path.join(root, "..", "removed-folder"),
    },
    workspaceDefaultById: { "ws-root": true },
  }) as unknown as RecentRepositoryState;

  test("is refused by the registry lookup, and a folder removed from disk is too", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "stave-schedule-location-"));
    try {
      const root = path.join(directory, "project");
      const feature = path.join(directory, "feature");
      await mkdir(root);
      await mkdir(feature);
      const repositories = [registry(root, feature)];
      expect(resolveAutomationWorkspaceLocation(repositories, "ws-nopath")).toBeNull();
      expect(resolveAutomationWorkspaceLocation(repositories, "ws-rootpath")).toBeNull();
      const load = async () => repositories;
      expect(await findAutomationWorkspace("ws-feature", load)).toMatchObject({ path: feature, isDefault: false });
      expect(await findAutomationWorkspace("ws-root", load)).toMatchObject({ path: root, isDefault: true });
      expect(await findAutomationWorkspace("ws-removed", load)).toBeNull();
      expect(await findAutomationWorkspace("ws-nopath", load)).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("fails the run before any task starts, so nothing runs in the root", async () => {
    const repositories = [registry("/tmp/project", "/tmp/feature")];
    const { runtime, runTaskCalls, known } = harness();
    known.clear();
    const lookup = (workspaceId: string) => resolveAutomationWorkspaceLocation(repositories, workspaceId);
    for (const workspaceId of ["ws-nopath", "ws-rootpath"]) {
      const automation = await runtime.create(input({ workspaceId, path: "/tmp/project" }));
      const location = lookup(workspaceId);
      if (location) known.set(workspaceId, location);
      const run = await runtime.runNow({ id: automation.id });
      expect(run).toMatchObject({ status: "failed", errorCode: "workspace-missing", taskId: null });
    }
    expect(runTaskCalls).toEqual([]);
  });

  test("is not offered by the window's picker, and a schedule naming it reads as missing", () => {
    const options = buildEnvironmentOptions({
      recentRepositories: [registry("/tmp/project", "/tmp/feature")],
      activeRepository: null,
    });
    expect(options[0]?.workspaces.map((workspace) => [workspace.workspaceId, workspace.path])).toEqual([
      ["ws-root", "/tmp/project"],
      ["ws-feature", "/tmp/feature"],
      ["ws-removed", path.join("/tmp/project", "..", "removed-folder")],
    ]);
    expect(resolveAutomationLocation(input({ workspaceId: "ws-nopath", workspace: { name: "no-path" } }).environment, options))
      .toMatchObject({ state: "missing", workspaceName: "no-path" });
  });
});

describe("schedule location through the Local MCP tools", () => {
  test("an agent's create call keeps old specs on the Default workspace and stores a named workspace paused", async () => {
    const { runtime, runTaskCalls } = harness();
    const server = new McpServer({ name: "test-stave", version: "1" });
    server.registerTool(
      "stave_create_automation",
      { inputSchema: { input: AutomationUpsertInputSchema } },
      async ({ input: spec }) => ({
        content: [{ type: "text", text: JSON.stringify(await runtime.create(mcpAutomationCreateInput(spec))) }],
      }),
    );
    const client = new Client({ name: "agent", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const call = async (spec: unknown) => {
      const result = await client.callTool({ name: "stave_create_automation", arguments: { input: spec } });
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      return { isError: result.isError === true, body: text };
    };
    const legacy = await call({ ...input(), enabled: true });
    expect(legacy.isError).toBe(false);
    expect(JSON.parse(legacy.body)).toMatchObject({ enabled: false, environment: { workspaceId: "ws-root" } });
    expect(JSON.parse(legacy.body).environment.workspace).toBeUndefined();
    const named = await call(input({ workspaceId: "ws-feature" }));
    expect(JSON.parse(named.body).environment).toMatchObject({ workspaceId: "ws-feature", workspace: { name: "feature-search" } });
    const invalid = await call(input({ workspace: { name: "" } }));
    expect(invalid.isError).toBe(true);
    expect(runTaskCalls).toEqual([]);
    await client.close();
    await server.close();
  });
});

describe("schedule location in the window", () => {
  const repository = {
    repositoryPath: "/tmp/project",
    repositoryName: "project",
    defaultBranch: "main",
    workspaces: [
      { id: "ws-root", name: "Default Workspace", updatedAt: "" },
      { id: "ws-zeta", name: "zeta", updatedAt: "" },
      { id: "ws-alpha", name: "alpha", updatedAt: "" },
    ],
    workspaceBranchById: { "ws-alpha": "feat/alpha", "ws-zeta": "feat/zeta" },
    workspacePathById: { "ws-root": "/tmp/project", "ws-alpha": "/tmp/alpha", "ws-zeta": "/tmp/zeta" },
    workspaceDefaultById: { "ws-root": true },
  } as unknown as RecentRepositoryState;
  const options = buildEnvironmentOptions({ recentRepositories: [repository], activeRepository: null });

  test("a repository lists its Default workspace first, then the others by name", () => {
    expect(options[0]?.workspaces.map((workspace) => [workspace.workspaceId, workspace.isDefault, workspace.branch])).toEqual([
      ["ws-root", true, "main"],
      ["ws-alpha", false, "feat/alpha"],
      ["ws-zeta", false, "feat/zeta"],
    ]);
  });

  test("a schedule reads as Default, a chosen workspace, missing, or unknown", () => {
    const alpha = environmentForWorkspace(options[0]!, options[0]!.workspaces[1]!);
    expect(alpha).toMatchObject({ workspaceId: "ws-alpha", path: "/tmp/alpha", workspace: { name: "alpha", branch: "feat/alpha" } });
    expect(resolveAutomationLocation(alpha, options)).toMatchObject({ state: "workspace", path: "/tmp/alpha", branch: "feat/alpha" });
    expect(resolveAutomationLocation(input().environment, options).state).toBe("default");
    expect(resolveAutomationLocation(input({ workspaceId: "ws-gone", workspace: { name: "gone" } }).environment, options))
      .toMatchObject({ state: "missing", workspaceName: "gone" });
    expect(resolveAutomationLocation(input({ repositoryPath: "/tmp/other" }).environment, options).state).toBe("unknown");
    expect(describeAutomationRunError({ error: "raw", errorCode: "workspace-missing" })).toContain("no longer exists");
    expect(describeAutomationRunError({ error: "raw" })).toBe("raw");
  });
});

describe("schedule location fields", () => {
  const repository = {
    repositoryPath: "/tmp/project",
    repositoryName: "project",
    defaultBranch: "main",
    workspaces: [
      { id: "ws-root", name: "Default Workspace", updatedAt: "" },
      { id: "ws-alpha", name: "alpha", updatedAt: "" },
    ],
    workspaceBranchById: { "ws-alpha": "feat/alpha" },
    workspacePathById: { "ws-root": "/tmp/project", "ws-alpha": "/tmp/alpha" },
    workspaceDefaultById: { "ws-root": true },
  } as unknown as RecentRepositoryState;
  const options = buildEnvironmentOptions({ recentRepositories: [repository], activeRepository: null });
  const render = (environment: Partial<AutomationUpsertInput["environment"]>) =>
    renderToStaticMarkup(createElement(AutomationLocationFields, {
      draft: input(environment),
      environmentOptions: options,
      onDraftChange: () => {},
    }));

  test("show the path, branch and permission a run gets, and warn when the workspace is gone", () => {
    const chosen = render({ workspaceId: "ws-alpha", path: "/tmp/alpha", workspace: { name: "alpha", branch: "feat/alpha" } });
    expect(chosen).toContain("/tmp/alpha");
    expect(chosen).toContain("feat/alpha");
    expect(chosen).toContain("Guided");
    expect(chosen).not.toContain("This workspace or its folder no longer exists");
    const gone = render({ workspaceId: "ws-gone", workspace: { name: "gone" } });
    expect(gone).toContain("This workspace or its folder no longer exists");
    expect(gone).toContain("gone");
  });
});
