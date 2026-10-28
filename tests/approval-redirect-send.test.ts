import { describe, expect, test } from "bun:test";
import { i18n } from "@/i18n/runtime";
import {
  listProviderIds,
  providerSupportsMidTurnSteering,
} from "@/lib/providers/model-catalog";
import {
  resolveApprovalRedirectMode,
  sendWithApprovalRedirect,
  type PendingApprovalTarget,
} from "@/store/approval-redirect-send";
import type {
  ApprovalAnswerOutcome,
  SendUserMessageResult,
} from "@/store/app-store.types";

const IDS = { taskId: "task-1", workspaceId: "ws-1" };

/**
 * A task with pending approvals and a send path that, like the store's,
 * declines through the callback right before it delivers a steer.
 */
function createHarness(options: {
  approvals: string[];
  declineOutcome?: (requestId: string) => ApprovalAnswerOutcome;
  /** What the send path does with a steer, after (or instead of) declining. */
  steer?: "accept" | "unavailable-before-decline" | "reject-after-decline" | "blocked-before-decline" | "unknown";
  queueRefusal?: Extract<SendUserMessageResult, { status: "blocked" }>;
  /** Runs while a decline is in flight, e.g. to add an approval that arrives meanwhile. */
  whileDeclining?: (requestId: string, pending: Set<string>) => void;
  /** Requests whose decline reports success but stay pending. */
  stuck?: string[];
  /** Runs inside the queue send before the store checks for pending approvals. */
  beforeQueueCheck?: (pending: Set<string>) => void;
}) {
  const pending = new Set(options.approvals);
  const log: string[] = [];
  let draftCurrent = true;
  const decline = async ({ requestId }: PendingApprovalTarget) => {
    log.push(`decline ${requestId}`);
    options.whileDeclining?.(requestId, pending);
    await Promise.resolve();
    const outcome = options.declineOutcome?.(requestId) ?? { status: "delivered" };
    if (outcome.status !== "failed" && !options.stuck?.includes(requestId)) {
      pending.delete(requestId);
    }
    return outcome;
  };
  const send = async (request: {
    intent: "steer" | "queue";
    declinePendingApprovals?: () => Promise<boolean>;
  }): Promise<SendUserMessageResult> => {
    if (request.intent === "steer") {
      const steer = options.steer ?? "accept";
      if (steer === "unavailable-before-decline") {
        log.push("steer unavailable");
        return { status: "steer-unavailable", ...IDS, message: "steering unavailable" };
      }
      if (steer === "blocked-before-decline") {
        log.push("steer blocked");
        return { status: "blocked", reason: "account-limit" };
      }
      if (request.declinePendingApprovals && !(await request.declinePendingApprovals())) {
        log.push("steer stopped");
        return { status: "blocked" };
      }
      if (steer === "reject-after-decline") {
        log.push("steer rejected");
        return { status: "steer-unavailable", ...IDS, message: "turn not steerable" };
      }
      if (steer === "unknown") {
        log.push("steer unconfirmed");
        return { status: "steer-delivery-unknown", ...IDS, message: "unconfirmed" };
      }
      log.push(`steer (pending ${pending.size})`);
      return { status: "steered", ...IDS, turnId: "turn-1" };
    }
    options.beforeQueueCheck?.(pending);
    if (pending.size > 0) {
      // The store refuses to queue while an approval waits.
      log.push("queue blocked by pending approval");
      return { status: "blocked", reason: "approval-pending" };
    }
    log.push("queue");
    return { status: "queued", ...IDS };
  };
  return {
    log,
    pending,
    setDraftCurrent: (value: boolean) => {
      draftCurrent = value;
    },
    run: (preferSteer: boolean) =>
      sendWithApprovalRedirect({
        preferSteer,
        readPendingApprovals: () =>
          [...pending].map((requestId) => ({ messageId: "m-1", requestId })),
        decline,
        isDraftCurrent: () => draftCurrent,
        queueRefusal: () => options.queueRefusal ?? null,
        send,
      }),
  };
}

describe("sendWithApprovalRedirect", () => {
  test("declines every pending approval, then steers the message into the turn", async () => {
    const harness = createHarness({ approvals: ["a", "b"] });
    await expect(harness.run(true)).resolves.toEqual({ kind: "delivered", via: "steered" });
    expect(harness.log).toEqual(["decline a", "decline b", "steer (pending 0)"]);
  });

  test("a failed decline sends nothing and stops declining", async () => {
    const harness = createHarness({
      approvals: ["a", "b", "c"],
      declineOutcome: (requestId) =>
        requestId === "b" ? { status: "failed", message: "provider refused" } : { status: "delivered" },
    });
    await expect(harness.run(true)).resolves.toEqual({
      kind: "decline-failed",
      message: "provider refused",
    });
    expect(harness.log).toEqual(["decline a", "decline b", "steer stopped"]);
    expect([...harness.pending]).toEqual(["b", "c"]);
  });

  test("a draft edited while approvals are declined is not sent", async () => {
    const harness = createHarness({
      approvals: ["a"],
      declineOutcome: () => {
        harness.setDraftCurrent(false);
        return { status: "delivered" };
      },
    });
    await expect(harness.run(true)).resolves.toEqual({ kind: "draft-changed" });
    expect(harness.log).toEqual(["decline a", "steer stopped"]);
  });

  test("an approval the provider can no longer answer is skipped, not fatal", async () => {
    const harness = createHarness({
      approvals: ["gone", "live"],
      declineOutcome: (requestId) =>
        requestId === "gone" ? { status: "skipped" } : { status: "delivered" },
    });
    await expect(harness.run(true)).resolves.toEqual({ kind: "delivered", via: "steered" });
    expect(harness.log).toEqual(["decline gone", "decline live", "steer (pending 0)"]);
  });

  test("a steer the send path refuses up front leaves the approvals alone", async () => {
    const harness = createHarness({ approvals: ["a"], steer: "blocked-before-decline" });
    const outcome = await harness.run(true);
    expect(outcome.kind).toBe("not-sent");
    expect(harness.log).toEqual(["steer blocked"]);
    expect([...harness.pending]).toEqual(["a"]);
  });

  test("when the turn cannot be steered, the approvals are declined and the message queued", async () => {
    const harness = createHarness({ approvals: ["a"], steer: "unavailable-before-decline" });
    await expect(harness.run(true)).resolves.toEqual({ kind: "delivered", via: "queued" });
    expect(harness.log).toEqual(["steer unavailable", "decline a", "queue"]);
  });

  test("a steer rejected after the declines is queued instead of dropped", async () => {
    const harness = createHarness({ approvals: ["a"], steer: "reject-after-decline" });
    await expect(harness.run(true)).resolves.toEqual({ kind: "delivered", via: "queued" });
    expect(harness.log).toEqual(["decline a", "steer rejected", "queue"]);
  });

  test("a provider without steering declines, then queues for the next turn", async () => {
    const harness = createHarness({ approvals: ["a", "b"] });
    await expect(harness.run(false)).resolves.toEqual({ kind: "delivered", via: "queued" });
    expect(harness.log).toEqual(["decline a", "decline b", "queue"]);
  });

  test("a queue the send path would refuse leaves the approvals alone", async () => {
    const harness = createHarness({
      approvals: ["a"],
      queueRefusal: { status: "blocked", reason: "auto-routing-disabled" },
    });
    await expect(harness.run(false)).resolves.toEqual({
      kind: "not-sent",
      result: { status: "blocked", reason: "auto-routing-disabled" },
    });
    expect(harness.log).toEqual([]);
    expect([...harness.pending]).toEqual(["a"]);
  });

  test("an unconfirmed steer is reported, not resent", async () => {
    const harness = createHarness({ approvals: ["a"], steer: "unknown" });
    await expect(harness.run(true)).resolves.toEqual({
      kind: "delivery-unknown",
      message: "unconfirmed",
    });
    expect(harness.log).toEqual(["decline a", "steer unconfirmed"]);
  });

  test("with nothing left pending the message is still delivered", async () => {
    const harness = createHarness({ approvals: [] });
    await expect(harness.run(true)).resolves.toEqual({ kind: "delivered", via: "steered" });
    expect(harness.log).toEqual(["steer (pending 0)"]);
  });
});

describe("approvals that arrive while the redirect declines", () => {
  const stillPending = i18n.t("notifications:approvalAnswer.stillPendingAfterDecline");
  const arriveWhileDeclining = (trigger: string, arrival: string) =>
    (requestId: string, pending: Set<string>) => {
      if (requestId === trigger) pending.add(arrival);
    };

  test("an approval that arrives while another is declined is declined before the steer", async () => {
    const harness = createHarness({ approvals: ["b"], whileDeclining: arriveWhileDeclining("b", "c") });
    await expect(harness.run(true)).resolves.toEqual({ kind: "delivered", via: "steered" });
    expect(harness.log).toEqual(["decline b", "decline c", "steer (pending 0)"]);
  });

  test("an approval that arrives while another is declined is declined before the queue", async () => {
    const harness = createHarness({ approvals: ["b"], whileDeclining: arriveWhileDeclining("b", "c") });
    await expect(harness.run(false)).resolves.toEqual({ kind: "delivered", via: "queued" });
    expect(harness.log).toEqual(["decline b", "decline c", "queue"]);
  });

  test("a late approval that cannot be declined sends nothing", async () => {
    for (const preferSteer of [true, false]) {
      const harness = createHarness({
        approvals: ["b"],
        whileDeclining: arriveWhileDeclining("b", "c"),
        declineOutcome: (requestId) =>
          requestId === "c" ? { status: "failed", message: "provider refused" } : { status: "delivered" },
      });
      await expect(harness.run(preferSteer)).resolves.toEqual({
        kind: "decline-failed",
        message: "provider refused",
      });
      expect(harness.log.filter((line) => line.startsWith("steer (") || line === "queue")).toEqual([]);
      expect([...harness.pending]).toEqual(["c"]);
    }
  });

  test("an approval still pending after its decline is declined once, then fails the redirect", async () => {
    for (const preferSteer of [true, false]) {
      const harness = createHarness({ approvals: ["b"], stuck: ["b"] });
      await expect(harness.run(preferSteer)).resolves.toEqual({
        kind: "decline-failed",
        message: stillPending,
      });
      expect(harness.log.filter((line) => line.startsWith("decline"))).toEqual(["decline b"]);
      expect(harness.log.filter((line) => line.startsWith("steer (") || line === "queue")).toEqual([]);
    }
  });

  test("approvals that never stop arriving end the declines and send nothing", async () => {
    let next = 0;
    const harness = createHarness({
      approvals: ["a0"],
      whileDeclining: (_requestId, pending) => {
        next += 1;
        pending.add(`a${next}`);
      },
    });
    await expect(harness.run(true)).resolves.toEqual({
      kind: "decline-failed",
      message: stillPending,
    });
    expect(harness.log.filter((line) => line.startsWith("decline")).length).toBe(32);
    expect(harness.log).not.toContain("steer (pending 0)");
  });

  test("an approval that lands while the queue send runs is reported, not silently dropped", async () => {
    const harness = createHarness({
      approvals: ["a"],
      beforeQueueCheck: (pending) => pending.add("late"),
    });
    await expect(harness.run(false)).resolves.toEqual({
      kind: "not-sent",
      result: { status: "blocked", reason: "approval-pending" },
    });
    expect(harness.log).toEqual(["decline a", "queue blocked by pending approval"]);
  });
});

describe("resolveApprovalRedirectMode", () => {
  const base = {
    pendingApprovalCount: 1,
    blockingUserInputPending: false,
    isTurnActive: true,
    canSteerRunningTurn: true,
  };

  test("no pending approval keeps the normal send path", () => {
    expect(resolveApprovalRedirectMode({ ...base, pendingApprovalCount: 0 })).toBeNull();
  });

  test("a blocking question keeps owning the composer", () => {
    expect(resolveApprovalRedirectMode({ ...base, blockingUserInputPending: true })).toBeNull();
  });

  test("approvals without a running turn keep the composer blocked", () => {
    expect(resolveApprovalRedirectMode({ ...base, isTurnActive: false })).toBeNull();
  });

  test("each provider redirects through the path it supports", () => {
    const modes = Object.fromEntries(
      listProviderIds().map((providerId) => [
        providerId,
        resolveApprovalRedirectMode({
          ...base,
          canSteerRunningTurn: providerSupportsMidTurnSteering({ providerId }),
        }),
      ]),
    );
    expect(modes).toEqual({
      "claude-code": "steer",
      codex: "steer",
      kiro: "steer",
      cursor: "queue",
      opencode: "queue",
    });
  });
});
