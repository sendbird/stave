import { describe, expect, test } from "bun:test";
import {
  appendFailedOutgoingSend,
  buildFailedOutgoingSend,
  clearFailedOutgoingSendsForTask,
  countFailedSendAttachments,
  describeFailedSendAttachments,
  describeSendFailureReason,
  FAILED_OUTGOING_SEND_LIMIT,
  getFailedOutgoingSend,
  removeFailedOutgoingSend,
  type FailedOutgoingSend,
  type FailedOutgoingSendsByTask,
} from "@/store/failed-send-recovery";

function buildSend(id: string, taskId = "task-1"): FailedOutgoingSend {
  return buildFailedOutgoingSend({
    id,
    taskId,
    failedAt: "2026-09-04T00:00:00.000Z",
    draft: {
      text: `payload ${id}`,
      attachedFilePaths: [],
      attachments: [],
    },
    error: new Error("offline"),
  });
}

describe("describeSendFailureReason", () => {
  test("uses the error message when there is one", () => {
    expect(describeSendFailureReason(new Error("  runtime not ready  "))).toBe(
      "runtime not ready",
    );
  });

  test("accepts a thrown string", () => {
    expect(describeSendFailureReason("attachment unreadable")).toBe(
      "attachment unreadable",
    );
  });

  test("falls back for empty or non-error throws", () => {
    const fallback = "The message could not be sent.";
    expect(describeSendFailureReason(new Error("   "))).toBe(fallback);
    expect(describeSendFailureReason(undefined)).toBe(fallback);
    expect(describeSendFailureReason({ code: 500 })).toBe(fallback);
  });
});

describe("buildFailedOutgoingSend", () => {
  test("keeps the text and attachments so a retry can resend the same payload", () => {
    const attachments = [
      { kind: "file" as const, filePath: "src/app.ts" },
      {
        kind: "image" as const,
        id: "img-1",
        dataUrl: "data:image/png;base64,AAA",
        label: "screenshot.png",
      },
    ];
    const attachedFilePaths = ["src/app.ts"];
    const send = buildFailedOutgoingSend({
      id: "failed-1",
      taskId: "task-1",
      failedAt: "2026-09-04T00:00:00.000Z",
      draft: {
        text: "Fix the login form",
        attachedFilePaths,
        attachments,
        runtimeOverrides: { thinkingLevel: "high" },
      },
      error: new Error("provider unavailable"),
    });

    expect(send.text).toBe("Fix the login form");
    expect(send.attachments).toEqual(attachments);
    expect(send.attachedFilePaths).toEqual(["src/app.ts"]);
    expect(send.runtimeOverrides).toEqual({ thinkingLevel: "high" });
    expect(send.reason).toBe("provider unavailable");

    // Copied, so later composer edits cannot mutate the parked payload.
    attachedFilePaths.push("src/other.ts");
    attachments.pop();
    expect(send.attachedFilePaths).toEqual(["src/app.ts"]);
    expect(send.attachments).toHaveLength(2);
  });

  test("omits runtime overrides when the failed attempt had none", () => {
    expect("runtimeOverrides" in buildSend("failed-1")).toBe(false);
  });
});

describe("failed outgoing send map", () => {
  test("appends per task in send order and leaves other tasks alone", () => {
    let map: FailedOutgoingSendsByTask = {};
    map = appendFailedOutgoingSend(map, buildSend("a"));
    map = appendFailedOutgoingSend(map, buildSend("b"));
    map = appendFailedOutgoingSend(map, buildSend("c", "task-2"));

    expect(map["task-1"]?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(map["task-2"]?.map((item) => item.id)).toEqual(["c"]);
  });

  test("drops the oldest entries past the per-task limit", () => {
    let map: FailedOutgoingSendsByTask = {};
    for (let index = 0; index < FAILED_OUTGOING_SEND_LIMIT + 3; index += 1) {
      map = appendFailedOutgoingSend(map, buildSend(`send-${index}`));
    }
    const ids = map["task-1"]?.map((item) => item.id) ?? [];
    expect(ids).toHaveLength(FAILED_OUTGOING_SEND_LIMIT);
    expect(ids[0]).toBe("send-3");
    expect(ids.at(-1)).toBe(`send-${FAILED_OUTGOING_SEND_LIMIT + 2}`);
  });

  test("reads one entry back by id", () => {
    const map = appendFailedOutgoingSend({}, buildSend("a"));
    expect(getFailedOutgoingSend(map, { taskId: "task-1", id: "a" })?.text).toBe(
      "payload a",
    );
    expect(
      getFailedOutgoingSend(map, { taskId: "task-1", id: "missing" }),
    ).toBeUndefined();
    expect(
      getFailedOutgoingSend(map, { taskId: "task-9", id: "a" }),
    ).toBeUndefined();
  });

  test("dismissing removes only that entry, and empties the task key", () => {
    let map = appendFailedOutgoingSend({}, buildSend("a"));
    map = appendFailedOutgoingSend(map, buildSend("b"));

    const afterFirst = removeFailedOutgoingSend(map, {
      taskId: "task-1",
      id: "a",
    });
    expect(afterFirst["task-1"]?.map((item) => item.id)).toEqual(["b"]);

    const afterSecond = removeFailedOutgoingSend(afterFirst, {
      taskId: "task-1",
      id: "b",
    });
    expect("task-1" in afterSecond).toBe(false);
  });

  test("keeps the same map reference when nothing matched", () => {
    const map = appendFailedOutgoingSend({}, buildSend("a"));
    expect(removeFailedOutgoingSend(map, { taskId: "task-1", id: "b" })).toBe(
      map,
    );
    expect(removeFailedOutgoingSend(map, { taskId: "task-2", id: "a" })).toBe(
      map,
    );
    expect(clearFailedOutgoingSendsForTask(map, "task-2")).toBe(map);
  });

  test("clears a whole task", () => {
    let map = appendFailedOutgoingSend({}, buildSend("a"));
    map = appendFailedOutgoingSend(map, buildSend("b", "task-2"));
    const cleared = clearFailedOutgoingSendsForTask(map, "task-1");
    expect("task-1" in cleared).toBe(false);
    expect(cleared["task-2"]).toHaveLength(1);
  });
});

describe("failed send attachment summary", () => {
  test("counts a composer file once even though it appears in both lists", () => {
    const send = {
      attachedFilePaths: ["src/app.ts"],
      attachments: [
        { kind: "file" as const, filePath: "src/app.ts" },
        { kind: "file" as const, filePath: "src/other.ts" },
      ],
    };
    expect(countFailedSendAttachments(send)).toBe(2);
    expect(describeFailedSendAttachments(send)).toBe("2 attachments");
  });

  test("counts non-file attachments individually", () => {
    const send = {
      attachedFilePaths: [],
      attachments: [
        {
          kind: "image" as const,
          id: "img-1",
          dataUrl: "data:image/png;base64,AAA",
          label: "shot.png",
        },
      ],
    };
    expect(describeFailedSendAttachments(send)).toBe("1 attachment");
  });

  test("has nothing to say for a text-only payload", () => {
    expect(
      describeFailedSendAttachments({
        attachedFilePaths: [],
        attachments: [],
      }),
    ).toBeNull();
  });
});
