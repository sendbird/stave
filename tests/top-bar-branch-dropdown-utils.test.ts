import { describe, expect, test } from "bun:test";
import {
  buildTopBarBranchGroups,
  normalizeRemoteBranchName,
  validateNewBranchName,
} from "@/components/layout/TopBarBranchDropdown.utils";

describe("TopBarBranchDropdown utils", () => {
  test("groups current, local, remote, and attached branches", () => {
    const groups = buildTopBarBranchGroups({
      branches: ["main", "feature/local", "review/held"],
      remoteBranches: ["origin/main", "origin/feature/remote", "origin/HEAD"],
      currentBranch: "main",
      query: "",
      workspacePath: "/repo",
      worktreePathByBranch: {
        main: "/repo",
        "review/held": "/repo-worktrees/review-held",
      },
    });

    expect(groups.map((group) => group.id)).toEqual([
      "current",
      "local",
      "remote",
      "attached",
    ]);
    expect(groups.find((group) => group.id === "current")?.options).toEqual([
      expect.objectContaining({
        displayName: "main",
        state: "current",
      }),
    ]);
    expect(groups.find((group) => group.id === "local")?.options).toEqual([
      expect.objectContaining({
        displayName: "feature/local",
        state: "available",
      }),
    ]);
    expect(groups.find((group) => group.id === "remote")?.options).toEqual([
      expect.objectContaining({
        displayName: "origin/feature/remote",
        localName: "feature/remote",
        kind: "remote",
      }),
    ]);
    expect(groups.find((group) => group.id === "attached")?.options).toEqual([
      expect.objectContaining({
        displayName: "review/held",
        state: "attached",
        attachedPath: "/repo-worktrees/review-held",
      }),
    ]);
  });

  test("filters by branch query across display and local names", () => {
    const groups = buildTopBarBranchGroups({
      branches: ["main", "feature/local"],
      remoteBranches: ["upstream/feature/server"],
      currentBranch: "main",
      query: "server",
      workspacePath: "/repo",
      worktreePathByBranch: {},
    });

    expect(groups).toEqual([
      expect.objectContaining({
        id: "remote",
        options: [
          expect.objectContaining({
            displayName: "upstream/feature/server",
            localName: "feature/server",
          }),
        ],
      }),
    ]);
  });

  test("normalizes remote branch names by dropping the remote prefix", () => {
    expect(normalizeRemoteBranchName("origin/feature/auth")).toBe("feature/auth");
    expect(normalizeRemoteBranchName("main")).toBe("main");
  });

  test("validates new branch names before invoking git", () => {
    expect(validateNewBranchName({ value: "", existingBranches: [] })).toBe(
      "Enter a branch name.",
    );
    expect(
      validateNewBranchName({ value: "feature bad", existingBranches: [] }),
    ).toBe("Branch names cannot contain spaces.");
    expect(
      validateNewBranchName({ value: "main", existingBranches: ["main"] }),
    ).toBe("A local branch with that name already exists.");
    expect(
      validateNewBranchName({ value: "feature..bad", existingBranches: [] }),
    ).toBe("Use a valid git branch name.");
    expect(
      validateNewBranchName({ value: "feature/good_name", existingBranches: [] }),
    ).toBeNull();
  });
});
