import { describe, expect, test } from "bun:test";
import {
  CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  resolveClaudeApprovalDecisionTimeoutMs,
} from "../electron/providers/claude-sdk-runtime";
import {
  CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  resolveCodexApprovalDecisionTimeoutMs,
} from "../electron/providers/codex-app-server-runtime";
import {
  earlierApprovalDeadline,
  readApprovalDeadline,
  resolveApprovalExpiresAt,
} from "../src/lib/approvals/approval-expiry";
import { MANAGED_TASK_APPROVAL_TIMEOUT_MS } from "../src/lib/providers/managed-task-runtime";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";

const NOW = Date.parse("2026-11-03T15:39:00.000Z");
const MINUTE = 60_000;

describe("resolveApprovalExpiresAt", () => {
  test("is the moment the auto-decline timer fires", () => {
    expect(resolveApprovalExpiresAt({ timeoutMs: 45 * MINUTE, now: NOW })).toBe("2026-11-03T16:24:00.000Z");
  });

  test("is absent when no timer runs", () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveApprovalExpiresAt({ timeoutMs, now: NOW })).toBeUndefined();
    }
  });
});

describe("each runtime's deadline", () => {
  // The defaults the runtimes run with when no override is set: every one of
  // them denies an unanswered request after 45 minutes.
  test("Claude: the decision timeout from its environment override or default", () => {
    expect(CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS).toBe(45 * MINUTE);
    expect(resolveApprovalExpiresAt({ timeoutMs: resolveClaudeApprovalDecisionTimeoutMs({}), now: NOW }))
      .toBe("2026-11-03T16:24:00.000Z");
    expect(resolveApprovalExpiresAt({ timeoutMs: resolveClaudeApprovalDecisionTimeoutMs({ envValue: "60000" }), now: NOW }))
      .toBe("2026-11-03T15:40:00.000Z");
  });

  test("Codex: the auto-decline timeout from its environment override or default", () => {
    expect(CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS).toBe(45 * MINUTE);
    expect(resolveApprovalExpiresAt({ timeoutMs: resolveCodexApprovalDecisionTimeoutMs({}), now: NOW }))
      .toBe("2026-11-03T16:24:00.000Z");
    expect(resolveApprovalExpiresAt({ timeoutMs: resolveCodexApprovalDecisionTimeoutMs({ envValue: "120000" }), now: NOW }))
      .toBe("2026-11-03T15:41:00.000Z");
  });
});

describe("earlierApprovalDeadline", () => {
  // A delegated task's host denies after five minutes, before the runtime's
  // 45: the request carries the host's deadline.
  test("keeps whichever timer fires first", () => {
    const runtime = resolveApprovalExpiresAt({ timeoutMs: 45 * MINUTE, now: NOW });
    expect(earlierApprovalDeadline({ expiresAt: runtime, timeoutMs: MANAGED_TASK_APPROVAL_TIMEOUT_MS, now: NOW }))
      .toBe("2026-11-03T15:44:00.000Z");
    expect(earlierApprovalDeadline({ expiresAt: "2026-11-03T15:40:00.000Z", timeoutMs: MANAGED_TASK_APPROVAL_TIMEOUT_MS, now: NOW }))
      .toBe("2026-11-03T15:40:00.000Z");
  });

  test("uses the second timer alone when the request had no deadline", () => {
    expect(earlierApprovalDeadline({ timeoutMs: MANAGED_TASK_APPROVAL_TIMEOUT_MS, now: NOW })).toBe("2026-11-03T15:44:00.000Z");
    expect(earlierApprovalDeadline({ expiresAt: "soon", timeoutMs: MANAGED_TASK_APPROVAL_TIMEOUT_MS, now: NOW }))
      .toBe("2026-11-03T15:44:00.000Z");
    expect(earlierApprovalDeadline({ expiresAt: "2026-11-03T16:24:00.000Z", timeoutMs: 0, now: NOW }))
      .toBe("2026-11-03T16:24:00.000Z");
  });
});

describe("readApprovalDeadline", () => {
  test("reads a deadline still ahead", () => {
    expect(readApprovalDeadline("2026-11-03T16:24:00.000Z", NOW)?.toISOString()).toBe("2026-11-03T16:24:00.000Z");
  });

  test("shows nothing for a missing, malformed or passed deadline", () => {
    expect(readApprovalDeadline(undefined, NOW)).toBeNull();
    expect(readApprovalDeadline("not a time", NOW)).toBeNull();
    expect(readApprovalDeadline("2026-11-03T15:00:00.000Z", NOW)).toBeNull();
  });
});

describe("the approval contract carries expiresAt", () => {
  const approval = {
    type: "approval",
    toolName: "Bash",
    requestId: "req-1",
    description: "Run the tests",
    expiresAt: "2026-11-03T16:24:00.000Z",
  } as const;

  test("the renderer schema keeps a deadline and drops a malformed one without dropping the request", () => {
    expect(NormalizedProviderEventSchema.parse(approval)).toMatchObject({ expiresAt: approval.expiresAt });
    const malformed = NormalizedProviderEventSchema.parse({ ...approval, expiresAt: "soon" });
    expect(malformed).toMatchObject({ type: "approval", requestId: "req-1" });
    expect("expiresAt" in malformed && malformed.expiresAt).toBeFalsy();
  });

  test("the replayed approval part keeps it", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task", provider: "claude-code", model: "sonnet", turnId: "turn", events: [approval], messages: [],
    });
    const parts = replayed.messages.flatMap((message) => message.parts).filter((part) => part.type === "approval");
    expect(parts).toEqual([expect.objectContaining({ requestId: "req-1", state: "approval-requested", expiresAt: approval.expiresAt })]);
  });
});
