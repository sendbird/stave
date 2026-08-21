import { describe, expect, test } from "bun:test";
import {
  applyAdvisorActivityEvents,
  buildAdvisorExchangePatch,
  clearAdvisorExchange,
  formatAdvisorDuration,
  isAdvisorArmedOnly,
  isAdvisorExchangeBlocking,
  isAdvisorExchangeTerminal,
  type AdvisorExchangeSnapshot,
} from "../src/lib/providers/advisor-activity";
import {
  ADVISOR_CONSULT_LOG_LIMIT,
  ADVISOR_CONSULT_LOG_TASK_LIMIT,
  EMPTY_ADVISOR_CONSULT_LOG,
  advisorConsultLogEntryKey,
  selectAdvisorConsultLog,
  setAdvisorConsultLogVerdict,
  upsertAdvisorConsultLogEntry,
  type AdvisorConsultLogEntry,
} from "../src/lib/providers/advisor-consult-log";
import {
  resolveAdvisorConsultLogStatus,
  resolveAdvisorConsultWorkItems,
  resolveAdvisorPostConsultWorkItems,
  summarizeAdvisorTurnSpend,
} from "../src/components/session/advisor-consult-log.utils";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { createWorkGraph } from "../src/lib/work-graph/work-graph-reducer";
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
    logByTask: {},
    taskId: "task-1",
    turnId,
    events,
  }).exchangeByTask["task-1"] as AdvisorExchangeSnapshot;
}

/** The archived consults the same events produce, newest first. */
function foldLog(events: NormalizedProviderEvent[], turnId = "turn-1") {
  return applyAdvisorActivityEvents({
    exchangeByTask: {},
    logByTask: {},
    taskId: "task-1",
    turnId,
    events,
    now: T0,
  }).logByTask["task-1"] as readonly AdvisorConsultLogEntry[];
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
      logByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      events: SUCCESSFUL_EXCHANGE,
    });
    const second = applyAdvisorActivityEvents({
      exchangeByTask: first.exchangeByTask,
      logByTask: first.logByTask,
      taskId: "task-1",
      turnId: "turn-2",
      events: [advisorEvent({ phase: "started", at: T0 + 60_000 })],
    });

    expect(second.exchangeByTask["task-1"]?.turnId).toBe("turn-2");
    expect(second.exchangeByTask["task-1"]?.outcome).toBe("pending");
    expect(second.exchangeByTask["task-1"]?.settledConsults).toBe(0);
    // The new turn replaces the card but must not erase the archive.
    expect(second.logByTask["task-1"]).toHaveLength(2);
  });

  test("keeps a stable reference when no advisor events are present", () => {
    const map = { "task-1": fold(SUCCESSFUL_EXCHANGE) };
    const log = {};
    const next = applyAdvisorActivityEvents({
      exchangeByTask: map,
      logByTask: log,
      taskId: "task-1",
      turnId: "turn-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
    });

    expect(next.exchangeByTask).toBe(map);
    expect(next.logByTask).toBe(log);
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

describe("advisor consult log", () => {
  const ARMED_GRANT = advisorEvent({
    phase: "armed",
    consultLimit: 5,
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
  });

  /** Two complete consults, folded from one batch — the rAF-batching case. */
  const TWO_COMPLETE_CONSULTS: NormalizedProviderEvent[] = [
    ...SUCCESSFUL_EXCHANGE,
    advisorEvent({
      phase: "started",
      exchangeId: "exchange-2",
      consultIndex: 2,
      consultLimit: 5,
      question: "Does the retry path double-count?",
      advisorProviderId: "codex",
      advisorModel: "gpt-5.6-sol",
      at: T0 + 10_000,
    }),
    advisorEvent({
      phase: "completed",
      exchangeId: "exchange-2",
      at: T0 + 14_000,
      durationMs: 4_000,
      advice: "It does not.",
      inputTokens: 100,
      outputTokens: 20,
      totalCostUsd: 0.002,
    }),
  ];

  test("two complete consults in one batch produce two entries", () => {
    // The regression the log exists for: provider events are rAF-batched (and
    // rAF pauses while the window is hidden), so one flush can carry several
    // finished consults. Comparing the exchange map before and after would
    // keep only the last.
    const entries = foldLog(TWO_COMPLETE_CONSULTS);

    expect(entries).toHaveLength(2);
    // Newest first.
    expect(entries[0]?.snapshot.exchangeId).toBe("exchange-2");
    expect(entries[1]?.snapshot.exchangeId).toBe("exchange-1");
    expect(entries[0]?.snapshot.advice).toBe("It does not.");
    expect(entries[1]?.snapshot.question).toBe(
      "Is the cancellation path sound?",
    );
  });

  test("the terminal fold replaces the pending entry in place", () => {
    const pendingOnly = foldLog([SUCCESSFUL_EXCHANGE[0]!]);
    expect(pendingOnly).toHaveLength(1);
    expect(pendingOnly[0]?.snapshot.outcome).toBe("pending");

    const settled = foldLog(SUCCESSFUL_EXCHANGE);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.snapshot.outcome).toBe("completed");
    expect(settled[0]?.key).toBe(pendingOnly[0]!.key);
  });

  test("an armed-only turn writes no entry", () => {
    expect(foldLog([ARMED_GRANT])).toBeUndefined();
  });

  test("replacing an entry preserves an existing verdict and its position", () => {
    const started = applyAdvisorActivityEvents({
      exchangeByTask: {},
      logByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      events: [SUCCESSFUL_EXCHANGE[0]!],
      now: T0,
    });
    const key = started.logByTask["task-1"]![0]!.key;
    const rated = setAdvisorConsultLogVerdict({
      logByTask: started.logByTask,
      tallyByModel: {},
      taskId: "task-1",
      entryKey: key,
      verdict: "helpful",
    })!;
    const settled = applyAdvisorActivityEvents({
      exchangeByTask: started.exchangeByTask,
      logByTask: rated.logByTask,
      taskId: "task-1",
      turnId: "turn-1",
      events: [SUCCESSFUL_EXCHANGE[1]!],
      now: T0 + 1,
    });

    const entries = settled.logByTask["task-1"]!;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.snapshot.outcome).toBe("completed");
    expect(entries[0]?.verdict).toBe("helpful");
  });

  test("re-archiving the same snapshot keeps the map reference", () => {
    const snapshot = fold(SUCCESSFUL_EXCHANGE);
    const first = upsertAdvisorConsultLogEntry({
      logByTask: {},
      taskId: "task-1",
      snapshot,
      now: T0,
    });
    const second = upsertAdvisorConsultLogEntry({
      logByTask: first,
      taskId: "task-1",
      snapshot,
      now: T0 + 5_000,
    });

    expect(second).toBe(first);
  });

  test("a maxed-out turn never truncates its own consults", () => {
    // The per-task bound must stay at or above MAX_ADVISOR_CONSULT_LIMIT (20),
    // or spending the whole budget would evict the turn's earliest consults.
    expect(ADVISOR_CONSULT_LOG_LIMIT).toBeGreaterThanOrEqual(20);
    let logByTask = {};
    for (let index = 1; index <= 20; index += 1) {
      logByTask = upsertAdvisorConsultLogEntry({
        logByTask,
        taskId: "task-1",
        snapshot: fold([
          advisorEvent({
            phase: "started",
            exchangeId: `exchange-${index}`,
            consultIndex: index,
            at: T0 + index,
          }),
        ]),
        now: T0 + index,
      });
    }
    expect(selectAdvisorConsultLog(logByTask, "task-1")).toHaveLength(20);
  });

  test("the per-task ring evicts the oldest consult", () => {
    let logByTask = {};
    for (let index = 0; index < ADVISOR_CONSULT_LOG_LIMIT + 3; index += 1) {
      logByTask = upsertAdvisorConsultLogEntry({
        logByTask,
        taskId: "task-1",
        snapshot: fold([
          advisorEvent({
            phase: "started",
            exchangeId: `exchange-${index}`,
            at: T0 + index,
          }),
        ]),
        now: T0 + index,
      });
    }
    const entries = selectAdvisorConsultLog(logByTask, "task-1");
    expect(entries).toHaveLength(ADVISOR_CONSULT_LOG_LIMIT);
    expect(entries[0]?.snapshot.exchangeId).toBe(
      `exchange-${ADVISOR_CONSULT_LOG_LIMIT + 2}`,
    );
    expect(
      entries.some((entry) => entry.snapshot.exchangeId === "exchange-0"),
    ).toBe(false);
  });

  test("the task ring evicts the least recently updated task", () => {
    let logByTask = {};
    for (let index = 0; index < ADVISOR_CONSULT_LOG_TASK_LIMIT + 1; index += 1) {
      logByTask = upsertAdvisorConsultLogEntry({
        logByTask,
        taskId: `task-${index}`,
        snapshot: fold([
          advisorEvent({ phase: "started", exchangeId: "e", at: T0 }),
        ]),
        now: T0 + index,
      });
    }
    expect(Object.keys(logByTask)).toHaveLength(
      ADVISOR_CONSULT_LOG_TASK_LIMIT,
    );
    expect(selectAdvisorConsultLog(logByTask, "task-0")).toBe(
      EMPTY_ADVISOR_CONSULT_LOG,
    );
    expect(
      selectAdvisorConsultLog(
        logByTask,
        `task-${ADVISOR_CONSULT_LOG_TASK_LIMIT}`,
      ),
    ).toHaveLength(1);
  });

  test("dismissing the exchange card leaves the log intact", () => {
    const folded = applyAdvisorActivityEvents({
      exchangeByTask: {},
      logByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      events: SUCCESSFUL_EXCHANGE,
      now: T0,
    });
    const cleared = clearAdvisorExchange({
      exchangeByTask: folded.exchangeByTask,
      taskId: "task-1",
    });

    expect(cleared["task-1"]).toBeUndefined();
    expect(folded.logByTask["task-1"]).toHaveLength(1);
  });

  test("the patch omits the key that did not change", () => {
    const seeded = applyAdvisorActivityEvents({
      exchangeByTask: {},
      logByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      events: SUCCESSFUL_EXCHANGE,
      now: T0,
    });
    expect(
      buildAdvisorExchangePatch({
        exchangeByTask: seeded.exchangeByTask,
        logByTask: seeded.logByTask,
        taskId: "task-1",
        turnId: "turn-1",
        events: [{ type: "done", stop_reason: "end_turn" }],
      }),
    ).toBeNull();

    const patch = buildAdvisorExchangePatch({
      exchangeByTask: {},
      logByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      events: [ARMED_GRANT],
    })!;
    // An armed grant updates the card but archives nothing, so the log key must
    // not appear and replace an untouched map reference.
    expect(patch.advisorExchangeByTask).toBeDefined();
    expect("advisorConsultLogByTask" in patch).toBe(false);
  });

  describe("verdicts", () => {
    function seed() {
      const folded = applyAdvisorActivityEvents({
        exchangeByTask: {},
        logByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        events: SUCCESSFUL_EXCHANGE,
        now: T0,
      });
      return {
        logByTask: folded.logByTask,
        entryKey: folded.logByTask["task-1"]![0]!.key,
      };
    }

    test("records, switches, and refuses a repeat", () => {
      const { logByTask, entryKey } = seed();
      const first = setAdvisorConsultLogVerdict({
        logByTask,
        tallyByModel: {},
        taskId: "task-1",
        entryKey,
        verdict: "helpful",
      })!;
      expect(first.tallyByModel["codex:gpt-5.6-sol"]).toEqual({
        providerId: "codex",
        model: "gpt-5.6-sol",
        helpful: 1,
        notHelpful: 0,
        ignored: 0,
      });

      // A repeat must not reach `set()` at all.
      expect(
        setAdvisorConsultLogVerdict({
          ...first,
          taskId: "task-1",
          entryKey,
          verdict: "helpful",
        }),
      ).toBeNull();

      const switched = setAdvisorConsultLogVerdict({
        ...first,
        taskId: "task-1",
        entryKey,
        verdict: "ignored",
      })!;
      // Switching moves the count rather than adding a second one.
      expect(switched.tallyByModel["codex:gpt-5.6-sol"]).toEqual({
        providerId: "codex",
        model: "gpt-5.6-sol",
        helpful: 0,
        notHelpful: 0,
        ignored: 1,
      });
    });

    test("returns null for an entry that is not in the log", () => {
      const { logByTask } = seed();
      expect(
        setAdvisorConsultLogVerdict({
          logByTask,
          tallyByModel: {},
          taskId: "task-1",
          entryKey: "turn-9::missing",
          verdict: "helpful",
        }),
      ).toBeNull();
      expect(
        setAdvisorConsultLogVerdict({
          logByTask,
          tallyByModel: {},
          taskId: "task-absent",
          entryKey: "turn-1::exchange-1",
          verdict: "helpful",
        }),
      ).toBeNull();
    });

    test("the tally survives evicting the entry it came from", () => {
      const { logByTask, entryKey } = seed();
      const rated = setAdvisorConsultLogVerdict({
        logByTask,
        tallyByModel: {},
        taskId: "task-1",
        entryKey,
        verdict: "not_helpful",
      })!;
      let evicted = rated.logByTask;
      for (let index = 0; index < ADVISOR_CONSULT_LOG_LIMIT; index += 1) {
        evicted = upsertAdvisorConsultLogEntry({
          logByTask: evicted,
          taskId: "task-1",
          snapshot: fold([
            advisorEvent({
              phase: "started",
              exchangeId: `filler-${index}`,
              at: T0 + 1_000 + index,
            }),
          ]),
          now: T0 + 1_000 + index,
        });
      }
      expect(
        selectAdvisorConsultLog(evicted, "task-1").some(
          (entry) => entry.key === entryKey,
        ),
      ).toBe(false);
      expect(rated.tallyByModel["codex:gpt-5.6-sol"]?.notHelpful).toBe(1);
    });
  });

  test("selectAdvisorConsultLog returns one shared empty reference", () => {
    expect(selectAdvisorConsultLog({}, "task-1")).toBe(
      EMPTY_ADVISOR_CONSULT_LOG,
    );
    expect(selectAdvisorConsultLog({}, "task-2")).toBe(
      selectAdvisorConsultLog({}, "task-1"),
    );
  });

  test("entry keys separate consults that repeat a consult index", () => {
    // A recoverable provider retry can reuse `consultIndex`, so it must never
    // be the identity.
    const entries = foldLog([
      advisorEvent({ phase: "started", exchangeId: "a", consultIndex: 1 }),
      advisorEvent({
        phase: "started",
        exchangeId: "b",
        consultIndex: 1,
        at: T0 + 10,
      }),
    ]);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(2);
  });

  describe("presentation", () => {
    function entryFor(events: NormalizedProviderEvent[], turnId = "turn-1") {
      return {
        key: advisorConsultLogEntryKey(fold(events, turnId)),
        snapshot: fold(events, turnId),
        updatedAt: T0,
      } satisfies AdvisorConsultLogEntry;
    }

    test("a still-pending consult reads as unresolved once its turn is gone", () => {
      const entry = entryFor([SUCCESSFUL_EXCHANGE[0]!]);
      expect(
        resolveAdvisorConsultLogStatus({ entry, activeTurnId: "turn-1" }),
      ).toBe("pending");
      expect(
        resolveAdvisorConsultLogStatus({ entry, activeTurnId: "turn-2" }),
      ).toBe("unresolved");
      expect(
        resolveAdvisorConsultLogStatus({ entry, activeTurnId: null }),
      ).toBe("unresolved");
    });

    test("post-consult work items are filtered, ordered and capped", () => {
      const entry = entryFor(SUCCESSFUL_EXCHANGE);
      const settledAt = entry.snapshot.outcomeAt!;
      const workItems = [
        { id: "late", startedAt: settledAt + 2_000 },
        { id: "early", startedAt: settledAt - 1 },
        { id: "next", startedAt: settledAt + 1 },
      ].map((item) => ({
        ...item,
        kind: "tool" as const,
        status: "completed" as const,
        title: item.id,
        progressMessages: [],
        updatedAt: item.startedAt,
      }));

      const resolved = resolveAdvisorPostConsultWorkItems({
        entry,
        workItems,
      });
      expect(resolved.map((item) => item.id)).toEqual(["next", "late"]);
      expect(
        resolveAdvisorPostConsultWorkItems({ entry, workItems, limit: 1 }),
      ).toHaveLength(1);
      // An unsettled consult has no "after".
      expect(
        resolveAdvisorPostConsultWorkItems({
          entry: entryFor([SUCCESSFUL_EXCHANGE[0]!]),
          workItems,
        }),
      ).toEqual([]);
    });

    test("does not lend a newer turn's work items to an older consult", () => {
      const entry = entryFor(SUCCESSFUL_EXCHANGE, "turn-old");
      const newerActivity = {
        turnId: "turn-new",
        providerId: "codex" as const,
        startedAt: T0 + 20_000,
        lastEventAt: T0 + 21_000,
        stalledAt: null,
        pendingInteraction: null,
        workItemsById: {
          newer: {
            id: "newer",
            kind: "tool" as const,
            status: "completed" as const,
            title: "Newer turn work",
            progressMessages: [],
            startedAt: T0 + 20_500,
            updatedAt: T0 + 21_000,
          },
        },
        orderedWorkItemIds: ["newer"],
        workGraph: createWorkGraph({
          turnId: "turn-new",
          providerId: "codex",
          startedAt: T0 + 20_000,
        }),
      };

      expect(
        resolveAdvisorConsultWorkItems({
          entry,
          activity: newerActivity,
          retained: null,
        }),
      ).toEqual([]);
    });

    test("turn spend sums only this turn's consults", () => {
      const entries = [
        ...foldLog(TWO_COMPLETE_CONSULTS),
        entryFor(SUCCESSFUL_EXCHANGE, "turn-2"),
      ];
      const spend = summarizeAdvisorTurnSpend({ entries, turnId: "turn-1" });

      expect(spend.consults).toBe(2);
      expect(spend.inputTokens).toBe(1_000);
      expect(spend.outputTokens).toBe(140);
      expect(spend.totalCostUsd).toBeCloseTo(0.002, 6);
    });

    test("turn spend reports no cost rather than a fake zero", () => {
      const spend = summarizeAdvisorTurnSpend({
        entries: foldLog(SUCCESSFUL_EXCHANGE),
        turnId: "turn-1",
      });
      expect(spend.consults).toBe(1);
      expect(spend.totalCostUsd).toBeNull();
    });
  });
});
