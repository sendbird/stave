import { describe, expect, test } from "bun:test";
import {
  hasPausedUsageLimitWork,
  isQueuedTurnRestoredAfterRestart,
  listDueUsageLimitAutoResumes,
  resolveNextUsageLimitAutoResume,
  resolveQueuePause,
  resolveQueuedTurnPauseHold,
  resolveUsageLimitAutoResumeAt,
  USAGE_LIMIT_RESUME_GRACE_MS,
  type TaskUsageLimitPause,
} from "../src/store/task-work-pause";

const SESSION_STARTED_AT = Date.parse("2026-10-03T10:00:00.000Z");
const restored = { queuedAt: "2026-10-03T09:59:00.000Z" };
const queuedNow = { queuedAt: "2026-10-03T10:05:00.000Z" };

const pause = (overrides: Partial<TaskUsageLimitPause> = {}): TaskUsageLimitPause => ({
  workspaceId: "ws-main",
  providerId: "claude-code",
  stoppedTurn: true,
  pausedAt: SESSION_STARTED_AT,
  resetsAt: SESSION_STARTED_AT + 60 * 60_000,
  ...overrides,
});

describe("restored queue", () => {
  test("items stamped before this session started were restored from disk", () => {
    expect(
      isQueuedTurnRestoredAfterRestart({ item: restored, sessionStartedAt: SESSION_STARTED_AT }),
    ).toBe(true);
    expect(
      isQueuedTurnRestoredAfterRestart({ item: queuedNow, sessionStartedAt: SESSION_STARTED_AT }),
    ).toBe(false);
    expect(
      isQueuedTurnRestoredAfterRestart({ item: { queuedAt: "x" }, sessionStartedAt: SESSION_STARTED_AT }),
    ).toBe(false);
  });

  test("pauses while a restored item waits, until the user releases it", () => {
    const base = { usageLimitPause: undefined, sessionStartedAt: SESSION_STARTED_AT };
    expect(resolveQueuePause({ ...base, queuedTurns: [restored, queuedNow], restoredQueueReleased: false })).toBe("restart");
    expect(resolveQueuePause({ ...base, queuedTurns: [queuedNow], restoredQueueReleased: false })).toBeNull();
    expect(resolveQueuePause({ ...base, queuedTurns: [restored], restoredQueueReleased: true })).toBeNull();
    expect(resolveQueuePause({ ...base, queuedTurns: [], restoredQueueReleased: false })).toBeNull();
  });

  test("the dispatcher waits at a restored head", () => {
    expect(
      resolveQueuedTurnPauseHold({
        item: restored,
        usageLimitPause: undefined,
        restoredQueueReleased: false,
        sessionStartedAt: SESSION_STARTED_AT,
      }),
    ).toBe("wait");
    expect(
      resolveQueuedTurnPauseHold({
        item: restored,
        usageLimitPause: undefined,
        restoredQueueReleased: true,
        sessionStartedAt: SESSION_STARTED_AT,
      }),
    ).toBeUndefined();
  });
});

describe("usage-limit pause", () => {
  test("holds the whole queue, restored or not", () => {
    expect(
      resolveQueuePause({
        queuedTurns: [queuedNow],
        usageLimitPause: pause(),
        restoredQueueReleased: true,
        sessionStartedAt: SESSION_STARTED_AT,
      }),
    ).toBe("usage-limit");
    expect(
      resolveQueuedTurnPauseHold({
        item: queuedNow,
        usageLimitPause: pause(),
        restoredQueueReleased: true,
        sessionStartedAt: SESSION_STARTED_AT,
      }),
    ).toBe("wait");
  });

  test("has work to resume only for a stopped turn or a waiting queue", () => {
    expect(hasPausedUsageLimitWork({ pause: pause(), queuedTurnCount: 0 })).toBe(true);
    expect(hasPausedUsageLimitWork({ pause: pause({ stoppedTurn: false }), queuedTurnCount: 2 })).toBe(true);
    expect(hasPausedUsageLimitWork({ pause: pause({ stoppedTurn: false }), queuedTurnCount: 0 })).toBe(false);
    expect(hasPausedUsageLimitWork({ pause: undefined, queuedTurnCount: 2 })).toBe(false);
  });

  test("arms a minute past the reset, and not at all without one", () => {
    const resetsAt = SESSION_STARTED_AT + 30 * 60_000;
    expect(resolveUsageLimitAutoResumeAt({ resetsAt, now: SESSION_STARTED_AT })).toBe(
      resetsAt + USAGE_LIMIT_RESUME_GRACE_MS,
    );
    // A reset already behind us resumes a minute from now.
    expect(resolveUsageLimitAutoResumeAt({ resetsAt, now: resetsAt + 5_000 })).toBe(
      resetsAt + 5_000 + USAGE_LIMIT_RESUME_GRACE_MS,
    );
    expect(resolveUsageLimitAutoResumeAt({ resetsAt: null, now: SESSION_STARTED_AT })).toBeNull();
  });

  test("schedules the earliest armed resume and lists the due ones", () => {
    const pauses = {
      later: pause({ autoResumeAt: SESSION_STARTED_AT + 120_000 }),
      sooner: pause({ autoResumeAt: SESSION_STARTED_AT + 60_000 }),
      unarmed: pause(),
    };
    expect(resolveNextUsageLimitAutoResume(pauses)).toEqual({
      taskId: "sooner",
      at: SESSION_STARTED_AT + 60_000,
    });
    expect(
      listDueUsageLimitAutoResumes({ pauses, now: SESSION_STARTED_AT + 90_000 }),
    ).toEqual(["sooner"]);
    expect(resolveNextUsageLimitAutoResume({ unarmed: pause() })).toBeNull();
  });
});
