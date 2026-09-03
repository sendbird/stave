import { describe, expect, test } from "bun:test";

import {
  CRANE_TASKS_LIMITS,
  CraneTaskJobClaimRequestV1Schema,
  parseCraneTaskDetailResponseV1,
  parseCraneTaskListResponseV1,
  toTrackerTaskDetailFromCrane,
  toTrackerTaskFromCrane,
} from "../src/lib/tracker-tasks/contract";
import { CraneStaveJobV1Schema } from "../src/lib/crane-connector/contract";
import {
  TrackerTaskDetailSchema,
  TrackerTaskSchema,
} from "../src/lib/tracker-tasks/types";

const fixtureDirectory = new URL("./fixtures/crane-tasks-v1/", import.meta.url);

async function readFixture(name: string) {
  return Bun.file(new URL(name, fixtureDirectory)).json();
}

function issueMessages(error: { issues: { message: string }[] }) {
  return error.issues.map((issue) => issue.message);
}

describe("Crane tasks V1 contract", () => {
  test("maps every shared list fixture row into a valid tracker task", async () => {
    const parsed = parseCraneTaskListResponseV1(
      await readFixture("task-list.json"),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.tasks).toHaveLength(4);
    expect(parsed.data.nextCursor).toBe("crn_cursor_page_2");
    for (const row of parsed.data.tasks) {
      expect(
        TrackerTaskSchema.safeParse(toTrackerTaskFromCrane(row)).success,
      ).toBe(true);
    }

    const [withJira, withoutProject, withSubtasks] = parsed.data.tasks.map(
      toTrackerTaskFromCrane,
    );
    expect(withJira?.links).toEqual([
      {
        rel: "jira",
        url: "https://jira.example.com/browse/PLAT-4821",
        key: "PLAT-4821",
      },
    ]);
    expect(withJira?.assignee?.avatarUrl).toContain("https://");
    // A colourless label must arrive without the key at all: the renderer
    // decides whether to draw a dot from its presence, not from an empty value.
    expect(withJira?.labels).toEqual([
      { name: "frontend", color: "#5b8def" },
      { name: "needs-design" },
    ]);
    expect(withJira?.dueDate).toBe("2026-03-06");

    // A half-set project is treated as no project rather than as a project with
    // a missing name, which is what the row means.
    expect(withoutProject?.project).toBeNull();
    expect(withoutProject?.assignee).toBeNull();
    expect(withSubtasks?.subtasks).toEqual({ count: 5, done: 2 });
    expect(withSubtasks?.effort).toBe(5);
  });

  test("maps the shared detail fixture into a valid tracker detail", async () => {
    const parsed = parseCraneTaskDetailResponseV1(
      await readFixture("task-detail.json"),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const detail = toTrackerTaskDetailFromCrane(parsed.data.task);
    expect(TrackerTaskDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.description.split("\n\n").length).toBeGreaterThan(2);
    expect(detail.description).toContain("## Expected");
  });

  test("accepts the shared claim fixture as a dispatch job", async () => {
    const claim = await readFixture("task-job-claim.json");
    expect(CraneStaveJobV1Schema.safeParse(claim.job).success).toBe(true);
    expect(claim.leaseId.startsWith("stl_")).toBe(true);
    expect(
      CraneTaskJobClaimRequestV1Schema.safeParse({
        protocolVersion: 1,
        instruction: claim.job.instruction,
      }).success,
    ).toBe(true);
  });

  test("rejects a row carrying a host-control field", async () => {
    for (const key of ["command", "apiKey", "projectPath"]) {
      const payload = await readFixture("task-list.json");
      payload.tasks[0][key] = "anything";
      const parsed = parseCraneTaskListResponseV1(payload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(issueMessages(parsed.error).join(" ")).toContain(key);
      }
    }
  });

  test("strips an additive field instead of rejecting the payload", async () => {
    const payload = await readFixture("task-list.json");
    payload.serverRegion = "eu";
    payload.tasks[0].watcherCount = 3;
    const parsed = parseCraneTaskListResponseV1(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("serverRegion");
    expect(parsed.data.tasks[0]).not.toHaveProperty("watcherCount");
  });

  test("rejects a list that fits the row cap but not the byte budget", async () => {
    const template = (await readFixture("task-list.json")).tasks[0];
    const padding = "a".repeat(1_900);
    const payload = {
      contract: "crane-tasks-v1",
      tasks: Array.from(
        { length: CRANE_TASKS_LIMITS.pageSize },
        (_, index) => ({
          ...template,
          id: `task_pad_${index}`,
          number: index + 1,
          key: `CRN-9${index}`,
          href: `https://atelier.example.com/crane/issues/CRN-9${index}?p=${padding}`,
          assignee: {
            ...template.assignee,
            avatarUrl: `https://atelier.example.com/avatars/r.png?p=${padding}`,
          },
        }),
      ),
      nextCursor: null,
      generatedAt: "2026-02-25T12:00:00+00:00",
    };
    const parsed = parseCraneTaskListResponseV1(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(issueMessages(parsed.error)).toContain(
        "Crane task list exceeds the size budget.",
      );
    }
  });

  test("rejects a detail whose fields fit but whose serialized bytes do not", async () => {
    // Every string cap counts UTF-16 code units while the budget counts UTF-8
    // bytes, so a detail built entirely from multi-byte text passes every field
    // check and still blows the response budget. That gap is the reason the
    // byte cap exists at all, which makes it the case worth pinning.
    const wide = (length: number) => "가".repeat(length);
    const urlPadding = "a".repeat(1_960);
    const payload = await readFixture("task-detail.json");
    payload.task.description = wide(CRANE_TASKS_LIMITS.description);
    payload.task.title = wide(CRANE_TASKS_LIMITS.title);
    payload.task.teamName = wide(200);
    payload.task.projectName = wide(200);
    payload.task.assignee.name = wide(200);
    payload.task.assignee.email = wide(320);
    payload.task.labels = Array.from(
      { length: CRANE_TASKS_LIMITS.labels },
      () => ({
        name: wide(80),
        color: wide(32),
      }),
    );
    payload.task.href = `https://atelier.example.com/crane/issues/CRN-101?p=${urlPadding}`;
    payload.task.assignee.avatarUrl = `https://atelier.example.com/avatars/r.png?p=${urlPadding}`;
    payload.task.jiraIssue.issueUrl = `https://jira.example.com/browse/PLAT-4821?p=${urlPadding}`;
    const parsed = parseCraneTaskDetailResponseV1(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(issueMessages(parsed.error)).toContain(
        "Crane task detail exceeds the size budget.",
      );
    }
  });

  test("rejects an instruction the claim route would refuse", () => {
    expect(
      CraneTaskJobClaimRequestV1Schema.safeParse({
        protocolVersion: 1,
        instruction: "   ",
      }).success,
    ).toBe(false);
    expect(
      CraneTaskJobClaimRequestV1Schema.safeParse({
        protocolVersion: 1,
        instruction: "a".repeat(CRANE_TASKS_LIMITS.instruction + 1),
      }).success,
    ).toBe(false);
  });
});
