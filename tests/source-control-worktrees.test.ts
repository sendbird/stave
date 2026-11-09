import { describe, expect, test } from "bun:test";
import { alignWorktreePaths, findListedWorktree, isBranchAttachedElsewhere, listRepositoryWorktrees, normalizeComparablePath, parseGitWorktrees, parseWorktreePathByBranch, worktreeComparablePaths } from "../src/lib/source-control-worktrees";

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

// Live verification found it: Git reports `/private/var/…` for a repository
// registered as `/var/…`, so a restart re-derived the host-created worktree's
// workspace id and Tars lost the work it held.
describe("worktree paths through a symbolic link", () => {
  const listing = [
    "worktree /private/var/folders/T/project",
    "HEAD abc123",
    "branch refs/heads/main",
    "",
    "worktree /private/var/folders/T/project/.stave/workspaces/tars__abc",
    "HEAD def456",
    "branch refs/heads/tars/abc",
    "",
    "worktree /elsewhere/other-checkout",
    "HEAD fedcba",
    "branch refs/heads/other",
  ].join("\n");

  test("rewrites paths inside the resolved repository into the registered path", () => {
    expect(alignWorktreePaths({ worktrees: parseGitWorktrees({ stdout: listing }), repositoryPath: "/var/folders/T/project",
      resolvedRepositoryPath: "/private/var/folders/T/project" }).map((entry) => entry.path)).toEqual([
      "/var/folders/T/project", "/var/folders/T/project/.stave/workspaces/tars__abc", "/elsewhere/other-checkout",
    ]);
  });

  test("keeps paths when the repository path has no link or the resolved path is unknown", () => {
    const worktrees = parseGitWorktrees({ stdout: listing });
    expect(alignWorktreePaths({ worktrees, repositoryPath: "/private/var/folders/T/project", resolvedRepositoryPath: "/private/var/folders/T/project" })).toEqual(worktrees);
    expect(alignWorktreePaths({ worktrees, repositoryPath: "/var/folders/T/project", resolvedRepositoryPath: null })).toEqual(worktrees);
    // A sibling whose name only starts with the repository's is not inside it.
    expect(alignWorktreePaths({ worktrees: [{ path: "/private/var/folders/T/project-2", branch: "x", detached: false }],
      repositoryPath: "/var/folders/T/project", resolvedRepositoryPath: "/private/var/folders/T/project" })[0]!.path).toBe("/private/var/folders/T/project-2");
  });

  test("lists in the registered form and reads the resolved path only when Git's main path differs", async () => {
    const commands: string[] = [];
    const run = async (args: { cwd?: string; command: string }) => {
      commands.push(args.command);
      return args.command === "pwd -P" ? { ok: true, stdout: "/private/var/folders/T/project\n" } : { ok: true, stdout: listing };
    };
    const listed = await listRepositoryWorktrees({ repositoryPath: "/var/folders/T/project", run });
    expect(listed?.map((entry) => entry.path)).toEqual(["/var/folders/T/project", "/var/folders/T/project/.stave/workspaces/tars__abc", "/elsewhere/other-checkout"]);
    expect(commands).toEqual(["git worktree list --porcelain", "pwd -P"]);
    commands.length = 0;
    await listRepositoryWorktrees({ repositoryPath: "/private/var/folders/T/project", run });
    expect(commands).toEqual(["git worktree list --porcelain"]);
    expect(await listRepositoryWorktrees({ repositoryPath: "/x", run: async () => ({ ok: false, stdout: "" }) })).toBeNull();
  });
});

test("an aligned worktree keeps Git's path so workspaces saved under it are neither gone nor imported twice", () => {
  const [main, linked] = alignWorktreePaths({
    worktrees: [{ path: "/private/var/repo", branch: "main", detached: false },
      { path: "/private/var/repo/.stave/workspaces/feature", branch: "feature", detached: false }],
    repositoryPath: "/var/repo", resolvedRepositoryPath: "/private/var/repo",
  });
  expect(linked).toMatchObject({ path: "/var/repo/.stave/workspaces/feature", gitPath: "/private/var/repo/.stave/workspaces/feature" });
  expect(worktreeComparablePaths(linked!)).toEqual(["/var/repo/.stave/workspaces/feature", "/private/var/repo/.stave/workspaces/feature"]);
  expect(worktreeComparablePaths(main!)).toContain("/var/repo");
  // Unaligned entries carry only their own path.
  expect(worktreeComparablePaths({ path: "/repo/a", branch: "a", detached: false })).toEqual(["/repo/a"]);
});


test("findListedWorktree matches either path form, Windows separators and nothing else", () => {
  const [main, linked] = alignWorktreePaths({
    worktrees: [{ path: "/private/var/repo", branch: "main", detached: false },
      { path: "/private/var/repo/.stave/workspaces/feature", branch: "feature", detached: false }],
    repositoryPath: "/var/repo", resolvedRepositoryPath: "/private/var/repo",
  });
  const listed = [main!, linked!];
  expect(findListedWorktree(listed, "/private/var/repo/.stave/workspaces/feature/")).toBe(linked!);
  expect(findListedWorktree(listed, "/var/repo/.stave/workspaces/feature")).toBe(linked!);
  expect(findListedWorktree(listed, "/private/var/repo")).toBe(main!);
  expect(findListedWorktree(listed, "/var/repo/.stave/workspaces/feat")).toBeNull();
  expect(findListedWorktree(listed, "")).toBeNull();
  // Already-matching paths behave exactly as a plain comparison.
  const windows = [{ path: "C:/repo/.stave/workspaces/a", branch: "a", detached: false }];
  expect(findListedWorktree(windows, "C:\\repo\\.stave\\workspaces\\a")).toBe(windows[0]!);
  expect(findListedWorktree(windows, "C:\\repo\\.stave\\workspaces\\b")).toBeNull();
});

test("parseGitWorktrees reads NUL-separated output, including a path with a newline", () => {
  expect(parseGitWorktrees({ stdout: "worktree /repo\0HEAD a\0branch refs/heads/main\0\0worktree /repo/odd\nname\0HEAD b\0detached\0\0" })).toEqual([
    { path: "/repo", branch: "main", detached: false },
    { path: "/repo/odd\nname", branch: null, detached: true },
  ]);
});

test("NUL-separated output keeps path bytes exactly: trailing spaces and newlines stay", () => {
  const stdout = "worktree /repo\0HEAD a\0branch refs/heads/main\0\0worktree /repo/trailing \0HEAD b\0detached\0\0worktree /repo/odd\n\0HEAD c\0detached\0\0";
  expect(parseGitWorktrees({ stdout }).map((entry) => entry.path)).toEqual(["/repo", "/repo/trailing ", "/repo/odd\n"]);
  // The newline form still trims, as before.
  expect(parseGitWorktrees({ stdout: "worktree /repo  \nHEAD a\n\n" }).map((entry) => entry.path)).toEqual(["/repo"]);
});
