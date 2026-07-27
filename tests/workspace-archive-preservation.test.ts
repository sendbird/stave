import { describe, expect, test } from "bun:test";
import { buildWorkspaceArchivePreservationToast } from "@/store/workspace-archive-cleanup";

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
});
