import { describe, expect, test } from "bun:test";
import { registerWorkspaceCleanupTools, selectWorkspaceCleanupRows, WORKSPACE_CLEANUP_TOOL_NAMES } from "../electron/main/stave-workspace-cleanup-tools";
import { isAlwaysAllowedStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";
import { DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS, READ_ONLY_DELEGATION_STAVE_TOOLS } from "../src/lib/runs/read-only-delegation";
import type { SubAgentWorktreeRow, WorkspaceCleanupActArgs, WorkspaceCleanupRow } from "../src/lib/workspace-cleanup-contract";

const REPO = "/tmp/project";
const row = (patch: Partial<WorkspaceCleanupRow>): WorkspaceCleanupRow => ({ id: "w1", repositoryPath: REPO, repositoryName: "project", name: "Fix search",
  path: `${REPO}/.stave/workspaces/fix-search`, branch: "fix/search", archived: false, branchOnly: false, readOnly: false, archivedAt: null,
  lastActive: null, blockers: [], reasons: ["prMerged"], bytes: null, branchDeletable: true, ...patch });

type Handler = (input: Record<string, unknown>) => Promise<{ structuredContent: Record<string, unknown> }>;
function fakeServer() {
  const tools = new Map<string, { description: string; handler: Handler }>();
  return { tools, registerTool: (name: string, config: { description: string }, handler: Handler) => { tools.set(name, { description: config.description, handler }); } };
}

function setup(rows: WorkspaceCleanupRow[], result: { ok: boolean; reason: string | null } = { ok: true, reason: null }, subAgentWorktrees: SubAgentWorktreeRow[] = []) {
  const server = fakeServer();
  const acts: WorkspaceCleanupActArgs[] = [];
  const previewRequests: unknown[] = [];
  const list = async () => ({ rows, subAgentWorktrees, policy: { merged: { enabled: false, value: 1 }, inactive: { enabled: false, value: 30 }, archived: { enabled: false, value: 30 }, maximum: { enabled: false, value: 10 } }, recent: [] });
  registerWorkspaceCleanupTools(server as never, {
    list,
    preview: async (args) => { previewRequests.push(args); return list(); },
    act: async (args) => { acts.push(args); return { ...result, workspaceId: args.workspaceId, action: args.action, workspaceName: "Fix search" }; },
  });
  return { tools: server.tools, acts, previewRequests };
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

  test("lists sub-agent worktrees read-only and offers no tool that removes them", async () => {
    const agent = (patch: Partial<SubAgentWorktreeRow>): SubAgentWorktreeRow => ({ repositoryPath: REPO, repositoryName: "project", path: `${REPO}/.claude/worktrees/agent-a1`,
      name: "agent-a1", branch: "worktree-agent-a1", head: "abc", lastModified: "2026-11-01T00:00:00.000Z", blockers: [], bytes: 10, ...patch });
    const { tools, acts } = setup([row({})], undefined, [agent({}), agent({ path: "/tmp/other/.claude/worktrees/agent-b", repositoryPath: "/tmp/other", blockers: ["changedFiles"] })]);
    const listed = (await tools.get("stave_list_workspace_cleanup")!.handler({ repositoryPath: REPO })).structuredContent.subAgentWorktrees;
    expect(listed).toEqual([{ repositoryPath: REPO, path: `${REPO}/.claude/worktrees/agent-a1`, branch: "worktree-agent-a1", lastModified: "2026-11-01T00:00:00.000Z", blockers: [] }]);
    expect([...tools.keys()]).toEqual([...WORKSPACE_CLEANUP_TOOL_NAMES]);
    expect(acts).toEqual([]);
  });

  test("preview forwards the scope and returns measurements and blockers without calling an action", async () => {
    const preview = {
      dirty: true, branchMerge: "unmerged" as const, pullRequest: "merged" as const,
      disk: { bytes: 1024, partial: true, status: "measured" as const, measuredAt: "2026-11-25T00:00:00Z" },
    };
    const { tools, acts, previewRequests } = setup([row({ preview, blockers: ["changedFiles", "runningTurn"] })]);
    const report = await tools.get("stave_list_workspace_cleanup")!.handler({ repositoryPath: REPO, includeArchived: true, preview: true });
    expect(previewRequests).toEqual([{ repositoryPath: REPO, includeArchived: true }]);
    expect(report.structuredContent.workspaces).toMatchObject([{ preview, blockers: ["changedFiles", "runningTurn"] }]);
    expect(acts).toEqual([]);
  });

  test("filters by comparable project path", () => {
    expect(selectWorkspaceCleanupRows([row({})], { repositoryPath: "/tmp/project" })).toHaveLength(1);
    expect(selectWorkspaceCleanupRows([row({})], { repositoryPath: "/tmp/projects" })).toHaveLength(0);
  });
});
