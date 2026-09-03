import { describe, expect, test } from "bun:test";

import { proposeTrackerTaskBranchName } from "@/lib/tracker-tasks/branch-name";
import type { TrackerTask } from "@/lib/tracker-tasks/types";

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: "CRN-42",
    key: "CRN-42",
    title: "Fix the sync loop",
    url: "https://tracker.example.com/tasks/CRN-42",
    status: { raw: "Todo", category: "todo" },
    priority: { raw: null, level: "none" },
    assignee: null,
    labels: [],
    dueDate: null,
    effort: null,
    project: null,
    team: null,
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

const FORBIDDEN = /\s|\.\.|[~^:?*[\\]/;

function expectValidRef(branch: string) {
  expect(branch).not.toMatch(FORBIDDEN);
  expect(branch.startsWith("/")).toBe(false);
  expect(branch.endsWith("/")).toBe(false);
  expect(branch.endsWith(".lock")).toBe(false);
  expect(branch.length).toBeGreaterThan(0);
  expect(branch.length).toBeLessThanOrEqual(160);
}

describe("proposeTrackerTaskBranchName", () => {
  test("slugs the key and the title under the default prefix", () => {
    expect(proposeTrackerTaskBranchName({ task: makeTask() })).toBe(
      "feat/crn-42-fix-the-sync-loop",
    );
  });

  test("uses the linked Jira key when the ticket declares one", () => {
    const task = makeTask({
      links: [
        {
          rel: "jira",
          url: "https://example.atlassian.net/browse/ABC-77",
          key: "ABC-77",
        },
      ],
    });
    expect(proposeTrackerTaskBranchName({ task })).toBe(
      "feat/abc-77-fix-the-sync-loop",
    );
  });

  test("caps the title slug at 40 characters without a trailing hyphen", () => {
    const branch = proposeTrackerTaskBranchName({
      task: makeTask({
        title: "Make the retry backoff configurable per source and team",
      }),
    });
    const titleSlug = branch.slice("feat/crn-42-".length);
    expect(titleSlug.length).toBeLessThanOrEqual(40);
    expect(titleSlug.endsWith("-")).toBe(false);
    expect(branch).toBe("feat/crn-42-make-the-retry-backoff-configurable-per");
  });

  test("falls back to the key alone when the title slugs to nothing", () => {
    expect(
      proposeTrackerTaskBranchName({ task: makeTask({ title: "!!! ???" }) }),
    ).toBe("feat/crn-42");
  });

  test("honours an explicit prefix written in the naming rule", () => {
    expect(
      proposeTrackerTaskBranchName({
        task: makeTask(),
        namingRule: "Always branch as feature/<ticket>-<summary>.",
      }),
    ).toBe("feature/crn-42-fix-the-sync-loop");
    expect(
      proposeTrackerTaskBranchName({
        task: makeTask(),
        namingRule: "bugfix/ for defects",
      }),
    ).toBe("bugfix/crn-42-fix-the-sync-loop");
  });

  test("keeps the default when the rule states no detectable prefix", () => {
    for (const namingRule of [
      "",
      "   ",
      null,
      undefined,
      "Use the ticket key, then a short summary in kebab case.",
      "Follow https://wiki.example.com/team/branch-naming",
    ]) {
      expect(
        proposeTrackerTaskBranchName({ task: makeTask(), namingRule }),
      ).toBe("feat/crn-42-fix-the-sync-loop");
    }
  });

  test("strips a trailing .lock component", () => {
    expect(
      proposeTrackerTaskBranchName({
        task: makeTask({ title: "hotfix.lock" }),
      }),
    ).toBe("feat/crn-42-hotfix");
  });

  test("a hostile title cannot escape the ref sanitizer", () => {
    const branch = proposeTrackerTaskBranchName({
      task: makeTask({
        title: "../../ ~evil ^HEAD: refs?*[x] \\win@{1} .lock",
      }),
    });
    expectValidRef(branch);
    expect(branch.startsWith("feat/crn-42-")).toBe(true);
  });

  test("a hostile naming rule cannot escape the ref sanitizer", () => {
    const branch = proposeTrackerTaskBranchName({
      task: makeTask(),
      namingRule: "../../../etc/ is the prefix",
    });
    expectValidRef(branch);
  });

  test("caps the total length at the branch limit", () => {
    const branch = proposeTrackerTaskBranchName({
      task: makeTask({ key: `CRN-${"9".repeat(300)}` }),
    });
    expectValidRef(branch);
    expect(branch.length).toBe(160);
  });
});
