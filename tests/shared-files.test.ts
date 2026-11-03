import { beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentFleet, hasAgentFleetNumbers, sizeAgentFleetCard } from "@/components/ads/components/AgentFleet";
import { applyAppLocale } from "@/i18n";
import {
  computeSharedFiles,
  describeSharedFileChange,
  selectChildWorktrees,
} from "@/lib/delegation/shared-files";
import type { ScmReviewDiffResult } from "@/lib/review/review-diff-contract";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import {
  clearSharedFilesBaseCache,
  readWorktreeChanges,
  refreshSharedFiles,
  sharedFilesParentKey,
  useSharedFilesStore,
} from "@/store/shared-files-store";

const file = (path: string, status = "M") => ({ path, status });

describe("files shared between child worktrees", () => {
  test("a file two worktrees changed is one shared row", () => {
    const shared = computeSharedFiles([
      { workspaceId: "a", files: [file("a.ts"), file("only-a.ts")] },
      { workspaceId: "b", files: [file("a.ts", "A"), file("only-b.ts")] },
    ]);
    expect(shared).toEqual([
      { path: "a.ts", workspaceIds: ["a", "b"], fileByWorkspaceId: { a: file("a.ts"), b: file("a.ts", "A") } },
    ]);
  });

  test("worktrees with nothing in common share nothing", () => {
    expect(computeSharedFiles([
      { workspaceId: "a", files: [file("a.ts")] },
      { workspaceId: "b", files: [file("b.ts")] },
    ])).toEqual([]);
    expect(computeSharedFiles([{ workspaceId: "a", files: [file("a.ts")] }])).toEqual([]);
    expect(computeSharedFiles([])).toEqual([]);
  });

  test("a rename counts under its new path", () => {
    const shared = computeSharedFiles([
      { workspaceId: "a", files: [{ path: "src/new.ts", oldPath: "src/old.ts", status: "R100" }] },
      { workspaceId: "b", files: [file("src/new.ts")] },
      { workspaceId: "c", files: [file("src/old.ts")] },
    ]);
    expect(shared.map((entry) => [entry.path, entry.workspaceIds])).toEqual([["src/new.ts", ["a", "b"]]]);
  });

  test("the most shared files come first, then by path", () => {
    const shared = computeSharedFiles([
      { workspaceId: "a", files: [file("z.ts"), file("b.ts"), file("a.ts")] },
      { workspaceId: "b", files: [file("z.ts"), file("b.ts"), file("a.ts")] },
      { workspaceId: "c", files: [file("z.ts")] },
    ]);
    expect(shared.map((entry) => entry.path)).toEqual(["z.ts", "a.ts", "b.ts"]);
  });

  test("a file listed twice in one worktree still counts that worktree once", () => {
    const shared = computeSharedFiles([
      { workspaceId: "a", files: [file("a.ts"), file("a.ts")] },
      { workspaceId: "b", files: [file("b.ts")] },
    ]);
    expect(shared).toEqual([]);
  });

  test("a change reads as added, deleted, renamed or changed", () => {
    expect(["A", "??", "D", "R087", "M", "T", "C100"].map(describeSharedFileChange)).toEqual([
      "added", "added", "deleted", "renamed", "changed", "changed", "changed",
    ]);
  });
});

function child(key: string, workspaceId: string, createdAt: string): DelegatedTaskSummary {
  return {
    runId: `run-${key}`,
    stepId: `step-${key}`,
    parentTaskId: "parent",
    delegationKey: key,
    delegatedTaskId: `task-${key}`,
    delegatedWorkspaceId: workspaceId,
    delegatedTurnId: null,
    providerId: "claude-code",
    lifecycle: "one-turn",
    phase: "running",
    reason: null,
    attempt: 0,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  };
}

describe("child worktrees", () => {
  test("children in the parent's own workspace are not compared, and one worktree groups its children", () => {
    const worktrees = selectChildWorktrees({
      parentWorkspaceId: "parent-ws",
      children: [
        child("late", "ws-b", "2026-11-03T10:05:00.000Z"),
        child("reviewer", "parent-ws", "2026-11-03T10:00:00.000Z"),
        child("early", "ws-a", "2026-11-03T10:01:00.000Z"),
        child("follow-up", "ws-a", "2026-11-03T10:06:00.000Z"),
      ],
    });
    expect(worktrees.map((worktree) => [worktree.workspaceId, worktree.children.map((entry) => entry.delegationKey)])).toEqual([
      ["ws-a", ["early", "follow-up"]],
      ["ws-b", ["late"]],
    ]);
  });
});

function diff(overrides: Partial<ScmReviewDiffResult> = {}): ScmReviewDiffResult {
  return { ok: true, baseSha: "a".repeat(40), baseRef: "origin/main", headSha: "h".repeat(40), files: [], stderr: "", ...overrides };
}

describe("reading a worktree's changes", () => {
  beforeEach(() => clearSharedFilesBaseCache());

  test("the merge-base is read once per HEAD; a moved HEAD reads it again", async () => {
    const calls: string[] = [];
    let head = "h".repeat(40);
    const read = async (args: { base: { kind: string } }) => {
      calls.push(args.base.kind);
      return diff({ headSha: head, files: [{ path: "a.ts", status: "M", additions: 1, deletions: 0 }] });
    };
    await readWorktreeChanges({ workspaceId: "a", cwd: "/tmp/a", read });
    await readWorktreeChanges({ workspaceId: "a", cwd: "/tmp/a", read });
    expect(calls).toEqual(["merge-base", "commit"]);
    head = "g".repeat(40);
    await readWorktreeChanges({ workspaceId: "a", cwd: "/tmp/a", read });
    // The known base answered for another HEAD, so the merge-base is read again.
    expect(calls).toEqual(["merge-base", "commit", "commit", "merge-base"]);
  });

  test("an unknown folder is missing, a failed read says why, and neither throws", async () => {
    expect(await readWorktreeChanges({ workspaceId: "a", cwd: null, read: async () => diff() })).toEqual({ status: "missing", workspaceId: "a" });
    expect(await readWorktreeChanges({ workspaceId: "a", cwd: "/tmp/gone", read: async () => diff({ ok: false, baseSha: null, stderr: "fatal: not a git repository\n" }) }))
      .toEqual({ status: "failed", workspaceId: "a", message: "fatal: not a git repository" });
    expect(await readWorktreeChanges({ workspaceId: "a", cwd: "/tmp/a", read: async () => { throw new Error("bridge down"); } }))
      .toEqual({ status: "failed", workspaceId: "a", message: "bridge down" });
    expect(await readWorktreeChanges({ workspaceId: "a", cwd: "/tmp/a", read: null })).toEqual({ status: "failed", workspaceId: "a", message: "" });
  });

  test("a refresh records the shared files and leaves unreadable worktrees out", async () => {
    const parentKey = sharedFilesParentKey("parent-ws", "parent");
    const files: Record<string, ScmReviewDiffResult> = {
      "/tmp/a": diff({ files: [{ path: "a.ts", status: "M", additions: 1, deletions: 0 }] }),
      "/tmp/b": diff({ files: [{ path: "a.ts", status: "M", additions: 1, deletions: 0, untracked: true }] }),
    };
    await refreshSharedFiles({
      parentKey,
      worktrees: [{ workspaceId: "a", cwd: "/tmp/a" }, { workspaceId: "b", cwd: "/tmp/b" }, { workspaceId: "c", cwd: null }],
      read: async (args) => files[args.cwd]!,
      now: () => 42,
    });
    const entry = useSharedFilesStore.getState().byParent[parentKey]!;
    expect(entry.loading).toBe(false);
    expect(entry.readAt).toBe(42);
    expect(entry.shared.map((shared) => shared.path)).toEqual(["a.ts"]);
    expect(entry.shared[0]!.fileByWorkspaceId.b).toEqual({ path: "a.ts", status: "M", untracked: true });
    expect(entry.worktrees.c).toEqual({ status: "missing", workspaceId: "c" });
  });
});

describe("Fleet's count of shared files", () => {
  test("a main card with shared files shows the count on its numbers line", () => {
    applyAppLocale("en");
    const agent = { id: "a", name: "Add pagination", status: "running" as const, sharedFileCount: 2 };
    expect(hasAgentFleetNumbers(agent)).toBe(true);
    expect(sizeAgentFleetCard(agent, "main")).toBe("full");
    expect(hasAgentFleetNumbers({ ...agent, sharedFileCount: undefined })).toBe(false);
    const markup = renderToStaticMarkup(createElement(AgentFleet, { agents: [agent], open: null }));
    expect(markup).toContain("2 shared files");
    expect(renderToStaticMarkup(createElement(AgentFleet, { agents: [{ ...agent, sharedFileCount: 0 }], open: null }))).not.toContain("shared file");
  });
});
