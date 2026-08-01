import { describe, expect, test } from "bun:test";
import {
  claimGitGraphRequest,
  reconcileGitGraphSelection,
  releaseGitGraphRequest,
  resolveGitGraphReloadEffects,
  WORKING_TREE_SELECTION,
  type GitGraphRequestOwner,
  type GitGraphSelection,
} from "@/components/git-graph/useGitGraphData";
import type { GraphResult } from "@/lib/git-graph/types";

function graphResult(overrides: Partial<GraphResult> = {}): GraphResult {
  return {
    ok: true,
    commits: [],
    head: "main",
    headHash: null,
    availableRefs: [],
    workingTree: {
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
    },
    workingTreeAvailable: true,
    worktreePathByBranch: {},
    worktreePathsAvailable: true,
    hasMore: false,
    stderr: "",
    ...overrides,
  };
}

describe("Commit graph selection reconciliation", () => {
  test("clears a working-tree selection when refresh is clean or unavailable", () => {
    const selection: GitGraphSelection = {
      kind: WORKING_TREE_SELECTION,
    };

    expect(reconcileGitGraphSelection(selection, graphResult())).toBeNull();
    expect(
      reconcileGitGraphSelection(
        selection,
        graphResult({
          workingTree: {
            staged: 1,
            unstaged: 0,
            untracked: 0,
            conflicts: 0,
          },
          workingTreeAvailable: false,
        }),
      ),
    ).toBeNull();
  });

  test("retains only selections still represented by the refreshed graph", () => {
    const workingTreeSelection: GitGraphSelection = {
      kind: WORKING_TREE_SELECTION,
    };
    const commitSelection: GitGraphSelection = {
      kind: "commit",
      hash: "a".repeat(40),
    };
    const dirtyGraph = graphResult({
      commits: [
        {
          hash: "a".repeat(40),
          parents: [],
          subject: "feat: retained",
          author: "Ada",
          authorEmail: "ada@example.com",
          authorDate: "2026-07-31T00:00:00.000Z",
          committerDate: "2026-07-31T00:00:00.000Z",
          refs: [],
        },
      ],
      workingTree: {
        staged: 0,
        unstaged: 1,
        untracked: 0,
        conflicts: 0,
      },
    });

    expect(reconcileGitGraphSelection(workingTreeSelection, dirtyGraph)).toBe(
      workingTreeSelection,
    );
    expect(reconcileGitGraphSelection(commitSelection, dirtyGraph)).toBe(
      commitSelection,
    );
    expect(
      reconcileGitGraphSelection(
        { kind: "commit", hash: "b".repeat(40) },
        dirtyGraph,
      ),
    ).toBeNull();
  });
});

describe("Commit graph reload effects", () => {
  test("refetches working-tree files whenever that selection survives a reload", () => {
    const workingTree: GitGraphSelection = { kind: WORKING_TREE_SELECTION };

    expect(
      resolveGitGraphReloadEffects({
        previousSelection: workingTree,
        nextSelection: workingTree,
      }),
    ).toEqual({
      invalidateDetails: false,
      clearSelectionState: false,
      refetchWorkingTree: true,
    });
    expect(
      resolveGitGraphReloadEffects({
        previousSelection: null,
        nextSelection: workingTree,
      }),
    ).toEqual({
      invalidateDetails: false,
      clearSelectionState: false,
      refetchWorkingTree: true,
    });
  });

  test("leaves a surviving commit selection untouched", () => {
    const commit: GitGraphSelection = { kind: "commit", hash: "a".repeat(40) };

    expect(
      resolveGitGraphReloadEffects({
        previousSelection: commit,
        nextSelection: commit,
      }),
    ).toEqual({
      invalidateDetails: false,
      clearSelectionState: false,
      refetchWorkingTree: false,
    });
  });

  test("clears selection state and invalidates details only when a selection is dropped", () => {
    expect(
      resolveGitGraphReloadEffects({
        previousSelection: { kind: WORKING_TREE_SELECTION },
        nextSelection: null,
      }),
    ).toEqual({
      invalidateDetails: true,
      clearSelectionState: true,
      refetchWorkingTree: false,
    });
    expect(
      resolveGitGraphReloadEffects({
        previousSelection: null,
        nextSelection: null,
      }),
    ).toEqual({
      invalidateDetails: false,
      clearSelectionState: true,
      refetchWorkingTree: false,
    });
  });
});

describe("Commit graph request ownership", () => {
  test("blocks duplicate claims and keeps a replacement safe from stale cleanup", () => {
    const ownerRef: { current: GitGraphRequestOwner | null } = {
      current: null,
    };
    const paginationOwner = claimGitGraphRequest(ownerRef);

    expect(paginationOwner).not.toBeNull();
    expect(claimGitGraphRequest(ownerRef)).toBeNull();

    const reloadOwner = claimGitGraphRequest(ownerRef, { replace: true });
    expect(reloadOwner).not.toBeNull();
    expect(
      releaseGitGraphRequest(ownerRef, paginationOwner as GitGraphRequestOwner),
    ).toBe(false);
    expect(ownerRef.current).toBe(reloadOwner);
    expect(
      releaseGitGraphRequest(ownerRef, reloadOwner as GitGraphRequestOwner),
    ).toBe(true);
    expect(ownerRef.current).toBeNull();
  });
});
