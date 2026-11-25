import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDelegatedWorkspaceCleanup,
  evaluateDelegatedChildCleanup,
  type DelegatedChildCleanupInput,
  type DelegatedChildGit,
  type DelegatedCleanupStore,
} from "../electron/host-service/delegated-workspace-cleanup";
import type { DelegatedWorkspaceLink } from "../src/lib/workspace-delegation-tree";
import type { WorkspaceCleanupRow } from "../src/lib/workspace-cleanup-contract";

// Real Git in temporary repositories only; nothing here touches another checkout.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}
const runner: DelegatedChildGit = async (cwd, args) => {
  const result = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout ?? "" };
};

let root: string;
let repo: string;
let parent: string;
let child: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "delegated-cleanup-"));
  repo = join(root, "repository");
  git(root, "init", "-b", "main", repo);
  writeFileSync(join(repo, ".gitignore"), "build/\n*.log\n");
  git(repo, "add", ".gitignore");
  git(repo, "commit", "-m", "initial");
  parent = join(root, "parent");
  git(repo, "worktree", "add", "-b", "parent-branch", parent);
  // The parent has local work of its own; the child starts from it.
  writeFileSync(join(parent, "parent.txt"), "parent");
  git(parent, "add", "parent.txt");
  git(parent, "commit", "-m", "parent work");
  child = join(root, "child");
  git(repo, "worktree", "add", "-b", "subagent-key", child, "parent-branch");
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const input = (overrides: Partial<DelegatedChildCleanupInput> = {}): DelegatedChildCleanupInput => ({
  phase: "completed", answerOwed: false, hasNestedChildren: false,
  childPath: child, childBranch: "subagent-key", parentPath: parent, defaultBranch: "main", ...overrides,
});
const commitInChild = (name: string) => {
  writeFileSync(join(child, name), name);
  git(child, "add", name);
  git(child, "commit", "-m", `child ${name}`);
};

describe("delegated child cleanup rules", () => {
  test("a finished, delivered, clean child with no commits of its own is eligible", async () => {
    expect(await evaluateDelegatedChildCleanup(runner, input())).toEqual({ eligible: true, kept: [] });
    // Stopped by the parent is final too.
    expect((await evaluateDelegatedChildCleanup(runner, input({ phase: "cancelled" }))).eligible).toBe(true);
  });

  test("a commit only the child has keeps it", async () => {
    commitInChild("result.txt");
    expect(await evaluateDelegatedChildCleanup(runner, input())).toEqual({ eligible: false, kept: ["subagentUniqueCommits"] });
  });

  test("a child commit merged into the parent's HEAD no longer keeps it", async () => {
    commitInChild("result.txt");
    git(parent, "merge", "--ff-only", "subagent-key");
    expect((await evaluateDelegatedChildCleanup(runner, input())).eligible).toBe(true);
  });

  test("a child commit reachable from the default branch no longer keeps it", async () => {
    commitInChild("result.txt");
    git(repo, "merge", "--no-edit", "subagent-key");
    expect((await evaluateDelegatedChildCleanup(runner, input())).eligible).toBe(true);
  });

  test("a commit on the child's HEAD that its branch lacks still counts", async () => {
    commitInChild("result.txt");
    git(parent, "merge", "--ff-only", "subagent-key");
    git(child, "checkout", "--detach");
    writeFileSync(join(child, "detached.txt"), "detached");
    git(child, "add", "detached.txt");
    git(child, "commit", "-m", "detached work");
    expect((await evaluateDelegatedChildCleanup(runner, input())).kept).toEqual(["subagentUniqueCommits"]);
  });

  test("uncommitted or untracked files keep it; ignored files do not", async () => {
    writeFileSync(join(child, "debug.log"), "ignored");
    expect((await evaluateDelegatedChildCleanup(runner, input())).eligible).toBe(true);
    writeFileSync(join(child, "notes.md"), "untracked");
    expect((await evaluateDelegatedChildCleanup(runner, input())).kept).toEqual(["subagentChangedFiles"]);
    rmSync(join(child, "notes.md"));
    writeFileSync(join(child, "parent.txt"), "edited");
    expect((await evaluateDelegatedChildCleanup(runner, input())).kept).toEqual(["subagentChangedFiles"]);
  });

  test("an undelivered result keeps it, and the reasons add up", async () => {
    commitInChild("result.txt");
    writeFileSync(join(child, "draft.md"), "draft");
    expect(await evaluateDelegatedChildCleanup(runner, input({ answerOwed: true, hasNestedChildren: true }))).toEqual({
      eligible: false, kept: ["subagentResultPending", "subagentHasNested", "subagentChangedFiles", "subagentUniqueCommits"],
    });
  });

  test("a working or retryable delegation is kept without reading Git", async () => {
    const calls: string[][] = [];
    const counting: DelegatedChildGit = async (cwd, args) => { calls.push(args); return runner(cwd, args); };
    for (const phase of ["pending", "running", "waiting"] as const) {
      expect((await evaluateDelegatedChildCleanup(counting, input({ phase }))).kept).toEqual(["subagentActive"]);
    }
    for (const phase of ["failed", "interrupted"] as const) {
      expect((await evaluateDelegatedChildCleanup(counting, input({ phase }))).kept).toEqual(["subagentRetryable"]);
    }
    expect(calls).toEqual([]);
  });

  test("a missing worktree or unreadable refs are never treated as clean", async () => {
    expect((await evaluateDelegatedChildCleanup(runner, input({ childPath: join(root, "gone") }))).kept).toEqual(["subagentChecksUnavailable"]);
    expect((await evaluateDelegatedChildCleanup(runner, input({ childBranch: "no-such-branch" }))).kept).toEqual(["subagentChecksUnavailable"]);
    // Nothing to compare against: neither a parent checkout nor a default branch.
    expect((await evaluateDelegatedChildCleanup(runner, input({ parentPath: null, defaultBranch: "no-default" }))).kept).toEqual(["subagentChecksUnavailable"]);
  });
});

describe("delegated child sweep", () => {
  const link = (overrides: Partial<DelegatedWorkspaceLink> = {}): DelegatedWorkspaceLink => ({
    childWorkspaceId: "ws-child", parentWorkspaceId: "ws-parent", parentTaskId: "parent-task", childTaskId: "child-task",
    phase: "completed", runId: "child-task:parent-task:key", createdAt: "2026-11-25T00:00:00.000Z", ...overrides,
  });
  function setup(options: { links?: DelegatedWorkspaceLink[]; owed?: boolean; blockers?: string[]; failed?: boolean } = {}) {
    const archived: string[] = [];
    let links = options.links ?? [link()];
    const store: DelegatedCleanupStore = {
      loadRepositoryRegistry: () => [{
        repositoryPath: repo, defaultBranch: "main",
        workspaces: [{ id: "ws-default", name: "Default" }, { id: "ws-parent", name: "Parent work" }, { id: "ws-child", name: "subagent-key" }],
        workspacePathById: { "ws-default": repo, "ws-parent": parent, "ws-child": child },
        workspaceBranchById: { "ws-default": "main", "ws-parent": "parent-branch", "ws-child": "subagent-key" },
      }],
      delegatedAnswers: { listWorkspaceLinks: () => links, hasOwedAnswer: () => options.owed ?? false },
    };
    const verified: Array<string | null> = [];
    const cleanup = createDelegatedWorkspaceCleanup({
      store: () => store, git: runner,
      blockers: async () => options.blockers ?? ["unpushedCommits"],
      archive: async (target, verify) => {
        const refused = await verify();
        verified.push(refused);
        if (!refused) archived.push(target.workspaceId);
        return { ok: !refused, action: "archive", workspaceId: target.workspaceId, reason: refused };
      },
      recentlyFailed: () => options.failed ?? false,
      delayMs: 0,
    });
    return { cleanup, archived, verified, setLinks: (next: DelegatedWorkspaceLink[]) => { links = next; } };
  }

  test("archives an eligible child through the archive action; unpushed commits alone do not block", async () => {
    const { cleanup, archived } = setup();
    expect((await cleanup.sweep()).map((result) => result.ok)).toEqual([true]);
    expect(archived).toEqual(["ws-child"]);
  });

  test("leaves a child whose result is owed, whose archive has other blockers, or that failed recently", async () => {
    for (const options of [{ owed: true }, { blockers: ["unpushedCommits", "terminalOpen"] }, { failed: true }, { links: [link({ phase: "running" })] }]) {
      const { cleanup, archived } = setup(options);
      expect(await cleanup.sweep()).toEqual([]);
      expect(archived).toEqual([]);
    }
  });

  test("the rules are checked again when the archive runs", async () => {
    const state = setup();
    // The child writes a file between the sweep's check and the archive's own check.
    const original = state.cleanup.recheck;
    writeFileSync(join(child, "late.md"), "late");
    expect(await original("ws-child", repo)).toBe("subagentChangedFiles");
    rmSync(join(child, "late.md"));
    state.setLinks([link({ phase: "running" })]);
    expect(await original("ws-child", repo)).toBe("subagentActive");
  });

  test("a parent with a nested child is kept until the child goes", async () => {
    const { cleanup, archived } = setup({ links: [link(), link({ childWorkspaceId: "ws-default", parentWorkspaceId: "ws-child", phase: "running", runId: "child-task:child-task:nested" })] });
    await cleanup.sweep();
    expect(archived).toEqual([]);
  });

  test("Clean up workspaces rows name the parent and what keeps the child", async () => {
    commitInChild("result.txt");
    const { cleanup } = setup({ owed: true });
    const row = (id: string): WorkspaceCleanupRow => ({ id, repositoryPath: repo, repositoryName: "repository", name: id, path: "", branch: "", archived: false, branchOnly: false,
      readOnly: false, archivedAt: null, lastActive: null, blockers: [], reasons: [], bytes: null, branchDeletable: false });
    const annotated = await cleanup.annotate([row("ws-parent"), row("ws-child")]);
    expect(annotated[0]!.subagent).toBeUndefined();
    expect(annotated[1]!.subagent).toEqual({ parentWorkspaceId: "ws-parent", parentName: "Parent work", kept: ["subagentResultPending", "subagentUniqueCommits"] });
  });

  test("the optional policies keep a child its delegation holds, after its parent is archived too, and a restored child", () => {
    // Links as the store reads them once the parent was archived: only cleanup's own read keeps it.
    const held = (links: DelegatedWorkspaceLink[], options: { owed?: boolean; restored?: boolean } = {}) => createDelegatedWorkspaceCleanup({
      store: () => ({
        loadRepositoryRegistry: () => [{ repositoryPath: repo, defaultBranch: "main", workspaces: [{ id: "ws-child", name: "subagent-key" }],
          workspacePathById: { "ws-child": child }, workspaceBranchById: { "ws-child": "subagent-key" } }],
        delegatedAnswers: {
          listWorkspaceLinks: (read?: { includeArchivedParents?: boolean }) => read?.includeArchivedParents ? links : [],
          hasOwedAnswer: () => options.owed ?? false,
        },
      }),
      git: runner, blockers: async () => [], archive: async () => { throw new Error("not archived here"); }, recentlyFailed: () => false,
      restoredByUser: () => options.restored ?? false,
    }).held("ws-child", repo);
    expect(held([link({ phase: "failed" })])).toBe("subagentRetryable");
    expect(held([link({ phase: "running" })])).toBe("subagentActive");
    expect(held([link()], { owed: true })).toBe("subagentResultPending");
    expect(held([link()], { restored: true })).toBe("subagentRestored");
    expect(held([link(), link({ childWorkspaceId: "ws-grandchild", parentWorkspaceId: "ws-child", runId: "child-task:child-task:nested" })])).toBe("subagentHasNested");
    expect(held([link()])).toBeNull();
    expect(held([])).toBeNull();
  });
});
