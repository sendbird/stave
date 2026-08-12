import { describe, expect, test } from "bun:test";
import {
  applyAdvisorActivityEvents,
  clearAdvisorExchange,
  formatAdvisorDuration,
  isAdvisorArmedOnly,
  isAdvisorExchangeBlocking,
  isAdvisorExchangeTerminal,
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
  describeAdvisorPhase,
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

/** One on-demand consult: started by the primary, answered by the advisor. */
const SUCCESSFUL_EXCHANGE: NormalizedProviderEvent[] = [
  advisorEvent({
    phase: "started",
    exchangeId: "exchange-1",
    consultIndex: 1,
    consultLimit: 5,
    question: "Is the cancellation path sound?",
    primaryModel: "claude-opus-4-6",
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
    isolation: "codex-ephemeral-read-only",
    timeoutMs: 90_000,
  }),
  advisorEvent({
    phase: "completed",
    exchangeId: "exchange-1",
    consultIndex: 1,
    consultLimit: 5,
    at: T0 + 4_000,
    durationMs: 4_000,
    advice: "Check the cancellation path.",
    adviceChars: 27,
    inputTokens: 900,
    outputTokens: 120,
  }),
];

describe("advisor exchange reducer", () => {
  test("folds one consult into a settled snapshot", () => {
    const snapshot = fold(SUCCESSFUL_EXCHANGE);

    expect(snapshot.outcome).toBe("completed");
    expect(snapshot.exchangeId).toBe("exchange-1");
    expect(snapshot.consultIndex).toBe(1);
    expect(snapshot.consultLimit).toBe(5);
    expect(snapshot.settledConsults).toBe(1);
    expect(snapshot.advisorModel).toBe("gpt-5.6-sol");
    expect(snapshot.stages.map((stage) => stage.phase)).toEqual([
      "started",
      "completed",
    ]);
  });

  test("captures the question the primary asked", () => {
    const snapshot = fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]);

    expect(snapshot.question).toBe("Is the cancellation path sound?");
    expect(snapshot.outcome).toBe("pending");
    expect(snapshot.settledConsults).toBe(0);
  });

  test("later phases cannot blank the identity reported at start", () => {
    const snapshot = fold([
      SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
      // The outcome event carries no advisor identity; spreading it must not
      // erase who was consulted.
      advisorEvent({ phase: "completed", at: T0 + 100, durationMs: 100 }),
    ]);

    expect(snapshot.advisorProviderId).toBe("codex");
    expect(snapshot.isolation).toBe("codex-ephemeral-read-only");
    expect(snapshot.question).toBe("Is the cancellation path sound?");
  });

  test("a started event with a new exchangeId opens a fresh consult card", () => {
    const snapshot = fold([
      ...SUCCESSFUL_EXCHANGE,
      advisorEvent({
        phase: "started",
        exchangeId: "exchange-2",
        consultIndex: 2,
        consultLimit: 5,
        question: "And the usage accounting?",
        at: T0 + 10_000,
        timeoutMs: 90_000,
      }),
    ]);

    // The new consult replaces the card, but how many consults already
    // settled this turn is carried forward so "Consult 2/5" stays truthful.
    expect(snapshot.exchangeId).toBe("exchange-2");
    expect(snapshot.outcome).toBe("pending");
    expect(snapshot.settledConsults).toBe(1);
    expect(snapshot.consultIndex).toBe(2);
    expect(snapshot.consultLimit).toBe(5);
    expect(snapshot.question).toBe("And the usage accounting?");
    expect(snapshot.startedAt).toBe(T0 + 10_000);
    expect(snapshot.stages.map((stage) => stage.phase)).toEqual(["started"]);
  });

  test("each terminal outcome increments the settled count", () => {
    const snapshot = fold([
      ...SUCCESSFUL_EXCHANGE,
      advisorEvent({
        phase: "started",
        exchangeId: "exchange-2",
        consultIndex: 2,
        consultLimit: 5,
        at: T0 + 10_000,
      }),
      advisorEvent({
        phase: "timeout",
        exchangeId: "exchange-2",
        at: T0 + 100_000,
        durationMs: 90_000,
        detail: "timed out after 90 seconds.",
      }),
    ]);

    expect(snapshot.outcome).toBe("timeout");
    expect(snapshot.settledConsults).toBe(2);
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
    expect(second["task-1"]?.outcome).toBe("pending");
    expect(second["task-1"]?.settledConsults).toBe(0);
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
    expect(snapshot.settledConsults).toBe(1);
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

  test("blocking is true exactly while the consult is pending", () => {
    const pending = fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]);

    expect(isAdvisorExchangeBlocking(pending)).toBe(true);
    expect(isAdvisorExchangeBlocking(fold(SUCCESSFUL_EXCHANGE))).toBe(false);
  });
});

describe("advisor exchange verification checks", () => {
  test("a healthy cross-model consult passes every check", () => {
    const checks = buildAdvisorChecks(fold(SUCCESSFUL_EXCHANGE));

    expect(checks.map((check) => check.id)).toEqual([
      "cross_model",
      "isolation",
      "advice",
      "usage",
    ]);
    expect(checks.every((check) => check.status === "pass")).toBe(true);
  });

  test("a pending consult reports downstream checks as pending", () => {
    const byId = Object.fromEntries(
      buildAdvisorChecks(
        fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
      ).map((check) => [check.id, check.status]),
    );

    expect(byId.advice).toBe("pending");
    expect(byId.usage).toBe("pending");
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
    ]);
    const byId = Object.fromEntries(
      buildAdvisorChecks(snapshot).map((check) => [check.id, check.status]),
    );

    // A timed-out advisor did not fail to return advice; it never had any.
    expect(byId.advice).toBe("skipped");
    expect(byId.usage).toBe("skipped");
    expect(byId.cross_model).toBe("pass");
    expect(describeAdvisorExchangeStatus(snapshot)).toContain(
      "primary turn continued",
    );
  });
});

describe("advisor exchange presentation", () => {
  test("a running consult stays visible regardless of elapsed time", () => {
    const snapshot = fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]);

    expect(
      resolveAdvisorExchangeVisibility({
        snapshot,
        nowMs: T0 + 10 * 60_000,
        pinned: false,
      }),
    ).toBe(true);
  });

  test("a completed consult clears on the settled linger, unless the user is reading it", () => {
    const snapshot = fold(SUCCESSFUL_EXCHANGE);
    const afterLinger = T0 + 4_000 + ADVISOR_EXCHANGE_SETTLED_LINGER_MS + 1;

    // Advice returns to the primary as the tool result itself, so a completed
    // consult is unconditionally healthy — it always uses the short linger.
    expect(resolveAdvisorExchangeLingerMs(snapshot)).toBe(
      ADVISOR_EXCHANGE_SETTLED_LINGER_MS,
    );
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

  test("tone tracks the outcome, and completed is always positive", () => {
    expect(
      resolveAdvisorExchangeTone(
        fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
      ),
    ).toBe("active");
    expect(resolveAdvisorExchangeTone(fold(SUCCESSFUL_EXCHANGE))).toBe(
      "positive",
    );
    expect(
      resolveAdvisorExchangeTone(
        fold([
          SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
          advisorEvent({ phase: "failed", at: T0 + 800, detail: "boom" }),
        ]),
      ),
    ).toBe("caution");
  });

  test("status copy states what happened to the primary turn", () => {
    expect(
      describeAdvisorExchangeStatus(
        fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
      ),
    ).toBe("The primary is waiting on the advisor's answer.");
    expect(describeAdvisorExchangeStatus(fold(SUCCESSFUL_EXCHANGE))).toBe(
      "Advice returned to the primary in 4s.",
    );
    expect(
      describeAdvisorExchangeStatus(
        fold([
          SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
          advisorEvent({ phase: "skipped", at: T0 + 500, detail: "cancelled" }),
        ]),
      ),
    ).toBe("Consult cancelled. The primary turn continued without advice.");
    expect(
      describeAdvisorExchangeStatus(
        fold([
          SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent,
          advisorEvent({ phase: "aborted", at: T0 + 500 }),
        ]),
      ),
    ).toBe("Turn cancelled during an advisor consult.");
  });

  test("the badge is simply the outcome", () => {
    expect(
      describeAdvisorExchangeBadge(
        fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
      ),
    ).toBe("Running");
    expect(describeAdvisorExchangeBadge(fold(SUCCESSFUL_EXCHANGE))).toBe(
      "Completed",
    );
  });

  test("the skipped phase reads as a cancelled consult", () => {
    expect(describeAdvisorPhase("skipped")).toBe("Consult cancelled");
  });

  test("lane segments show the primary blocked for the whole consult", () => {
    const lanes = resolveAdvisorLaneSegments({
      snapshot: fold(SUCCESSFUL_EXCHANGE),
      // The window ends at the outcome, not at now: an old settled card must
      // not keep growing its elapsed time.
      nowMs: T0 + 60_000,
    });

    expect(lanes.elapsedMs).toBe(4_000);
    expect(lanes.advisorFraction).toBe(1);
    // During an on-demand consult the primary waits on the tool result for the
    // whole exchange, so the blocked span equals the advisor span.
    expect(lanes.blockedFraction).toBe(lanes.advisorFraction);
  });

  test("a pending consult fills the bar rather than collapsing to zero", () => {
    const lanes = resolveAdvisorLaneSegments({
      snapshot: fold([SUCCESSFUL_EXCHANGE[0] as NormalizedProviderEvent]),
      nowMs: T0 + 3_000,
    });

    expect(lanes.elapsedMs).toBe(3_000);
    expect(lanes.advisorFraction).toBe(1);
    expect(lanes.blockedFraction).toBe(1);
  });

  test("the deadline countdown only runs while the consult is pending", () => {
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
    // Identity fields fill in and never blank, so an outcome event that omits
    // the tier must not wipe what `started` already reported.
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
  test("consult identity and question survive validation instead of being stripped", () => {
    // Zod drops unknown keys, so a field missing from the schema would reach
    // the reducer as `undefined` and the monitor would silently lose it.
    const parsed = NormalizedProviderEventSchema.parse({
      type: "advisor_activity",
      phase: "started",
      exchangeId: "exchange-1",
      consultIndex: 1,
      consultLimit: 5,
      question: "Is the cancellation path sound?",
      primaryProviderId: "claude-code",
      advisorProviderId: "codex",
      advisorModel: "gpt-5.6-sol",
      advisorEffort: "ultra",
      isolation: "codex-ephemeral-read-only",
      at: T0,
    });

    expect(parsed).toMatchObject({
      exchangeId: "exchange-1",
      consultIndex: 1,
      consultLimit: 5,
      question: "Is the cancellation path sound?",
      advisorEffort: "ultra",
    });
  });

  test("removed preflight phases are rejected at the event boundary", () => {
    for (const phase of ["applied", "primary_started"]) {
      expect(
        NormalizedProviderEventSchema.safeParse({
          type: "advisor_activity",
          phase,
          primaryProviderId: "claude-code",
          at: T0,
        }).success,
      ).toBe(false);
    }
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

  describe("the turn-level grant record", () => {
    const ARMED = advisorEvent({
      phase: "armed",
      consultLimit: 5,
      advisorProviderId: "codex",
      advisorModel: "gpt-5.6-sol",
      advisorEffort: "xhigh",
    });

    test("an armed turn is recorded without counting as an exchange", () => {
      const snapshot = fold([ARMED]);

      expect(snapshot.outcome).toBe("armed");
      expect(snapshot.settledConsults).toBe(0);
      expect(snapshot.consultLimit).toBe(5);
      expect(snapshot.advisorModel).toBe("gpt-5.6-sol");
      // Armed is neither running nor finished: the turn is not blocked on it,
      // and nothing has settled that a surface could report as an outcome.
      expect(isAdvisorArmedOnly(snapshot)).toBe(true);
      expect(isAdvisorExchangeBlocking(snapshot)).toBe(false);
      expect(isAdvisorExchangeTerminal(snapshot)).toBe(false);
    });

    test("the grant never pops the floating exchange card", () => {
      expect(
        resolveAdvisorExchangeVisibility({
          snapshot: fold([ARMED]),
          nowMs: T0,
          pinned: false,
        }),
      ).toBe(false);
    });

    test("the first consult replaces the grant instead of inheriting it", () => {
      const snapshot = fold([ARMED, ...SUCCESSFUL_EXCHANGE]);

      expect(snapshot.outcome).toBe("completed");
      expect(snapshot.settledConsults).toBe(1);
      // Start time comes from the consult, not the grant: the deadline
      // countdown would otherwise begin before the primary ever asked.
      expect(snapshot.startedAt).toBe(
        (SUCCESSFUL_EXCHANGE[0] as { at: number }).at,
      );
      expect(snapshot.stages[0]?.phase).toBe("started");
    });

    test("a repeated grant cannot erase consults already folded", () => {
      const snapshot = fold([ARMED, ...SUCCESSFUL_EXCHANGE, ARMED]);

      expect(snapshot.outcome).toBe("completed");
      expect(snapshot.settledConsults).toBe(1);
    });

    test("the armed phase survives the event boundary", () => {
      expect(
        NormalizedProviderEventSchema.safeParse({
          type: "advisor_activity",
          phase: "armed",
          primaryProviderId: "claude-code",
          consultLimit: 5,
          at: T0,
        }).success,
      ).toBe(true);
    });
  });
});
