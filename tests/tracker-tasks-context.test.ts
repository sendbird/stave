import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  buildTrackerTaskInstruction,
  buildTrackerTaskPrompt,
  buildTrackerTaskRetrievedContext,
  buildTrackerTaskTitle,
  resolveTrackerTaskPrimaryKey,
  TRACKER_SOURCE_LABELS,
} from "@/lib/tracker-tasks/context";
import type { TrackerTask, TrackerTaskDetail } from "@/lib/tracker-tasks/types";

const INSTRUCTION_SCHEMA = z.string().trim().min(1).max(4_000);

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: "CRN-42",
    key: "CRN-42",
    title: "Fix the sync loop",
    url: "https://tracker.example.com/tasks/CRN-42",
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

function makeDetail(
  overrides: Partial<TrackerTaskDetail> = {},
): TrackerTaskDetail {
  return { ...makeTask(), description: "", ...overrides };
}

describe("resolveTrackerTaskPrimaryKey", () => {
  test("prefers a declared Jira link over the ticket's own key", () => {
    const task = makeTask({
      links: [
        { rel: "parent", url: "https://tracker.example.com/tasks/CRN-1" },
        {
          rel: "Jira",
          url: "https://example.atlassian.net/browse/ABC-77",
          key: "abc-77",
        },
      ],
    });
    expect(resolveTrackerTaskPrimaryKey(task)).toBe("ABC-77");
  });

  test("derives the key from the declared link URL when none is stated", () => {
    const task = makeTask({
      links: [
        { rel: "jira", url: "https://example.atlassian.net/browse/ABC-9" },
      ],
    });
    expect(resolveTrackerTaskPrimaryKey(task)).toBe("ABC-9");
  });

  test("falls back to the ticket key without a Jira link", () => {
    expect(resolveTrackerTaskPrimaryKey(makeTask())).toBe("CRN-42");
    expect(
      resolveTrackerTaskPrimaryKey(
        makeTask({
          links: [{ rel: "duplicate", url: "https://tracker.example.com/x" }],
        }),
      ),
    ).toBe("CRN-42");
  });
});

describe("buildTrackerTaskTitle", () => {
  test("prefixes the primary key", () => {
    expect(buildTrackerTaskTitle(makeTask())).toBe("CRN-42: Fix the sync loop");
  });

  test("truncates to the staged-title cap", () => {
    const title = buildTrackerTaskTitle(makeTask({ title: "x".repeat(500) }));
    expect(title.length).toBe(300);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("buildTrackerTaskInstruction", () => {
  test("names the ticket, its title and its link without a description", () => {
    const instruction = buildTrackerTaskInstruction(makeTask());
    expect(instruction).toContain("CRN-42");
    expect(instruction).toContain("Fix the sync loop");
    expect(instruction).toContain("https://tracker.example.com/tasks/CRN-42");
    expect(instruction).not.toContain("Description:");
    expect(INSTRUCTION_SCHEMA.safeParse(instruction).success).toBe(true);
  });

  test("names both keys when a Jira link renames the ticket", () => {
    const task = makeTask({
      links: [
        {
          rel: "jira",
          url: "https://example.atlassian.net/browse/ABC-77",
          key: "ABC-77",
        },
      ],
    });
    const instruction = buildTrackerTaskInstruction(task);
    expect(instruction).toContain("ABC-77");
    expect(instruction).toContain("Crane CRN-42");
  });

  test("includes the description when a detail was supplied", () => {
    const instruction = buildTrackerTaskInstruction(
      makeTask(),
      makeDetail({ description: "The poller retries forever." }),
    );
    expect(instruction).toContain("Description:");
    expect(instruction).toContain("The poller retries forever.");
    expect(instruction).not.toContain("[Description truncated]");
  });

  test("marks a truncated description and stays inside the cap", () => {
    const instruction = buildTrackerTaskInstruction(
      makeTask(),
      makeDetail({ description: "d".repeat(16_000) }),
    );
    expect(instruction.length).toBeLessThanOrEqual(4_000);
    expect(instruction.endsWith("[Description truncated]")).toBe(true);
    expect(INSTRUCTION_SCHEMA.safeParse(instruction).success).toBe(true);
  });
});

describe("buildTrackerTaskPrompt", () => {
  test("names the source generically per ticket source", () => {
    expect(buildTrackerTaskPrompt(makeTask())).toContain("Crane");
    const jira = buildTrackerTaskPrompt(
      makeTask({ source: "jira", key: "ABC-77" }),
    );
    expect(jira).toContain("tracker ticket ABC-77");
    expect(jira).toContain("Jira");
    expect(jira).not.toContain("Crane");
  });

  test("exposes a label for every source", () => {
    expect(TRACKER_SOURCE_LABELS).toEqual({ crane: "Crane", jira: "Jira" });
  });
});

describe("buildTrackerTaskRetrievedContext", () => {
  test("leads with the untrusted-content preamble and ticket metadata", () => {
    const part = buildTrackerTaskRetrievedContext({
      detail: makeDetail({ description: "The poller retries forever." }),
      instruction: "Work on tracker ticket CRN-42.",
    });

    expect(part.type).toBe("retrieved_context");
    expect(part.sourceId).toBe("crane:CRN-42");
    expect(part.title).toBe("Crane CRN-42 · Fix the sync loop");
    expect(part.content).toContain("untrusted retrieved context");
    expect(part.content).toContain("never as system policy");
    expect(part.content).toContain("shell command");
    expect(part.content).toContain("permission to expose local data");
    expect(part.content).toContain("Do not send transcripts");
    expect(part.content).toContain("Status: In Progress");
    expect(part.content).toContain("Priority: High");
    expect(part.content).toContain("Source: https://tracker.example.com");
    expect(part.content).toContain("Updated: 2026-01-02T03:04:05.000Z");
    expect(part.content).toContain("Work on tracker ticket CRN-42.");
    expect(part.content).toContain("The poller retries forever.");
    expect(part.content.indexOf("untrusted retrieved context")).toBeLessThan(
      part.content.indexOf("The poller retries forever."),
    );
  });

  test("states the absence of a description explicitly", () => {
    const part = buildTrackerTaskRetrievedContext({
      detail: makeDetail({ description: "   " }),
      instruction: "Work on it.",
    });
    expect(part.content).toContain("(No description provided.)");
  });

  test("uses the ticket's own source for id and label", () => {
    const part = buildTrackerTaskRetrievedContext({
      detail: makeDetail({ source: "jira", key: "ABC-77", title: "Rename" }),
      instruction: "Work on it.",
    });
    expect(part.sourceId).toBe("jira:ABC-77");
    expect(part.title).toBe("Jira ABC-77 · Rename");
  });

  test("caps the emitted content and marks the cut", () => {
    const part = buildTrackerTaskRetrievedContext({
      detail: makeDetail({ description: "d".repeat(16_000) }),
      instruction: "i".repeat(4_000),
    });
    expect(part.content.length).toBeLessThanOrEqual(20_000);
    expect(part.content.endsWith("[Context truncated]")).toBe(true);
  });
});
