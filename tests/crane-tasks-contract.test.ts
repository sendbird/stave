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
      { name: "frontend", color: "info" },
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

/**
 * The fixtures the server side authors and validates.
 *
 * Both repositories carry all of these files, but for a while each side's tests
 * only read the family it had written itself, so the two schemas could disagree
 * while both suites stayed green — which is exactly what happened. Reading the
 * other side's fixtures here is what makes "the fixtures are the arbiter" a
 * fact rather than a claim.
 */
describe("Crane tasks V1 contract against the server's own fixtures", () => {
  test("accepts the server's list and detail responses", async () => {
    const list = parseCraneTaskListResponseV1(
      await readFixture("valid-list.json"),
    );
    expect(list.success).toBe(true);
    if (list.success) {
      for (const row of list.data.tasks) {
        expect(
          TrackerTaskSchema.safeParse(toTrackerTaskFromCrane(row)).success,
        ).toBe(true);
      }
    }

    const detail = parseCraneTaskDetailResponseV1(
      await readFixture("valid-detail.json"),
    );
    expect(detail.success).toBe(true);
    if (detail.success) {
      expect(
        TrackerTaskDetailSchema.safeParse(
          toTrackerTaskDetailFromCrane(detail.data.task),
        ).success,
      ).toBe(true);
    }
  });

  test("accepts the server's claim response", async () => {
    const claim = await readFixture("valid-claim.json");
    expect(CraneStaveJobV1Schema.safeParse(claim.job).success).toBe(true);
    expect(typeof claim.nextSequence).toBe("number");
    // The server sends its poll interval here; Stave's own claim schema requires
    // a positive value, so a zero would fail the kickoff at the last step.
    expect(claim.retryAfterMs).toBeGreaterThan(0);
  });

  test.each([
    "invalid-list-oversized-page.json",
  ])("rejects %s", async (name) => {
    expect(parseCraneTaskListResponseV1(await readFixture(name)).success).toBe(
      false,
    );
  });

  test("strips an unknown property the server refuses to emit", async () => {
    // The one place the two schemas differ on purpose. The server is strict
    // about its *own output*, so it can never ship a field it did not mean to;
    // this side is tolerant of *input*, so a newer Crane that adds a field does
    // not break an older Stave. Asserting symmetry here would force a lockstep
    // release for every additive server change.
    const payload = await readFixture("invalid-list-forbidden-property.json");
    expect(payload.tasks[0].internalNote).toBe("should not be here");

    const parsed = parseCraneTaskListResponseV1(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tasks[0]).not.toHaveProperty("internalNote");
  });

  test("still refuses a property that would name a host control", async () => {
    // Tolerance of unknown keys is not tolerance of anything: a payload that
    // tries to name a local path, a command, or a provider runtime is rejected
    // before a single field is read.
    for (const key of ["command", "projectPath", "permissionMode", "token"]) {
      const payload = await readFixture("valid-list.json");
      payload.tasks[0][key] = "anything";
      expect(parseCraneTaskListResponseV1(payload).success).toBe(false);
    }
  });

  test.each(["invalid-task-estimate.json", "invalid-task-http-href.json"])(
    "rejects %s",
    async (name) => {
      const payload = await readFixture(name);
      const parsed = payload.task
        ? parseCraneTaskDetailResponseV1(payload)
        : parseCraneTaskListResponseV1(payload);
      expect(parsed.success).toBe(false);
    },
  );
});

/**
 * Rows the server can emit that a narrower intake used to reject.
 *
 * Each case below was a real divergence: the server allowed it and Stave did
 * not, so one such row would have taken down the whole page it arrived on.
 */
describe("Crane tasks V1 intake tolerance", () => {
  async function listWith(mutate: (row: Record<string, any>) => void) {
    const payload = await readFixture("valid-list.json");
    mutate(payload.tasks[0]);
    return parseCraneTaskListResponseV1(payload);
  }

  test("accepts an account the server did not name, falling back to email", async () => {
    const parsed = await listWith((row) => {
      row.assignee.name = null;
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const task = toTrackerTaskFromCrane(parsed.data.tasks[0]!);
    expect(task.assignee?.name).toBe("stave@example.test");
    expect(TrackerTaskSchema.safeParse(task).success).toBe(true);
  });

  test("falls back to the account id when there is no name or email", async () => {
    const parsed = await listWith((row) => {
      row.assignee.name = null;
      row.assignee.email = null;
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const task = toTrackerTaskFromCrane(parsed.data.tasks[0]!);
    expect(task.assignee?.name).toBe(parsed.data.tasks[0]!.assignee!.id);
  });

  test("drops an avatar it cannot trust instead of the whole page", async () => {
    for (const value of ["/avatars/relative.png", "http://x.test/a.png", "not a url"]) {
      const parsed = await listWith((row) => {
        row.assignee.avatarUrl = value;
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      const task = toTrackerTaskFromCrane(parsed.data.tasks[0]!);
      expect(task.assignee?.avatarUrl).toBeUndefined();
      expect(TrackerTaskSchema.safeParse(task).success).toBe(true);
    }
  });

  test("keeps an https avatar", async () => {
    const parsed = await listWith((row) => {
      row.assignee.avatarUrl = "https://cdn.example.test/a.png";
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(toTrackerTaskFromCrane(parsed.data.tasks[0]!).assignee?.avatarUrl).toBe(
      "https://cdn.example.test/a.png",
    );
  });

  test("reads an empty project name as no project", async () => {
    const parsed = await listWith((row) => {
      row.projectName = "";
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(toTrackerTaskFromCrane(parsed.data.tasks[0]!).project).toBeNull();
  });

  test("accepts a label name at the server's cap", async () => {
    const name = "x".repeat(CRANE_TASKS_LIMITS.labelName);
    const parsed = await listWith((row) => {
      row.labels = [{ name }];
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const task = toTrackerTaskFromCrane(parsed.data.tasks[0]!);
    expect(task.labels[0]?.name).toBe(name);
    expect(TrackerTaskSchema.safeParse(task).success).toBe(true);
  });

  test("clamps an uncapped subtask count into the model's bound", async () => {
    const parsed = await listWith((row) => {
      row.subtaskCount = 25_000;
      row.subtaskDoneCount = 24_000;
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const task = toTrackerTaskFromCrane(parsed.data.tasks[0]!);
    expect(task.subtasks).toEqual({ count: 10_000, done: 10_000 });
    expect(TrackerTaskSchema.safeParse(task).success).toBe(true);
  });

  test("still rejects a ticket link that is not https", async () => {
    // Tolerance stops at the fields a decision depends on: the ticket URL is
    // opened in a browser, so it is not decoration.
    const parsed = await listWith((row) => {
      row.href = "http://atelier.example.test/apps/crane/w/ws/task/CRN-42";
    });
    expect(parsed.success).toBe(false);
  });
});
