import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  continueWorkspaceOnNewBranch,
  isSafeContinueRef,
  splitRemoteRef,
} from "@/store/workspace-continue-here";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import type { AppState } from "@/store/app-store.types";
import type { GitHubPrPayload } from "@/lib/pr-status";

const MERGED_PR = {
  number: 701,
  title: "refactor(settings): one owner per setting",
  state: "MERGED",
  url: "https://github.com/example/repo/pull/701",
  mergedAt: "2026-10-08T10:00:00.000Z",
} as GitHubPrPayload;

type RunArgs = { cwd: string; command: string };

/** A store holding only what the flow reads and the actions it calls. */
function createHarness(args: {
  cwd: string;
  run: (input: RunArgs) => { ok: boolean; stdout?: string; stderr?: string };
  isDefault?: boolean;
}) {
  const commands: string[] = [];
  let information = createEmptyWorkspaceInformation();
  const fetched: string[] = [];
  let state = {
    activeWorkspaceId: "w",
    defaultBranch: "main",
    workspaceDefaultById: { w: Boolean(args.isDefault) },
    workspacePathById: { w: args.cwd },
    workspaceBranchById: { w: "feat/done" },
    workspacePrInfoById: { w: { pr: MERGED_PR, derived: "merged", lastFetched: 1 } },
    updateWorkspaceInformation: ({ updater }: { updater: (current: typeof information) => typeof information }) => {
      information = updater(information);
    },
    setWorkspaceBranch: ({ workspaceId, branch }: { workspaceId: string; branch: string }) => {
      state = { ...state, workspaceBranchById: { ...state.workspaceBranchById, [workspaceId]: branch } };
    },
    fetchWorkspacePrStatus: async ({ workspaceId }: { workspaceId: string }) => {
      fetched.push(workspaceId);
    },
  } as unknown as AppState;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      api: {
        terminal: {
          runCommand: async (input: RunArgs) => {
            commands.push(input.command);
            return { stdout: "", stderr: "", ...args.run(input) };
          },
        },
      },
    },
  });
  return {
    continueHere: (name: string, baseBranch?: string) =>
      continueWorkspaceOnNewBranch({
        get: () => state,
        set: (update) => {
          state = { ...state, ...(typeof update === "function" ? update(state) : update) } as AppState;
        },
        name,
        baseBranch,
      }),
    commands,
    fetched,
    state: () => state,
    information: () => information,
  };
}

describe("continue here: inputs", () => {
  test("only shell-inert ref names pass", () => {
    for (const ok of ["feat/x--continue--20261009-120000", "origin/main", "release-1.2"]) {
      expect(isSafeContinueRef(ok)).toBe(true);
    }
    for (const bad of ["", "-x", "a b", "a;b", "$(id)", "a'b", "a..b", "a//b", "a/.b", "x/", "x.lock", "x."]) {
      expect(isSafeContinueRef(bad)).toBe(false);
    }
  });

  test("a remote ref names its remote; a bare branch has none", () => {
    expect(splitRemoteRef("origin/main")).toEqual({ remote: "origin", branch: "main" });
    expect(splitRemoteRef("main")).toBeNull();
  });
});

describe("continue here: flow", () => {
  test("fetches, switches, keeps the old PR in the links, and moves the workspace", async () => {
    const harness = createHarness({ cwd: "/repo", run: () => ({ ok: true }) });
    const result = await harness.continueHere("feat/next");
    expect(result.ok).toBe(true);
    expect(result.noticeLevel).toBe("success");
    expect(harness.commands).toEqual([
      "git fetch 'origin' --prune",
      "git switch -c 'feat/next' 'origin/main'",
    ]);
    expect(harness.state().workspaceBranchById.w).toBe("feat/next");
    expect(harness.state().workspacePrInfoById.w).toBeUndefined();
    expect(harness.fetched).toEqual(["w"]);
    expect(harness.information().linkedPullRequests).toMatchObject([
      { url: MERGED_PR.url, status: "merged", title: MERGED_PR.title },
    ]);
  });

  test("starts from the local branch, with a warning, when the remote cannot be fetched", async () => {
    const harness = createHarness({
      cwd: "/repo",
      run: ({ command }) => (command.startsWith("git fetch") ? { ok: false, stderr: "offline" } : { ok: true }),
    });
    const result = await harness.continueHere("feat/next");
    expect(result).toMatchObject({ ok: true, noticeLevel: "warning" });
    expect(harness.commands.at(-1)).toBe("git switch -c 'feat/next' 'main'");
  });

  test("leaves everything as it was when git refuses the switch", async () => {
    const harness = createHarness({
      cwd: "/repo",
      run: ({ command }) =>
        command.startsWith("git switch") ? { ok: false, stderr: "would be overwritten" } : { ok: true },
    });
    const result = await harness.continueHere("feat/next");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("would be overwritten");
    expect(harness.state().workspaceBranchById.w).toBe("feat/done");
    expect(harness.state().workspacePrInfoById.w?.pr?.number).toBe(701);
    expect(harness.information().linkedPullRequests).toEqual([]);
  });

  test("refuses unsafe names and the default workspace before running anything", async () => {
    const unsafe = createHarness({ cwd: "/repo", run: () => ({ ok: true }) });
    expect((await unsafe.continueHere("feat/$(id)")).ok).toBe(false);
    expect((await unsafe.continueHere("feat/next", "origin/main;rm")).ok).toBe(false);
    expect(unsafe.commands).toEqual([]);
    const defaults = createHarness({ cwd: "/repo", run: () => ({ ok: true }), isDefault: true });
    expect((await defaults.continueHere("feat/next")).ok).toBe(false);
    expect(defaults.commands).toEqual([]);
  });
});

describe("continue here: real git", () => {
  let root: string;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const shell = ({ cwd, command }: RunArgs) => {
    const run = spawnSync("sh", ["-c", command], { cwd, encoding: "utf8" });
    return { ok: run.status === 0, stdout: run.stdout, stderr: run.stderr };
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "stave-continue-here-"));
    const origin = path.join(root, "origin.git");
    const work = path.join(root, "work");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin], { stdio: "ignore" });
    execFileSync("git", ["clone", "-q", origin, work], { stdio: "ignore" });
    for (const [key, value] of [["user.email", "test@example.com"], ["user.name", "Test"]]) {
      git(work, "config", key, value);
    }
    await writeFile(path.join(work, "a.txt"), "base\n");
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "base");
    git(work, "push", "-q", "origin", "main");
    git(work, "switch", "-q", "-c", "feat/done");
    await writeFile(path.join(work, "b.txt"), "done\n");
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "done");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("moves the worktree to a new branch from origin/main and carries non-conflicting edits", async () => {
    const work = path.join(root, "work");
    await writeFile(path.join(work, "notes.txt"), "draft\n");
    const harness = createHarness({ cwd: work, run: shell });
    const result = await harness.continueHere("feat/next");
    expect(result.ok).toBe(true);
    expect(git(work, "branch", "--show-current")).toBe("feat/next");
    expect(git(work, "rev-parse", "HEAD")).toBe(git(work, "rev-parse", "origin/main"));
    // The untracked draft came along; the old branch still has its commit.
    expect(git(work, "status", "--porcelain")).toContain("notes.txt");
    expect(git(work, "log", "-1", "--format=%s", "feat/done")).toBe("done");
  });

  test("refuses a branch that already exists, leaving the checkout alone", async () => {
    const work = path.join(root, "work");
    const harness = createHarness({ cwd: work, run: shell });
    const result = await harness.continueHere("feat/done");
    expect(result.ok).toBe(false);
    expect(git(work, "branch", "--show-current")).toBe("feat/next");
  });
});
