import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { workspaceCleanupRecommendation, workspaceCleanupBlocker, parseWorkspaceDiskBytes, cleanupWorktreeResultKey, type CleanupState } from "@/lib/workspace-cleanup";
import { listRepositoryWorktrees, parseGitWorktrees } from "@/lib/source-control-worktrees";
import { quoteWorkspaceShellArgument } from "@/store/workspace-archive-cleanup";
import { uniqueResourceProcesses } from "@/lib/performance/resource-manager";

const state: CleanupState = {
  repositoryPath: "/tmp/project", workspaces: [{ id: "old", name: "old", updatedAt: "2026-01-01" }],
  workspacePathById: { old: "/tmp/project/old" }, workspaceDefaultById: {},
  activeWorkspaceId: "current", activeTurnIdsByTask: {}, taskWorkspaceIdById: {}, notifications: [],
};
const blocker = (overrides: Partial<CleanupState> = {}) => workspaceCleanupBlocker({ ...state, ...overrides }, "/tmp/project", "old", "/tmp/project/old");

describe("workspace cleanup guards", () => {
  test("allows a stable inactive workspace and refuses changed ownership", () => {
    expect(blocker()).toBeNull();
    expect(blocker({ repositoryPath: "/tmp/other" })).toBe("Workspace changed");
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
    const result = (stdout: string, path: string) => cleanupWorktreeResultKey({ linked: false, listed: parseGitWorktrees({ stdout }), path });
    expect(result("worktree /tmp/project/older\0HEAD abc\0\0", "/tmp/project/old")).toBe("workspace:cleanupDialog.operations.results.worktreeRemoved");
    expect(result("worktree /tmp/project/old\0HEAD abc\0\0", "/tmp/project/old")).toBe("workspace:cleanupDialog.operations.results.worktreeKept");
  });
  test("a worktree Git lists through a resolved symbolic link is still kept", async () => {
    const listing = "worktree /private/var/T/project\0HEAD abc\0branch refs/heads/main\0\0worktree /private/var/T/project/.stave/workspaces/old\0HEAD def\0branch refs/heads/old\0\0";
    const commands: string[] = [];
    const run = async ({ command }: { command: string }) => {
      commands.push(command);
      return command === "pwd -P" ? { ok: true, stdout: "/private/var/T/project\n" } : { ok: true, stdout: listing };
    };
    const listed = await listRepositoryWorktrees({ repositoryPath: "/var/T/project", run, nulSeparated: true });
    expect(commands).toEqual(["git worktree list --porcelain -z", "pwd -P"]);
    const result = (path: string) => cleanupWorktreeResultKey({ linked: false, listed, path });
    // Saved in the registered form or, before alignment existed, in Git's form.
    expect(result("/var/T/project/.stave/workspaces/old")).toBe("workspace:cleanupDialog.operations.results.worktreeKept");
    expect(result("/private/var/T/project/.stave/workspaces/old")).toBe("workspace:cleanupDialog.operations.results.worktreeKept");
    expect(result("/var/T/project/.stave/workspaces/gone")).toBe("workspace:cleanupDialog.operations.results.worktreeRemoved");
  });
  test("a remaining worktree whose path ends in a space or a newline is reported kept", () => {
    const listed = parseGitWorktrees({ stdout: "worktree /tmp/project\0\0worktree /tmp/project/old \0HEAD a\0\0worktree /tmp/project/odd\n\0HEAD b\0\0" });
    expect(cleanupWorktreeResultKey({ linked: false, listed, path: "/tmp/project/old " })).toBe("workspace:cleanupDialog.operations.results.worktreeKept");
    expect(cleanupWorktreeResultKey({ linked: false, listed, path: "/tmp/project/odd\n" })).toBe("workspace:cleanupDialog.operations.results.worktreeKept");
    expect(cleanupWorktreeResultKey({ linked: false, listed, path: "/tmp/project/odd" })).toBe("workspace:cleanupDialog.operations.results.worktreeRemoved");
  });
  test("matching paths need no extra read, Windows separators compare equal, and unknown lists stay unverified", async () => {
    const commands: string[] = [];
    const run = async ({ command }: { command: string }) => {
      commands.push(command);
      return { ok: true, stdout: "worktree C:/repo\0\0worktree C:/repo/.stave/workspaces/old\0\0" };
    };
    const listed = await listRepositoryWorktrees({ repositoryPath: "C:\\repo", run, nulSeparated: true });
    expect(commands).toEqual(["git worktree list --porcelain -z"]);
    expect(cleanupWorktreeResultKey({ linked: false, listed, path: "C:\\repo\\.stave\\workspaces\\old" })).toBe("workspace:cleanupDialog.operations.results.worktreeKept");
    expect(cleanupWorktreeResultKey({ linked: false, listed, path: "C:\\repo\\.stave\\workspaces\\gone" })).toBe("workspace:cleanupDialog.operations.results.worktreeRemoved");
    expect(cleanupWorktreeResultKey({ linked: false, listed: null, path: "/tmp/project/old" })).toBe("workspace:cleanupDialog.operations.results.unverified");
    expect(cleanupWorktreeResultKey({ linked: true, listed, path: "/elsewhere" })).toBe("workspace:cleanupDialog.operations.results.externalKept");
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
