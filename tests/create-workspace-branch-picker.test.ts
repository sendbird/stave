import { describe, expect, test } from "bun:test";
import {
  buildCreateWorkspaceBranchPickerRows,
  resolveDefaultCreateWorkspaceBaseBranch,
} from "../src/components/layout/CreateWorkspaceBranchPicker.utils";

describe("resolveDefaultCreateWorkspaceBaseBranch", () => {
  test("prefers the default remote branch when available", () => {
    expect(resolveDefaultCreateWorkspaceBaseBranch({
      activeBranch: "feature/searchable-base",
      defaultBranch: "main",
      localBranches: ["feature/searchable-base", "main"],
      remoteBranches: ["origin/main", "origin/master", "origin/release"],
    })).toBe("origin/main");
  });

  test("falls back to local default branch when no remote base exists", () => {
    expect(resolveDefaultCreateWorkspaceBaseBranch({
      activeBranch: "feature/searchable-base",
      defaultBranch: "master",
      localBranches: ["master", "feature/searchable-base"],
      remoteBranches: [],
    })).toBe("master");
  });

  test("uses a matching non-origin remote when that is the only remote default branch", () => {
    expect(resolveDefaultCreateWorkspaceBaseBranch({
      activeBranch: "feature/searchable-base",
      defaultBranch: "develop",
      localBranches: ["feature/searchable-base"],
      remoteBranches: ["upstream/develop", "origin/release"],
    })).toBe("upstream/develop");
  });
});

describe("buildCreateWorkspaceBranchPickerRows", () => {
  test("keeps remote branches ahead of local branches and prioritizes base branches", () => {
    expect(buildCreateWorkspaceBranchPickerRows({
      defaultBranch: "main",
      localBranches: ["feature/beta", "main", "feature/alpha"],
      remoteBranches: ["origin/feature/beta", "origin/main", "origin/master"],
    })).toEqual([
      { type: "label", key: "remote-label", label: "Remote branches", scope: "remote" },
      { type: "option", key: "remote:origin/main", option: { value: "origin/main", scope: "remote" } },
      { type: "option", key: "remote:origin/master", option: { value: "origin/master", scope: "remote" } },
      { type: "option", key: "remote:origin/feature/beta", option: { value: "origin/feature/beta", scope: "remote" } },
      { type: "label", key: "local-label", label: "Local branches", scope: "local" },
      { type: "option", key: "local:main", option: { value: "main", scope: "local" } },
      { type: "option", key: "local:feature/alpha", option: { value: "feature/alpha", scope: "local" } },
      { type: "option", key: "local:feature/beta", option: { value: "feature/beta", scope: "local" } },
    ]);
  });

  test("filters rows by query across local and remote branches", () => {
    expect(buildCreateWorkspaceBranchPickerRows({
      defaultBranch: "main",
      localBranches: ["main", "feature/alpha"],
      query: "alpha",
      remoteBranches: ["origin/main", "origin/feature/alpha"],
    })).toEqual([
      { type: "label", key: "remote-label", label: "Remote branches", scope: "remote" },
      { type: "option", key: "remote:origin/feature/alpha", option: { value: "origin/feature/alpha", scope: "remote" } },
      { type: "label", key: "local-label", label: "Local branches", scope: "local" },
      { type: "option", key: "local:feature/alpha", option: { value: "feature/alpha", scope: "local" } },
    ]);
  });

  test("hides scope labels when only one branch scope is present", () => {
    expect(buildCreateWorkspaceBranchPickerRows({
      defaultBranch: "main",
      localBranches: [],
      remoteBranches: ["origin/main", "origin/release"],
    })).toEqual([
      { type: "option", key: "remote:origin/main", option: { value: "origin/main", scope: "remote" } },
      { type: "option", key: "remote:origin/release", option: { value: "origin/release", scope: "remote" } },
    ]);
  });
});
