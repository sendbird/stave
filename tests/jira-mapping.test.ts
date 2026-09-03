import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  adfToPlainText,
  JIRA_DESCRIPTION_TRUNCATION_MARKER,
  MAX_JIRA_DESCRIPTION_LENGTH,
  normalizeJiraTimestamp,
  toTrackerTaskDetailFromJira,
  toTrackerTaskFromJira,
} from "../src/lib/jira-connector/mapping";

const SITE_URL = "https://example.atlassian.net";

const BASE_FIELDS: Record<string, unknown> = {
  summary: "Ship the connector",
  status: {
    name: "In Progress",
    statusCategory: { key: "indeterminate", name: "In Progress" },
  },
  priority: { name: "High" },
  issuetype: { name: "Task" },
  assignee: {
    accountId: "account-1",
    displayName: "Test User",
    emailAddress: "user@example.com",
    avatarUrls: { "48x48": "https://cdn.example.com/a.png" },
  },
  labels: ["backend", "connector"],
  duedate: "2026-09-10",
  created: "2026-09-01T10:00:00.000+0900",
  updated: "2026-09-02T11:30:00.000+0900",
  resolutiondate: null,
  project: { id: "10000", key: "ABC", name: "Alpha" },
  parent: { key: "ABC-1" },
};

function issue(fields: Record<string, unknown> = {}) {
  return {
    id: "10001",
    key: "ABC-12",
    self: "https://example.atlassian.net/rest/api/3/issue/10001",
    fields: { ...BASE_FIELDS, ...fields },
  };
}

describe("toTrackerTaskFromJira", () => {
  test("maps the common issue shape", () => {
    const task = toTrackerTaskFromJira(issue(), `${SITE_URL}/`);
    expect(task).not.toBeNull();
    expect(task?.source).toBe("jira");
    expect(task?.ref).toBe("ABC-12");
    expect(task?.key).toBe("ABC-12");
    expect(task?.url).toBe("https://example.atlassian.net/browse/ABC-12");
    expect(task?.status).toEqual({
      raw: "In Progress",
      category: "in_progress",
    });
    expect(task?.priority).toEqual({ raw: "High", level: "high" });
    expect(task?.assignee).toEqual({
      id: "account-1",
      name: "Test User",
      email: "user@example.com",
      avatarUrl: "https://cdn.example.com/a.png",
    });
    expect(task?.labels).toEqual([{ name: "backend" }, { name: "connector" }]);
    expect(task?.dueDate).toBe("2026-09-10");
    expect(task?.createdAt).toBe("2026-09-01T10:00:00.000+09:00");
    expect(task?.updatedAt).toBe("2026-09-02T11:30:00.000+09:00");
    expect(task?.project).toEqual({ id: "10000", name: "Alpha" });
    expect(task?.team).toBeNull();
    expect(task?.parentKey).toBe("ABC-1");
    expect(task?.issueType).toBe("Task");
    expect(task?.subtasks).toBeNull();
    expect(task?.effort).toBeNull();
    expect(task?.links).toEqual([]);
    expect(task?.closedAt).toBeNull();
  });

  test("drops a non-https avatar and buckets an unknown status name by category", () => {
    const task = toTrackerTaskFromJira(
      issue({
        assignee: {
          accountId: "account-2",
          displayName: "Other",
          avatarUrls: { "48x48": "http://cdn.example.com/a.png" },
        },
        status: {
          name: "Bespoke Stage",
          statusCategory: { key: "new", name: "To Do" },
        },
      }),
      SITE_URL,
    );
    expect(task?.assignee).toEqual({ id: "account-2", name: "Other" });
    expect(task?.status).toEqual({ raw: "Bespoke Stage", category: "todo" });
  });

  test("upgrades an indeterminate status to in_review by name", () => {
    for (const name of ["In Review", "Waiting for QA", "Verification"]) {
      const task = toTrackerTaskFromJira(
        issue({
          status: {
            name,
            statusCategory: { key: "indeterminate", name: "In Progress" },
          },
        }),
        SITE_URL,
      );
      expect(task?.status.category).toBe("in_review");
    }
  });

  test("keeps a done-category row done even when its name mentions review", () => {
    const task = toTrackerTaskFromJira(
      issue({
        status: {
          name: "Reviewed and shipped",
          statusCategory: { key: "done", name: "Done" },
        },
        resolutiondate: "2026-09-02T18:00:00.000+0900",
      }),
      SITE_URL,
    );
    expect(task?.status.category).toBe("done");
    expect(task?.closedAt).toBe("2026-09-02T18:00:00.000+09:00");
  });

  test("maps every priority tier", () => {
    const cases: Array<[string | null, string]> = [
      ["Highest", "urgent"],
      ["Blocker", "urgent"],
      ["High", "high"],
      ["Medium", "medium"],
      ["Low", "low"],
      ["Lowest", "low"],
      ["Trivial", "low"],
      ["Minor", "low"],
      ["Weird", "none"],
      [null, "none"],
    ];
    for (const [name, level] of cases) {
      const task = toTrackerTaskFromJira(
        issue({ priority: name ? { name } : null }),
        SITE_URL,
      );
      expect(task?.priority.level).toBe(level as never);
      expect(task?.priority.raw).toBe(name);
    }
  });

  test("returns null for an unmappable row instead of throwing", () => {
    expect(toTrackerTaskFromJira({ id: "1" }, SITE_URL)).toBeNull();
    expect(toTrackerTaskFromJira(null, SITE_URL)).toBeNull();
    expect(
      toTrackerTaskFromJira(issue(), "http://example.atlassian.net"),
    ).toBeNull();
    expect(
      toTrackerTaskFromJira(issue({ created: null, updated: null }), SITE_URL),
    ).toBeNull();
  });
});

describe("normalizeJiraTimestamp", () => {
  const datetime = z.string().datetime({ offset: true });

  test("re-punctuates the four-digit offset Jira sends", () => {
    // Guard the premise: the raw Jira value fails the shared tracker contract.
    expect(datetime.safeParse("2026-09-01T10:00:00.000+0900").success).toBe(
      false,
    );
    const normalized = normalizeJiraTimestamp("2026-09-01T10:00:00.000+0900");
    expect(normalized).toBe("2026-09-01T10:00:00.000+09:00");
    expect(datetime.safeParse(normalized).success).toBe(true);
  });

  test("handles Z, existing colons, microseconds and junk", () => {
    expect(normalizeJiraTimestamp("2026-09-01T10:00:00.000Z")).toBe(
      "2026-09-01T10:00:00.000Z",
    );
    expect(normalizeJiraTimestamp("2026-09-01T10:00:00.000-05:00")).toBe(
      "2026-09-01T10:00:00.000-05:00",
    );
    expect(normalizeJiraTimestamp("2026-09-01T10:00:00.123456+0000")).toBe(
      "2026-09-01T10:00:00.123+00:00",
    );
    expect(normalizeJiraTimestamp("2026-09-01T10:00:00+0900")).toBe(
      "2026-09-01T10:00:00+09:00",
    );
    expect(normalizeJiraTimestamp("nonsense")).toBeNull();
    expect(normalizeJiraTimestamp(null)).toBeNull();
  });
});

describe("adfToPlainText", () => {
  test("renders every supported node type", () => {
    const description = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Context" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "text",
              text: "the doc",
              marks: [{ type: "link", attrs: { href: "https://x.example/d" } }],
            },
            { type: "hardBreak" },
            { type: "text", text: "then retry." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "one" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "two" }] },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { order: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const a = 1;" }],
        },
        { type: "mediaSingle", content: [{ type: "media", attrs: {} }] },
      ],
    };

    expect(adfToPlainText(description)).toBe(
      [
        "## Context",
        "See the doc (https://x.example/d)\nthen retry.",
        "- one\n- two",
        "1. first\n2. second",
        "```ts\nconst a = 1;\n```",
      ].join("\n\n"),
    );
  });

  test("accepts a plain-string description", () => {
    expect(adfToPlainText("  legacy wiki text  ")).toBe("legacy wiki text");
  });

  test("caps depth instead of recursing without bound", () => {
    let node: Record<string, unknown> = {
      type: "paragraph",
      content: [{ type: "text", text: "deep-marker" }],
    };
    for (let index = 0; index < 40; index += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(adfToPlainText({ type: "doc", content: [node] })).toBe("");

    const cyclic: Record<string, unknown> = { type: "blockquote" };
    cyclic.content = [cyclic];
    expect(adfToPlainText({ type: "doc", content: [cyclic] })).toBe("");
  });

  test("truncates with a marker at the contract limit", () => {
    const long = adfToPlainText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x".repeat(40_000) }],
        },
      ],
    });
    expect(long.length).toBe(MAX_JIRA_DESCRIPTION_LENGTH);
    expect(long.endsWith(JIRA_DESCRIPTION_TRUNCATION_MARKER)).toBe(true);
  });
});

describe("toTrackerTaskDetailFromJira", () => {
  test("adds the rendered description", () => {
    const detail = toTrackerTaskDetailFromJira(
      issue({
        description: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Body." }] },
          ],
        },
      }),
      SITE_URL,
    );
    expect(detail?.description).toBe("Body.");
    expect(detail?.key).toBe("ABC-12");
  });

  test("uses an empty description when the field is absent", () => {
    expect(toTrackerTaskDetailFromJira(issue(), SITE_URL)?.description).toBe(
      "",
    );
    expect(toTrackerTaskDetailFromJira({ key: "X" }, SITE_URL)).toBeNull();
  });
});
