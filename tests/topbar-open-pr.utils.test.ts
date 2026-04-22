import { describe, expect, test } from "bun:test";
import {
  buildCreatePrTargetBranchOptions,
  canApplyCreatePrDialogOpenChange,
  canSubmitCreatePr,
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

    expect(shouldShowCreatePrSubmitSpinner({
      step: "creating-pr",
      activeSubmitAction: "pr",
      buttonAction: "draft",
    })).toBe(false);
  });

  test("shows the spinner only on the clicked draft button while submitting", () => {
    expect(shouldShowCreatePrSubmitSpinner({
      step: "committing",
      activeSubmitAction: "draft",
      buttonAction: "draft",
    })).toBe(true);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "pushing",
      activeSubmitAction: "draft",
      buttonAction: "draft",
    })).toBe(true);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "creating-pr",
      activeSubmitAction: "draft",
      buttonAction: "draft",
    })).toBe(true);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "creating-pr",
      activeSubmitAction: "draft",
      buttonAction: "pr",
    })).toBe(false);
  });

  test("does not show a submit spinner outside of submission steps", () => {
    expect(shouldShowCreatePrSubmitSpinner({
      step: "ready",
      activeSubmitAction: "pr",
      buttonAction: "pr",
    })).toBe(false);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "loading",
      activeSubmitAction: "draft",
      buttonAction: "draft",
    })).toBe(false);

    expect(shouldShowCreatePrSubmitSpinner({
      step: "committing",
      activeSubmitAction: null,
      buttonAction: "pr",
    })).toBe(false);
  });
});

describe("canSubmitCreatePr", () => {
  test("allows non-conventional titles as long as the title is not empty", () => {
    expect(canSubmitCreatePr({
      step: "ready",
      title: "Improve PR title fallback behavior",
    })).toBe(true);
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
      title: "Improve PR title fallback behavior",
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
