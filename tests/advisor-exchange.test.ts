import { describe, expect, test } from "bun:test";
import {
  applyAdvisorActivityEvents,
  clearAdvisorExchange,
  formatAdvisorDuration,
  isAdvisorExchangeBlocking,
  type AdvisorExchangeSnapshot,
} from "../src/lib/providers/advisor-activity";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import {
  ADVISOR_EXCHANGE_ATTENTION_LINGER_MS,
  ADVISOR_EXCHANGE_SETTLED_LINGER_MS,
  buildAdvisorChecks,
  describeAdvisorEffort,
  describeAdvisorExchangeBadge,
  describeAdvisorExchangeStatus,
  resolveAdvisorExchangeLingerMs,
  resolveAdvisorExchangeTone,
  resolveAdvisorExchangeVisibility,
  resolveAdvisorLaneSegments,
  resolveAdvisorRemainingMs,
} from "../src/components/session/advisor-exchange.utils";

const T0 = 1_700_000_000_000;

function advisorEvent(
  event: Partial<Extract<NormalizedProviderEvent, { type: "advisor_activity" }>> & {
    phase: Extract<
      NormalizedProviderEvent,
      { type: "advisor_activity" }
    >["phase"];
  },
): NormalizedProviderEvent {
  return {
    type: "advisor_activity",
    primaryProviderId: "claude-code",
    at: T0,
    ...event,
  } as NormalizedProviderEvent;
}

function fold(events: NormalizedProviderEvent[], turnId = "turn-1") {
  return applyAdvisorActivityEvents({
    exchangeByTask: {},
    taskId: "task-1",
    turnId,
    events,
  })["task-1"] as AdvisorExchangeSnapshot;
}

const SUCCESSFUL_EXCHANGE: NormalizedProviderEvent[] = [
  advisorEvent({
    phase: "started",
    primaryModel: "claude-opus-4-6",
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
    isolation: "codex-ephemeral-read-only",
    timeoutMs: 90_000,
  }),
  advisorEvent({
    phase: "completed",
    at: T0 + 4_000,
    durationMs: 4_000,
    advice: "Check the cancellation path.",
    adviceChars: 27,
    inputTokens: 900,
    outputTokens: 120,
  }),
  advisorEvent({
    phase: "applied",
    at: T0 + 4_050,
    injectedChars: 1_284,
    injectedPartIndex: 0,
  }),
  advisorEvent({ phase: "primary_started", at: T0 + 4_120 }),
];

describe("advisor exchange reducer", () => {
  test("folds a full exchange into one snapshot", () => {
    const snapshot = fold(SUCCESSFUL_EXCHANGE);

    expect(snapshot.outcome).toBe("completed");
    expect(snapshot.applied).toBe(true);
    expect(snapshot.injectedPartIndex).toBe(0);
    expect(snapshot.primaryStartedAt).toBe(T0 + 4_120);
    expect(snapshot.advisorModel).toBe("gpt-5.6-sol");
    expect(snapshot.stages.map((stage) => stage.phase)).toEqual([
      "started",
      "completed",
      "applied",
      "primary_started",
    ]);
  });

  test("later phases cannot blank the identity reported at start", () => {
    const snapshot = fold([
      SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
      advisorEvent({ phase: "primary_started", at: T0 + 100 }),
    ]);

    // `primary_started` carries no advisor identity; spreading it must not
    // erase who was consulted.
    expect(snapshot.advisorProviderId).toBe("codex");
    expect(snapshot.isolation).toBe("codex-ephemeral-read-only");
  });

  test("a new turn replaces the previous exchange instead of merging", () => {
    const first = applyAdvisorActivityEvents({
      exchangeByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      events: SUCCESSFUL_EXCHANGE,
    });
    const second = applyAdvisorActivityEvents({
      exchangeByTask: first,
      taskId: "task-1",
      turnId: "turn-2",
      events: [advisorEvent({ phase: "started", at: T0 + 60_000 })],
    });

    expect(second["task-1"]?.turnId).toBe("turn-2");
    expect(second["task-1"]?.applied).toBe(false);
    expect(second["task-1"]?.outcome).toBe("pending");
  });

  test("keeps a stable reference when no advisor events are present", () => {
    const map = { "task-1": fold(SUCCESSFUL_EXCHANGE) };
    const next = applyAdvisorActivityEvents({
      exchangeByTask: map,
      taskId: "task-1",
      turnId: "turn-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
    });

    expect(next).toBe(map);
  });

  test("recovers an outcome even when the started phase was evicted", () => {
    const snapshot = fold([
      advisorEvent({
        phase: "timeout",
        at: T0 + 90_000,
        durationMs: 90_000,
        advisorProviderId: "codex",
        advisorModel: "gpt-5.6-sol",
        detail: "the Advisor did not respond within 90 seconds.",
      }),
    ]);

    expect(snapshot.outcome).toBe("timeout");
    expect(snapshot.detail).toContain("90 seconds");
  });

  test("clearAdvisorExchange only allocates when the task is present", () => {
    const map = { "task-1": fold(SUCCESSFUL_EXCHANGE) };

    expect(clearAdvisorExchange({ exchangeByTask: map, taskId: "task-2" })).toBe(
      map,
    );
    expect(
      clearAdvisorExchange({ exchangeByTask: map, taskId: "task-1" }),
    ).toEqual({});
  });

  test("blocking is true only while the primary has not started", () => {
    const pending = fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]);

    expect(isAdvisorExchangeBlocking(pending)).toBe(true);
    expect(isAdvisorExchangeBlocking(fold(SUCCESSFUL_EXCHANGE))).toBe(false);
  });
});

describe("advisor exchange verification checks", () => {
  test("a healthy cross-model exchange passes every check", () => {
    const checks = buildAdvisorChecks(fold(SUCCESSFUL_EXCHANGE));

    expect(checks.every((check) => check.status === "pass")).toBe(true);
    expect(checks.find((check) => check.id === "applied")?.detail).toContain(
      "retrieved_context part 0",
    );
  });

  test("advice that never reached the prompt fails, and does so loudly", () => {
    const snapshot = fold(SUCCESSFUL_EXCHANGE.slice(0, 2));
    const applied = buildAdvisorChecks(snapshot).find(
      (check) => check.id === "applied",
    );

    // The silent failure this surface exists to expose: the advisor answered,
    // the primary model never saw it.
    expect(applied?.status).toBe("fail");
    expect(resolveAdvisorExchangeTone(snapshot)).toBe("danger");
    // The advisor completed, but the exchange did not: badging this
    // "Completed" would report the failure as a success.
    expect(describeAdvisorExchangeBadge(snapshot)).toBe("Not applied");
    expect(describeAdvisorExchangeStatus(snapshot)).toContain(
      "never reached the primary prompt",
    );
    // ...and it must not vanish on the success timer.
    expect(resolveAdvisorExchangeLingerMs(snapshot)).toBe(
      ADVISOR_EXCHANGE_ATTENTION_LINGER_MS,
    );
  });

  test("an advisor that is the same model as the primary fails the cross-model check", () => {
    const snapshot = fold([
      advisorEvent({
        phase: "started",
        primaryModel: "claude-opus-4-6",
        advisorProviderId: "claude-code",
        advisorModel: "claude-opus-4-6",
        isolation: "claude-tools-disabled",
      }),
      advisorEvent({ phase: "completed", at: T0 + 500, advice: "Looks fine." }),
    ]);
    const crossModel = buildAdvisorChecks(snapshot).find(
      (check) => check.id === "cross_model",
    );

    expect(crossModel?.status).toBe("fail");
    expect(crossModel?.detail).toContain("both");
  });

  test("a timeout marks downstream checks skipped, not failed", () => {
    const snapshot = fold([
      SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
      advisorEvent({
        phase: "timeout",
        at: T0 + 90_000,
        durationMs: 90_000,
        detail: "the Advisor did not respond within 90 seconds.",
      }),
      advisorEvent({ phase: "primary_started", at: T0 + 90_050 }),
    ]);
    const byId = Object.fromEntries(
      buildAdvisorChecks(snapshot).map((check) => [check.id, check.status]),
    );

    // A timed-out advisor did not fail to inject advice; it never had any.
    expect(byId.advice).toBe("skipped");
    expect(byId.applied).toBe("skipped");
    expect(byId.cross_model).toBe("pass");
    expect(byId.primary).toBe("pass");
    expect(describeAdvisorExchangeStatus(snapshot)).toContain(
      "primary turn continued",
    );
  });

  test("an abort reports that the primary never ran", () => {
    const snapshot = fold([
      SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
      advisorEvent({ phase: "aborted", at: T0 + 2_000, durationMs: 2_000 }),
    ]);
    const primary = buildAdvisorChecks(snapshot).find(
      (check) => check.id === "primary",
    );

    expect(primary?.status).toBe("skipped");
    expect(primary?.detail).toContain("cancelled");
  });
});

describe("advisor exchange presentation", () => {
  test("a running exchange stays visible regardless of elapsed time", () => {
    const snapshot = fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]);

    expect(
      resolveAdvisorExchangeVisibility({
        snapshot,
        nowMs: T0 + 10 * 60_000,
        pinned: false,
      }),
    ).toBe(true);
  });

  test("a settled exchange hides after its linger, unless the user is reading it", () => {
    const snapshot = fold(SUCCESSFUL_EXCHANGE);
    const afterLinger = T0 + 4_120 + ADVISOR_EXCHANGE_SETTLED_LINGER_MS + 1;

    expect(
      resolveAdvisorExchangeVisibility({
        snapshot,
        nowMs: afterLinger,
        pinned: false,
      }),
    ).toBe(false);
    expect(
      resolveAdvisorExchangeVisibility({
        snapshot,
        nowMs: afterLinger,
        pinned: true,
      }),
    ).toBe(true);
  });

  test("a failure lingers long enough to be read", () => {
    const snapshot = fold([
      SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
      advisorEvent({
        phase: "failed",
        at: T0 + 800,
        durationMs: 800,
        detail: "Codex authentication is required.",
      }),
    ]);

    expect(
      resolveAdvisorExchangeVisibility({
        snapshot,
        nowMs: T0 + 800 + ADVISOR_EXCHANGE_SETTLED_LINGER_MS + 1,
        pinned: false,
      }),
    ).toBe(true);
    expect(
      resolveAdvisorExchangeVisibility({
        snapshot,
        nowMs: T0 + 800 + ADVISOR_EXCHANGE_ATTENTION_LINGER_MS + 1,
        pinned: false,
      }),
    ).toBe(false);
  });

  test("lane segments expose how long the primary was blocked", () => {
    const lanes = resolveAdvisorLaneSegments({
      snapshot: fold(SUCCESSFUL_EXCHANGE),
      nowMs: T0 + 4_120,
    });

    expect(lanes.elapsedMs).toBe(4_120);
    expect(lanes.advisorFraction).toBeCloseTo(4_000 / 4_120, 3);
    // The blocked span always covers at least the advisor span: the primary
    // cannot start before the advisor releases the turn.
    expect(lanes.blockedFraction).toBeGreaterThanOrEqual(lanes.advisorFraction);
    expect(lanes.blockedFraction).toBe(1);
  });

  test("a pending exchange fills the bar rather than collapsing to zero", () => {
    const lanes = resolveAdvisorLaneSegments({
      snapshot: fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
      nowMs: T0 + 3_000,
    });

    expect(lanes.elapsedMs).toBe(3_000);
    expect(lanes.advisorFraction).toBe(1);
  });

  test("the deadline countdown stops once the primary turn starts", () => {
    expect(
      resolveAdvisorRemainingMs({
        snapshot: fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
        nowMs: T0 + 10_000,
      }),
    ).toBe(80_000);
    expect(
      resolveAdvisorRemainingMs({
        snapshot: fold(SUCCESSFUL_EXCHANGE),
        nowMs: T0 + 10_000,
      }),
    ).toBeNull();
  });

  test("sub-second advisors are not rounded up to a full second", () => {
    expect(formatAdvisorDuration(150)).toBe("150ms");
    expect(formatAdvisorDuration(0)).toBe("0ms");
    expect(formatAdvisorDuration(4_120)).toBe("4.1s");
  });
});

describe("advisor effort reporting", () => {
  test("the snapshot carries the tier the runtime reported", () => {
    expect(
      fold([
        advisorEvent({
          phase: "started",
          advisorProviderId: "codex",
          advisorModel: "gpt-5.6-sol",
          advisorEffort: "low",
        }),
      ]).advisorEffort,
    ).toBe("low");
  });

  test("a later phase that omits the tier cannot erase it", () => {
    // Identity fields fill in and never blank, so an invalid-target skip must
    // not wipe what `started` already reported.
    expect(
      fold([
        advisorEvent({
          phase: "started",
          advisorProviderId: "codex",
          advisorModel: "gpt-5.6-sol",
          advisorEffort: "ultra",
        }),
        advisorEvent({ phase: "completed", at: T0 + 500, durationMs: 500 }),
      ]).advisorEffort,
    ).toBe("ultra");
  });

  test("an unreported tier reads as unknown rather than a guessed default", () => {
    // The renderer knows the pinned tier but not what survived clamping, and
    // this panel reports what happened, not what was asked for.
    expect(describeAdvisorEffort(undefined)).toBe("Not reported");
    expect(describeAdvisorEffort("xhigh")).toBe("X-High");
  });
});

describe("advisor event schema", () => {
  test("the reported tier survives validation instead of being stripped", () => {
    // Zod drops unknown keys, so a field missing from the schema would reach
    // the reducer as `undefined` and the monitor would read "Not reported"
    // forever, with nothing failing anywhere.
    const parsed = NormalizedProviderEventSchema.parse({
      type: "advisor_activity",
      phase: "started",
      primaryProviderId: "claude-code",
      advisorProviderId: "codex",
      advisorModel: "gpt-5.6-sol",
      advisorEffort: "ultra",
      isolation: "codex-ephemeral-read-only",
      at: T0,
    });

    expect(parsed).toMatchObject({ advisorEffort: "ultra" });
  });

  test("an unselectable tier is rejected at the event boundary too", () => {
    expect(
      NormalizedProviderEventSchema.safeParse({
        type: "advisor_activity",
        phase: "started",
        primaryProviderId: "claude-code",
        advisorEffort: "minimal",
        at: T0,
      }).success,
    ).toBe(false);
  });
});
