import { describe, expect, test } from "bun:test";
import { registerWorkspaceCleanupTools, selectWorkspaceCleanupRows, WORKSPACE_CLEANUP_TOOL_NAMES } from "../electron/main/stave-workspace-cleanup-tools";
import { isAlwaysAllowedStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";
import { DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS, READ_ONLY_DELEGATION_STAVE_TOOLS } from "../src/lib/runs/read-only-delegation";
import type { WorkspaceCleanupActArgs, WorkspaceCleanupRow } from "../src/lib/workspace-cleanup-contract";

const REPO = "/tmp/project";
const row = (patch: Partial<WorkspaceCleanupRow>): WorkspaceCleanupRow => ({ id: "w1", repositoryPath: REPO, repositoryName: "project", name: "Fix search",
  path: `${REPO}/.stave/workspaces/fix-search`, branch: "fix/search", archived: false, branchOnly: false, readOnly: false, archivedAt: null,
  lastActive: null, blockers: [], reasons: ["prMerged"], bytes: null, branchDeletable: true, ...patch });

type Handler = (input: Record<string, unknown>) => Promise<{ structuredContent: Record<string, unknown> }>;
function fakeServer() {
  const tools = new Map<string, { description: string; handler: Handler }>();
  return { tools, registerTool: (name: string, config: { description: string }, handler: Handler) => { tools.set(name, { description: config.description, handler }); } };
}

function setup(rows: WorkspaceCleanupRow[], result: { ok: boolean; reason: string | null } = { ok: true, reason: null }) {
  const server = fakeServer();
  const acts: WorkspaceCleanupActArgs[] = [];
  registerWorkspaceCleanupTools(server as never, {
    list: async () => ({ rows, policy: { merged: { enabled: false, value: 1 }, inactive: { enabled: false, value: 30 }, archived: { enabled: false, value: 30 }, maximum: { enabled: false, value: 10 } }, recent: [] }),
    act: async (args) => { acts.push(args); return { ...result, workspaceId: args.workspaceId, action: args.action, workspaceName: "Fix search" }; },
  });
  return { tools: server.tools, acts };
}

describe("workspace cleanup MCP tools", () => {
  test("lists workspaces with their blockers and finished signs, leaving out branches, archived workspaces and other projects", async () => {
    const { tools } = setup([row({}), row({ id: "w2", blockers: ["changedFiles"], reasons: [] }), row({ id: "w3", archived: true }),
      row({ id: "branch:old", branchOnly: true }), row({ id: "w4", repositoryPath: "/tmp/other" })]);
    const listed = (await tools.get("stave_list_workspace_cleanup")!.handler({ repositoryPath: `${REPO}/` })).structuredContent.workspaces as Array<Record<string, unknown>>;
    expect(listed.map((entry) => entry.workspaceId)).toEqual(["w1", "w2"]);
    expect(listed[0]).toMatchObject({ workspaceId: "w1", repositoryPath: REPO, branch: "fix/search", blockers: [], reasons: ["prMerged"], branchDeletable: true });
    expect(listed[1]).toMatchObject({ blockers: ["changedFiles"] });
    const all = (await tools.get("stave_list_workspace_cleanup")!.handler({ includeArchived: true })).structuredContent.workspaces as Array<Record<string, unknown>>;
    expect(all.map((entry) => entry.workspaceId)).toEqual(["w1", "w2", "w3", "w4"]);
  });

  test("archives through the host's cleanup action and never asks for a permanent delete, saved changes or a forced branch deletion", async () => {
    const { tools, acts } = setup([row({})]);
    const archived = await tools.get("stave_archive_workspace")!.handler({ repositoryPath: REPO, workspaceId: "w1", deleteBranch: true });
    expect(archived.structuredContent).toEqual({ archived: true, workspaceId: "w1", workspaceName: "Fix search", reason: null });
    await tools.get("stave_archive_workspace")!.handler({ repositoryPath: REPO, workspaceId: "w1" });
    expect(acts).toEqual([
      { action: "archive", repositoryPath: REPO, workspaceId: "w1", deleteBranch: true },
      { action: "archive", repositoryPath: REPO, workspaceId: "w1" },
    ]);
  });

  test("returns the host's refusal with its blocker codes", async () => {
    const { tools } = setup([row({})], { ok: false, reason: "changedFiles,unpushedCommits" });
    expect((await tools.get("stave_archive_workspace")!.handler({ repositoryPath: REPO, workspaceId: "w1" })).structuredContent)
      .toEqual({ archived: false, workspaceId: "w1", workspaceName: "Fix search", reason: "changedFiles,unpushedCommits" });
  });

  test("reading is allowed everywhere; archiving asks for approval and is denied to read-only runs", () => {
    expect([...WORKSPACE_CLEANUP_TOOL_NAMES]).toEqual(["stave_list_workspace_cleanup", "stave_archive_workspace"]);
    expect(isAlwaysAllowedStaveLocalMcpTool("stave_list_workspace_cleanup")).toBe(true);
    expect(isAlwaysAllowedStaveLocalMcpTool("stave_archive_workspace")).toBe(false);
    expect(READ_ONLY_DELEGATION_STAVE_TOOLS).toContain("stave_list_workspace_cleanup");
    expect(DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS).toContain("stave_archive_workspace");
  });

  test("filters by comparable project path", () => {
    expect(selectWorkspaceCleanupRows([row({})], { repositoryPath: "/tmp/project" })).toHaveLength(1);
    expect(selectWorkspaceCleanupRows([row({})], { repositoryPath: "/tmp/projects" })).toHaveLength(0);
  });
});
