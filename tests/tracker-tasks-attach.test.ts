import { describe, expect, test } from "bun:test";

import { buildTrackerTaskWorkspaceInformationUpdate } from "@/lib/tracker-tasks/attach";
import type { TrackerTask } from "@/lib/tracker-tasks/types";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";

const CRANE_URL = "https://tracker.example.com/apps/crane/w/TFE/task/CRN-42";
const JIRA_URL = "https://example.atlassian.net/browse/ABC-77";

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: "CRN-42",
    key: "CRN-42",
    title: "Fix the sync loop",
    url: CRANE_URL,
    status: { raw: "In Progress", category: "in_progress" },
    priority: { raw: "High", level: "high" },
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
    updatedAt: "2026-01-02T03:04:05.000Z",
    closedAt: null,
    ...overrides,
  };
}

describe("buildTrackerTaskWorkspaceInformationUpdate", () => {
  test("files a Crane-only ticket in the Crane section", () => {
    const current = createEmptyWorkspaceInformation();
    const update = buildTrackerTaskWorkspaceInformationUpdate({
      current,
      task: makeTask(),
    });

    expect(update.changed).toBe(true);
    expect(update.information).not.toBe(current);
    expect(update.information.jiraIssues).toEqual([]);
    expect(update.information.craneIssues).toHaveLength(1);
    expect(update.information.craneIssues?.[0]).toMatchObject({
      issueKey: "CRN-42",
      title: "Fix the sync loop",
      url: CRANE_URL,
      status: "In Progress",
    });
    expect(update.entries).toEqual([
      {
        section: "crane",
        issueKey: "CRN-42",
        url: CRANE_URL,
        deduplicated: false,
      },
    ]);
  });

  test("files a Jira ticket in the Jira section", () => {
    const update = buildTrackerTaskWorkspaceInformationUpdate({
      current: createEmptyWorkspaceInformation(),
      task: makeTask({
        source: "jira",
        ref: "ABC-77",
        key: "ABC-77",
        url: JIRA_URL,
      }),
    });

    expect(update.changed).toBe(true);
    expect(update.information.craneIssues ?? []).toEqual([]);
    expect(update.information.jiraIssues).toHaveLength(1);
    expect(update.information.jiraIssues[0]).toMatchObject({
      issueKey: "ABC-77",
      url: JIRA_URL,
    });
  });

  test("a Crane ticket with a declared Jira link lands in both sections", () => {
    const update = buildTrackerTaskWorkspaceInformationUpdate({
      current: createEmptyWorkspaceInformation(),
      task: makeTask({
        links: [
          { rel: "parent", url: "https://tracker.example.com/tasks/CRN-1" },
          { rel: "Jira", url: JIRA_URL, key: "abc-77", title: "Sync loop" },
        ],
      }),
    });

    expect(update.information.craneIssues?.[0]).toMatchObject({
      issueKey: "CRN-42",
      url: CRANE_URL,
    });
    expect(update.information.jiraIssues[0]).toMatchObject({
      issueKey: "ABC-77",
      title: "Sync loop",
      url: JIRA_URL,
    });
    expect(update.entries.map((entry) => entry.section)).toEqual([
      "crane",
      "jira",
    ]);
  });

  test("a mislabelled Jira link degrades to key-only", () => {
    const update = buildTrackerTaskWorkspaceInformationUpdate({
      current: createEmptyWorkspaceInformation(),
      task: makeTask({
        links: [
          {
            rel: "jira",
            url: "https://mirror.example.com/browse/ABC-77",
            key: "ABC-77",
          },
        ],
      }),
    });

    expect(update.information.jiraIssues[0]).toMatchObject({
      issueKey: "ABC-77",
      url: "",
    });
  });

  test("attaching the same ticket twice is a no-op", () => {
    const task = makeTask({
      links: [{ rel: "jira", url: JIRA_URL, key: "ABC-77" }],
    });
    const first = buildTrackerTaskWorkspaceInformationUpdate({
      current: createEmptyWorkspaceInformation(),
      task,
    });
    const second = buildTrackerTaskWorkspaceInformationUpdate({
      current: first.information,
      task,
    });

    expect(second.changed).toBe(false);
    expect(second.information).toBe(first.information);
    expect(second.information.craneIssues).toHaveLength(1);
    expect(second.information.jiraIssues).toHaveLength(1);
    expect(second.entries.every((entry) => entry.deduplicated)).toBe(true);
  });

  test("re-attaching through a URL variant still collapses onto one entry", () => {
    const first = buildTrackerTaskWorkspaceInformationUpdate({
      current: createEmptyWorkspaceInformation(),
      task: makeTask(),
    });
    const second = buildTrackerTaskWorkspaceInformationUpdate({
      current: first.information,
      task: makeTask({ url: `${CRANE_URL}/?ref=list` }),
    });

    expect(second.information.craneIssues).toHaveLength(1);
    expect(second.entries[0]?.deduplicated).toBe(true);
  });
});
