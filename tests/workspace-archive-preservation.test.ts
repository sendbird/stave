import { describe, expect, test } from "bun:test";
import {
  buildWorkspaceArchivePreservationToast,
  resolveWorkspaceBranchToDelete,
} from "@/store/workspace-archive-cleanup";

describe("buildWorkspaceArchivePreservationToast", () => {
  test("explains that a dirty worktree kept both the worktree and the branch", () => {
    expect(
      buildWorkspaceArchivePreservationToast({
        reason: "dirty-worktree",
        workspaceName: "feature",
        workspaceBranch: "fix/archive",
      }),
    ).toEqual({
      title: "Worktree and branch kept",
      description:
        'Archived "feature", but kept its git worktree and branch "fix/archive" because it has uncommitted changes.',
    });
  });

  test("explains that a failed worktree removal blocked branch deletion", () => {
    expect(
      buildWorkspaceArchivePreservationToast({
        reason: "worktree-remove-failed",
        workspaceName: "feature",
        workspaceBranch: "fix/archive",
      }),
    ).toEqual({
      title: "Worktree removal failed",
      description:
        'Archived "feature", but could not remove its git worktree, so branch "fix/archive" was kept.',
    });
  });

  test("explains that branch deletion itself failed", () => {
    expect(
      buildWorkspaceArchivePreservationToast({
        reason: "branch-delete-failed",
        workspaceName: "feature",
        workspaceBranch: "fix/archive",
      }),
    ).toEqual({
      title: "Branch deletion failed",
      description:
        'Archived "feature", but could not delete branch "fix/archive".',
    });
  });

  test("falls back to generic wording when the name and branch are unknown", () => {
    expect(
      buildWorkspaceArchivePreservationToast({ reason: "dirty-worktree" })
        .description,
    ).toBe(
      "Archived the workspace, but kept its git worktree and its branch because it has uncommitted changes.",
    );
    expect(
      buildWorkspaceArchivePreservationToast({
        reason: "worktree-remove-failed",
      }).description,
    ).toBe(
      "Archived the workspace, but could not remove its git worktree, so its branch was kept.",
    );
    expect(
      buildWorkspaceArchivePreservationToast({ reason: "branch-delete-failed" })
        .description,
    ).toBe("Archived the workspace, but could not delete its branch.");
  });

  test("explains that the worktree branch could not be identified", () => {
    expect(
      buildWorkspaceArchivePreservationToast({
        reason: "branch-unresolved",
        workspaceName: "feature",
      }),
    ).toEqual({
      title: "Branch kept",
      description:
        'Archived "feature", but could not confirm which branch its git worktree had checked out, so no branch was deleted.',
    });
  });
});

describe("resolveWorkspaceBranchToDelete", () => {
  test("uses the worktree HEAD instead of the cached branch name", () => {
    expect(
      resolveWorkspaceBranchToDelete({
        headOk: true,
        headStdout: "feature/renamed\n",
        cachedBranch: "feature/stale",
      }),
    ).toEqual({
      branch: "feature/renamed",
      staleCachedBranch: "feature/stale",
    });
  });

  test("reports no staleness when the cache already matches HEAD", () => {
    expect(
      resolveWorkspaceBranchToDelete({
        headOk: true,
        headStdout: "fix/archive\n",
        cachedBranch: "fix/archive",
      }),
    ).toEqual({ branch: "fix/archive", staleCachedBranch: null });
  });

  test("refuses to fall back to the cached branch on a detached HEAD", () => {
    expect(
      resolveWorkspaceBranchToDelete({
        headOk: false,
        headStdout: "",
        cachedBranch: "fix/archive",
      }),
    ).toEqual({ branch: null, staleCachedBranch: "fix/archive" });
  });

  test("treats blank HEAD output as unresolved", () => {
    expect(
      resolveWorkspaceBranchToDelete({
        headOk: true,
        headStdout: "  \n",
        cachedBranch: "fix/archive",
      }).branch,
    ).toBeNull();
  });

  test("deletes the resolved branch even when no branch was cached", () => {
    expect(
      resolveWorkspaceBranchToDelete({
        headOk: true,
        headStdout: "feature/imported",
      }),
    ).toEqual({ branch: "feature/imported", staleCachedBranch: null });
  });
});
