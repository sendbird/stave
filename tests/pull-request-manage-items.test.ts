import { describe, expect, test } from "bun:test";
import {
  createMergedArchiveToastTracker,
  planPullRequestEdit,
  pullRequestLifecycleFromState,
  pullRequestLifecycleFromStatus,
  resolvePullRequestManageItems,
} from "../src/components/layout/pull-request/pull-request-manage-items";
import type { WorkspacePrStatus } from "../src/lib/pr-status";

const OPEN_STATUSES: WorkspacePrStatus[] = [
  "draft",
  "review_required",
  "changes_requested",
  "checks_pending",
  "checks_failed",
  "merge_conflict",
  "behind_base",
  "blocked",
  "ready_to_merge",
];

function itemsFor(status: WorkspacePrStatus, options?: { autoMerge?: "on" | "off" | "checking" | "unknown"; hasWorkspace?: boolean }) {
  return resolvePullRequestManageItems({
    lifecycle: pullRequestLifecycleFromStatus(status),
    isDraft: status === "draft",
    autoMerge: options?.autoMerge ?? "off",
    hasWorkspace: options?.hasWorkspace ?? true,
  });
}

describe("manage menu items by status", () => {
  test("maps every status to a lifecycle", () => {
    expect(pullRequestLifecycleFromStatus("no_pr")).toBeNull();
    expect(pullRequestLifecycleFromStatus("merged")).toBe("merged");
    expect(pullRequestLifecycleFromStatus("closed_unmerged")).toBe("closed");
    for (const status of OPEN_STATUSES) expect(pullRequestLifecycleFromStatus(status)).toBe("open");
    expect(pullRequestLifecycleFromState("OPEN")).toBe("open");
    expect(pullRequestLifecycleFromState("CLOSED")).toBe("closed");
    expect(pullRequestLifecycleFromState("MERGED")).toBe("merged");
  });

  test("an open pull request can be edited, drafted, queued for auto-merge and closed", () => {
    for (const status of OPEN_STATUSES.filter((value) => value !== "draft")) {
      expect(itemsFor(status)).toEqual(["edit", "convert_to_draft", "auto_merge_on", "close"]);
    }
  });

  test("a draft is not offered Convert to draft", () => {
    expect(itemsFor("draft")).toEqual(["edit", "auto_merge_on", "close"]);
  });

  test("the auto-merge item follows the state read from GitHub", () => {
    expect(itemsFor("review_required", { autoMerge: "on" })).toEqual(["edit", "convert_to_draft", "auto_merge_off", "close"]);
    expect(itemsFor("review_required", { autoMerge: "checking" })).toEqual(["edit", "convert_to_draft", "auto_merge_checking", "close"]);
    // The state could not be read: no guess in either direction.
    expect(itemsFor("review_required", { autoMerge: "unknown" })).toEqual(["edit", "convert_to_draft", "close"]);
  });

  test("a closed pull request can only be reopened", () => {
    expect(itemsFor("closed_unmerged", { autoMerge: "on" })).toEqual(["reopen"]);
  });

  test("a merged pull request offers archiving its workspace, when there is one", () => {
    expect(itemsFor("merged")).toEqual(["archive_workspace"]);
    expect(itemsFor("merged", { hasWorkspace: false })).toEqual([]);
  });

  test("no pull request, no items", () => {
    expect(itemsFor("no_pr")).toEqual([]);
  });

  test("write items never appear after the pull request stopped being open", () => {
    for (const status of ["merged", "closed_unmerged", "no_pr"] as const) {
      const items = itemsFor(status, { autoMerge: "on" });
      for (const item of ["edit", "convert_to_draft", "auto_merge_on", "auto_merge_off", "close"] as const) {
        expect(items).not.toContain(item);
      }
    }
  });
});

describe("merged archive toast", () => {
  test("shows once when an open pull request becomes merged", () => {
    const tracker = createMergedArchiveToastTracker();
    expect(tracker.observe("ws-1", "ready_to_merge")).toBe(false);
    expect(tracker.observe("ws-1", "merged")).toBe(true);
    expect(tracker.observe("ws-1", "merged")).toBe(false);
  });

  test("stays quiet when the pull request is already merged at load", () => {
    const tracker = createMergedArchiveToastTracker();
    expect(tracker.observe("ws-1", "merged")).toBe(false);
    // The usual start: nothing known yet, then the first read says merged.
    expect(tracker.observe("ws-2", "no_pr")).toBe(false);
    expect(tracker.observe("ws-2", "merged")).toBe(false);
    expect(tracker.observe("ws-2", "merged")).toBe(false);
  });

  test("shows at most once per workspace in a session", () => {
    const tracker = createMergedArchiveToastTracker();
    tracker.observe("ws-1", "checks_pending");
    expect(tracker.observe("ws-1", "merged")).toBe(true);
    // The workspace continued on a new branch whose pull request merged too.
    expect(tracker.observe("ws-1", "no_pr")).toBe(false);
    expect(tracker.observe("ws-1", "review_required")).toBe(false);
    expect(tracker.observe("ws-1", "merged")).toBe(false);
  });

  test("tracks each workspace on its own", () => {
    const tracker = createMergedArchiveToastTracker();
    tracker.observe("ws-1", "draft");
    tracker.observe("ws-2", "review_required");
    expect(tracker.observe("ws-2", "merged")).toBe(true);
    expect(tracker.observe("ws-1", "merged")).toBe(true);
  });

  test("ignores a closed pull request and a missing workspace", () => {
    const tracker = createMergedArchiveToastTracker();
    tracker.observe("ws-1", "closed_unmerged");
    expect(tracker.observe("ws-1", "merged")).toBe(false);
    expect(tracker.observe("", "review_required")).toBe(false);
    expect(tracker.observe("", "merged")).toBe(false);
  });

  test("every open status counts as open", () => {
    for (const status of OPEN_STATUSES) {
      const tracker = createMergedArchiveToastTracker();
      tracker.observe("ws-1", status);
      expect(tracker.observe("ws-1", "merged")).toBe(true);
    }
  });
});

describe("edit save plan", () => {
  const baseline = { title: "feat: add widgets", body: "Adds widgets.", reviewers: ["hubot", "acme/core"] };

  test("sends nothing when nothing changed", () => {
    const plan = planPullRequestEdit({ baseline, draft: baseline, remote: baseline });
    expect(plan.edit).toBeNull();
    expect(plan.reviewers).toEqual({ add: [], remove: [] });
    expect(plan.conflict).toEqual({ title: false, body: false });
  });

  test("sends only the changed field", () => {
    expect(planPullRequestEdit({ baseline, draft: { ...baseline, title: "fix: widgets" }, remote: baseline }).edit).toEqual({ title: "fix: widgets" });
    expect(planPullRequestEdit({ baseline, draft: { ...baseline, body: "" }, remote: baseline }).edit).toEqual({ body: "" });
    expect(planPullRequestEdit({ baseline, draft: { ...baseline, title: "t", body: "b" }, remote: baseline }).edit).toEqual({ title: "t", body: "b" });
  });

  test("sends reviewer changes as add and remove", () => {
    const plan = planPullRequestEdit({ baseline, draft: { ...baseline, reviewers: ["hubot", "monalisa"] }, remote: baseline });
    expect(plan.edit).toBeNull();
    expect(plan.reviewers).toEqual({ add: ["monalisa"], remove: ["acme/core"] });
  });

  test("warns instead of overwriting a field that changed on GitHub too", () => {
    const remote = { ...baseline, title: "feat: add better widgets" };
    const draft = { ...baseline, title: "feat: widgets", body: "New body" };
    const plan = planPullRequestEdit({ baseline, draft, remote });
    expect(plan.conflict).toEqual({ title: true, body: false });
    expect(plan.edit).toBeNull();
    expect(plan.reviewers).toEqual({ add: [], remove: [] });
    // What was typed stays in the form.
    expect(plan.draft.title).toBe("feat: widgets");
    expect(plan.draft.body).toBe("New body");

    // Saving again, now against what GitHub has, overwrites.
    const confirmed = planPullRequestEdit({ baseline: remote, draft: plan.draft, remote });
    expect(confirmed.conflict).toEqual({ title: false, body: false });
    expect(confirmed.edit).toEqual({ title: "feat: widgets", body: "New body" });
  });

  test("an untouched field follows GitHub and is not sent", () => {
    const remote = { ...baseline, body: "Edited on GitHub." };
    const plan = planPullRequestEdit({ baseline, draft: { ...baseline, title: "fix: widgets" }, remote });
    expect(plan.conflict).toEqual({ title: false, body: false });
    expect(plan.edit).toEqual({ title: "fix: widgets" });
    expect(plan.draft.body).toBe("Edited on GitHub.");
  });

  test("does not resend a field that already matches GitHub", () => {
    const remote = { ...baseline, title: "fix: widgets" };
    const plan = planPullRequestEdit({ baseline, draft: { ...baseline, title: "fix: widgets" }, remote });
    expect(plan.conflict.title).toBe(false);
    expect(plan.edit).toBeNull();
  });

  test("applies only the reviewer changes the person made on top of the current requests", () => {
    // Meanwhile someone else requested octocat and dropped acme/core.
    const remote = { ...baseline, reviewers: ["hubot", "octocat"] };
    const draft = { ...baseline, reviewers: ["acme/core", "Monalisa"] };
    const plan = planPullRequestEdit({ baseline, draft, remote });
    expect(plan.reviewers).toEqual({ add: ["Monalisa"], remove: ["hubot"] });
    expect(plan.draft.reviewers).toEqual(["octocat", "Monalisa"]);
  });

  test("compares reviewer handles without case", () => {
    const plan = planPullRequestEdit({ baseline, draft: { ...baseline, reviewers: ["Hubot", "ACME/core"] }, remote: baseline });
    expect(plan.reviewers).toEqual({ add: [], remove: [] });
  });
});
