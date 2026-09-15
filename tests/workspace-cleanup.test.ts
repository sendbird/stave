import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { workspaceCleanupRecommendation, workspaceCleanupBlocker, parseWorkspaceDiskBytes, worktreeListContainsPath, type CleanupState } from "@/lib/workspace-cleanup";
import { quoteWorkspaceShellArgument } from "@/store/workspace-archive-cleanup";
import { uniqueResourceProcesses } from "@/lib/performance/resource-manager";

const state: CleanupState = {
  projectPath: "/tmp/project", workspaces: [{ id: "old", name: "old", updatedAt: "2026-01-01" }],
  workspacePathById: { old: "/tmp/project/old" }, workspaceDefaultById: {},
  activeWorkspaceId: "current", activeTurnIdsByTask: {}, taskWorkspaceIdById: {}, notifications: [],
};
const blocker = (overrides: Partial<CleanupState> = {}) => workspaceCleanupBlocker({ ...state, ...overrides }, "/tmp/project", "old", "/tmp/project/old");

describe("workspace cleanup guards", () => {
  test("allows a stable inactive workspace and refuses changed ownership", () => {
    expect(blocker()).toBeNull();
    expect(blocker({ projectPath: "/tmp/other" })).toBe("Workspace changed");
    expect(blocker({ workspaces: [] })).toBe("Workspace changed");
    expect(blocker({ workspacePathById: { old: "/tmp/other" } })).toBe("Workspace changed");
  });
  test("protects current, default and active provider workspaces", () => {
    expect(blocker({ activeWorkspaceId: "old" })).toBe("Current workspace");
    expect(blocker({ workspaceDefaultById: { old: true } })).toBe("Default workspace");
    expect(blocker({ activeTurnIdsByTask: { task: "turn" }, taskWorkspaceIdById: { task: "old" } })).toBe("Agent running");
    expect(blocker({ activeTurnIdsByTask: { task: "turn" }, taskWorkspaceIdById: { task: "another" } })).toBeNull();
  });
  test("does not guess disk size or confuse similarly prefixed worktree paths", () => {
    expect(parseWorkspaceDiskBytes("1024\t.\n")).toBe(1048576);
    expect(parseWorkspaceDiskBytes("du: permission denied")).toBeNull();
    expect(parseWorkspaceDiskBytes("12\t.\n12\tother")).toBeNull();
    expect(worktreeListContainsPath("worktree /tmp/project/older\0HEAD abc\0\0", "/tmp/project/old")).toBe(false);
    expect(worktreeListContainsPath("worktree /tmp/project/old\0HEAD abc\0\0", "/tmp/project/old")).toBe(true);
  });
  test("passes shell metacharacters as literal path data", () => {
    const value = "/tmp/workspace ' quote $(printf expanded) `printf expanded`\nnext";
    const result = spawnSync("/bin/sh", ["-c", `printf '%s' ${quoteWorkspaceShellArgument(value)}`], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(value);
  });
  test("counts host processes already present in Electron metrics once", () => {
    const host = { pid: 1, label: "Host", rssBytes: 100, cpu: null };
    const child = { pid: 2, label: "Provider", rssBytes: 50, cpu: null };
    expect(uniqueResourceProcesses([host, child, host]).reduce((sum, p) => sum + p.rssBytes, 0)).toBe(150);
  });
});

test("cleanup recommendations require recent merge evidence and no unpushed commits", () => {
  const args = { lastActive: "2026-01-01", prState: "MERGED", prCheckedAt: Date.parse("2026-02-01"), unpushed: 0, now: Date.parse("2026-02-01") };
  expect(workspaceCleanupRecommendation(args)).toContain("PR merged");
  for (const change of [{ unpushed: 1 }, { unpushed: null }, { prState: "OPEN" }, { prCheckedAt: args.now - 3600_000 }, { lastActive: null }, { lastActive: "2026-01-31" }]) {
    expect(workspaceCleanupRecommendation({ ...args, ...change })).toBeNull();
  }
});
