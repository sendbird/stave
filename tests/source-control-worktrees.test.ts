import { describe, expect, test } from "bun:test";
import { isBranchAttachedElsewhere, normalizeComparablePath, parseGitWorktrees, parseWorktreePathByBranch } from "../src/lib/source-control-worktrees";

describe("parseGitWorktrees", () => {
  test("parses branch-backed and detached worktrees from porcelain output", () => {
    const stdout = [
      "worktree /tmp/stave-project",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
      "HEAD def456",
      "branch refs/heads/feature/perf",
      "",
      "worktree /tmp/stave-project/.stave/workspaces/detached",
      "HEAD fedcba",
      "detached",
    ].join("\n");

    expect(parseGitWorktrees({ stdout })).toEqual([
      {
        path: "/tmp/stave-project",
        branch: "main",
        detached: false,
      },
      {
        path: "/tmp/stave-project/.stave/workspaces/feature__perf",
        branch: "feature/perf",
        detached: false,
      },
      {
        path: "/tmp/stave-project/.stave/workspaces/detached",
        branch: null,
        detached: true,
      },
    ]);
  });
});

describe("parseWorktreePathByBranch", () => {
  test("maps checked-out branches to their worktree paths", () => {
    const stdout = [
      "worktree /tmp/stave-project",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
      "HEAD def456",
      "branch refs/heads/feature/perf",
      "",
      "worktree /tmp/stave-project/.stave/workspaces/detached",
      "HEAD fedcba",
      "detached",
    ].join("\n");

    expect(parseWorktreePathByBranch({ stdout })).toEqual({
      main: "/tmp/stave-project",
      "feature/perf": "/tmp/stave-project/.stave/workspaces/feature__perf",
    });
  });
});

describe("isBranchAttachedElsewhere", () => {
  test("treats the current worktree path as available and other worktree paths as blocked", () => {
    const worktreePathByBranch = {
      main: "/tmp/stave-project/",
      "feature/perf": "/tmp/stave-project/.stave/workspaces/feature__perf",
    };

    expect(normalizeComparablePath("/tmp/stave-project/")).toBe("/tmp/stave-project");
    expect(isBranchAttachedElsewhere({
      branch: "main",
      workspacePath: "/tmp/stave-project",
      worktreePathByBranch,
    })).toBe(false);
    expect(isBranchAttachedElsewhere({
      branch: "feature/perf",
      workspacePath: "/tmp/stave-project",
      worktreePathByBranch,
    })).toBe(true);
  });
});
