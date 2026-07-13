import { describe, expect, test } from "bun:test";
import {
  buildCreatePrTargetBranchOptions,
  canApplyCreatePrDialogOpenChange,
  canSubmitCreatePr,
  haveSameCreatePrFileScope,
  isConventionalCommitMessage,
  shouldShowCreatePrSubmitSpinner,
} from "@/components/layout/TopBarOpenPR.utils";

describe("buildCreatePrTargetBranchOptions", () => {
  test("uses normalized origin branches for PR targets and excludes the current branch", () => {
    expect(buildCreatePrTargetBranchOptions({
      defaultBranch: "main",
      headBranch: "feature/create-pr-layout",
      remoteBranches: [
        "origin/feature/create-pr-layout",
        "origin/main",
        "origin/release",
        "upstream/develop",
      ],
    })).toEqual(["main", "release"]);
  });

  test("falls back to non-origin remotes when origin branches are unavailable", () => {
    expect(buildCreatePrTargetBranchOptions({
      defaultBranch: "develop",
      headBranch: "feature/create-pr-layout",
      remoteBranches: ["upstream/release", "upstream/develop"],
    })).toEqual(["develop", "release"]);
  });

  test("falls back to the default branch when no remote branches are available", () => {
    expect(buildCreatePrTargetBranchOptions({
      defaultBranch: "main",
      headBranch: "feature/create-pr-layout",
      remoteBranches: [],
    })).toEqual(["main"]);
  });

  test("shows the spinner only on the clicked create pr button while submitting", () => {
    expect(shouldShowCreatePrSubmitSpinner({
      step: "committing",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(true);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "pushing",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(true);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "creating-pr",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(true);
  });

  test("does not show a submit spinner outside of submission steps", () => {
    expect(shouldShowCreatePrSubmitSpinner({
      step: "ready",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(false);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "loading",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(false);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "reviewing",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(false);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "committing",
      activeSubmitAction: null,
      buttonAction: "pr",
    })).toBe(false);
  });
});

describe("canSubmitCreatePr", () => {
  test("allows a lowercase conventional title", () => {
    expect(canSubmitCreatePr({
      step: "ready",
      title: "fix(pr): improve title fallback behavior",
    })).toBe(true);
  });

  test("rejects non-conventional titles", () => {
    expect(canSubmitCreatePr({
      step: "ready",
      title: "Improve PR title fallback behavior",
    })).toBe(false);
  });

  test("rejects empty titles", () => {
    expect(canSubmitCreatePr({
      step: "ready",
      title: "   ",
    })).toBe(false);
  });

  test("rejects missing titles", () => {
    expect(canSubmitCreatePr({
      step: "ready",
    })).toBe(false);
  });

  test("rejects submission when the dialog is not ready", () => {
    expect(canSubmitCreatePr({
      step: "loading",
      title: "fix(pr): improve title fallback behavior",
    })).toBe(false);

    expect(canSubmitCreatePr({
      step: "reviewing",
      title: "fix(pr): improve title fallback behavior",
    })).toBe(false);
  });

  test("requires an explicit file selection when workspace changes are present", () => {
    expect(canSubmitCreatePr({
      step: "ready",
      title: "fix(pr): improve title fallback behavior",
      hasUncommittedChanges: true,
      selectedFileCount: 0,
    })).toBe(false);

    expect(canSubmitCreatePr({
      step: "ready",
      title: "fix(pr): improve title fallback behavior",
      hasUncommittedChanges: true,
      selectedFileCount: 1,
    })).toBe(true);
  });

  test("rejects a manually entered non-conventional commit message", () => {
    expect(canSubmitCreatePr({
      step: "ready",
      title: "fix(pr): improve title fallback behavior",
      commitMessage: "Update the PR flow",
    })).toBe(false);
  });
});

describe("isConventionalCommitMessage", () => {
  test("accepts supported types with an optional scope", () => {
    expect(isConventionalCommitMessage("fix(topbar): stabilize create pr flow")).toBe(true);
    expect(isConventionalCommitMessage("chore: update generated files\n\nDetails")).toBe(true);
  });

  test("rejects unsupported or empty messages", () => {
    expect(isConventionalCommitMessage("Update the PR flow")).toBe(false);
    expect(isConventionalCommitMessage("style: reformat files")).toBe(false);
    expect(isConventionalCommitMessage(" ")).toBe(false);
  });
});

describe("haveSameCreatePrFileScope", () => {
  test("compares paths as an unordered set", () => {
    expect(haveSameCreatePrFileScope({
      left: ["src/a.ts", "src/b.ts"],
      right: ["src/b.ts", "src/a.ts"],
    })).toBe(true);
  });

  test("detects files added or removed while the dialog is open", () => {
    expect(haveSameCreatePrFileScope({
      left: ["src/a.ts"],
      right: ["src/a.ts", "src/b.ts"],
    })).toBe(false);
  });
});

describe("canApplyCreatePrDialogOpenChange", () => {
  test("blocks dismiss attempts while the dialog is busy", () => {
    expect(canApplyCreatePrDialogOpenChange({
      open: false,
      isDialogBusy: true,
    })).toBe(false);
  });

  test("allows opening while the dialog is busy", () => {
    expect(canApplyCreatePrDialogOpenChange({
      open: true,
      isDialogBusy: true,
    })).toBe(true);
  });

  test("allows normal close events when the dialog is idle", () => {
    expect(canApplyCreatePrDialogOpenChange({
      open: false,
      isDialogBusy: false,
    })).toBe(true);
  });
});
