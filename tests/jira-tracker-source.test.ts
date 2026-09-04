import { describe, expect, test } from "bun:test";

import { createJiraTrackerSource } from "../electron/main/tracker-tasks/jira-source";

const SITE_URL = "https://example.atlassian.net";

function issue(key: string) {
  return {
    key,
    fields: {
      summary: key,
      status: {
        name: "To Do",
        statusCategory: { key: "new", name: "To Do" },
      },
      created: "2026-09-01T10:00:00.000+0000",
      updated: "2026-09-02T11:30:00.000+0000",
      project: { id: "1", key: "ABC", name: "Alpha" },
    },
  };
}

function readyStatus() {
  return {
    enabled: true,
    configured: true,
    siteUrl: SITE_URL,
    secureStorageAvailable: true,
    lastErrorCode: null,
    lastTestedAt: null,
  };
}

describe("createJiraTrackerSource list paging", () => {
  test("follows continuation pages and stops when the list is complete", async () => {
    const cursors: Array<string | undefined> = [];
    const source = createJiraTrackerSource({
      getSettings: () =>
        ({
          enabled: true,
          siteUrl: SITE_URL,
          authMode: "cloud-api-token",
          jql: "assignee = currentUser()",
          maxResults: 1,
          projectMappings: [],
        }) as never,
      getStatus: async () => readyStatus() as never,
      listIssues: async (args) => {
        cursors.push(args.nextPageToken);
        if (!args.nextPageToken) {
          return {
            issues: [issue("ABC-1")],
            truncated: true,
            nextPageToken: "page-2",
          };
        }
        return {
          issues: [issue("ABC-2")],
          truncated: false,
          nextPageToken: null,
        };
      },
      getIssue: async () => issue("ABC-1"),
    });

    const listed = await source.listTasks({
      signal: new AbortController().signal,
    });
    expect(listed.tasks.map((task) => task.key)).toEqual(["ABC-1", "ABC-2"]);
    expect(listed.truncated).toBe(false);
    expect(cursors).toEqual([undefined, "page-2"]);
  });

  test("reports a prefix when the page budget runs out", async () => {
    let page = 0;
    const source = createJiraTrackerSource({
      getSettings: () =>
        ({
          enabled: true,
          siteUrl: SITE_URL,
          authMode: "cloud-api-token",
          jql: "assignee = currentUser()",
          maxResults: 1,
          projectMappings: [],
        }) as never,
      getStatus: async () => readyStatus() as never,
      listIssues: async () => {
        page += 1;
        return {
          issues: [issue(`ABC-${page}`)],
          truncated: true,
          nextPageToken: `page-${page + 1}`,
        };
      },
      getIssue: async () => issue("ABC-1"),
    });

    const listed = await source.listTasks({
      signal: new AbortController().signal,
    });
    expect(listed.truncated).toBe(true);
    expect(listed.tasks).toHaveLength(8);
  });
});
