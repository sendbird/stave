import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearAdvisorConsultGrantsForTest,
  consultAdvisor,
  registerAdvisorConsultGrant,
  type AdvisorConsultGrant,
} from "../electron/providers/advisor-consult";
import type { AdvisorRunnerDependencies } from "../electron/providers/advisor-runtime";
import type { BridgeEvent } from "../electron/providers/types";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;
type AdvisorActivityEvent = Extract<BridgeEvent, { type: "advisor_activity" }>;

const TARGET = {
  providerId: "claude-code",
  model: "claude-fable-5-1",
} as const;

function createUnusedRunner(message: string) {
  return async () => {
    throw new Error(message);
  };
}

function adviceRunners(args?: { text?: string; usage?: UsageEvent }) {
  return {
    runClaude: async () => ({
      ok: true,
      text: args?.text ?? "Consider the failure path first.",
      ...(args?.usage ? { usage: args.usage } : {}),
    }),
    runCodex: createUnusedRunner("Codex runner must not be called."),
  } satisfies AdvisorRunnerDependencies;
}

/** A Claude runner that never settles, so cancellation paths can be driven. */
function hangingRunners() {
  return {
    runClaude: async () =>
      new Promise<{
        ok: boolean;
        aborted: boolean;
        detail: string;
      }>(() => {}),
    runCodex: createUnusedRunner("Codex runner must not be called."),
  } satisfies AdvisorRunnerDependencies;
}

type GrantHarness = {
  grant: AdvisorConsultGrant;
  events: BridgeEvent[];
  usage: UsageEvent[];
  pauses: string[];
  resumes: string[];
};

function createGrant(args: {
  consultKey: string;
  taskId?: string;
  consultLimit?: number;
  runners: AdvisorRunnerDependencies;
}): GrantHarness {
  const events: BridgeEvent[] = [];
  const usage: UsageEvent[] = [];
  const pauses: string[] = [];
  const resumes: string[] = [];
  return {
    grant: {
      consultKey: args.consultKey,
      turnId: "turn-1",
      ...(args.taskId ? { taskId: args.taskId } : {}),
      target: TARGET,
      primaryProviderId: "codex",
      primaryModel: "gpt-5.6-terra",
      consultLimit: args.consultLimit ?? 3,
      cwd: "/tmp/advisor-consult-test",
      emit: (event) => {
        events.push(event);
      },
      pausePhase: ({ phase }) => {
        pauses.push(phase);
      },
      resumePhase: ({ phase }) => {
        resumes.push(phase);
      },
      addUsage: (event) => {
        usage.push(event);
      },
      runners: args.runners,
    },
    events,
    usage,
    pauses,
    resumes,
  };
}

function activityEvents(events: BridgeEvent[]) {
  return events.filter(
    (event): event is AdvisorActivityEvent => event.type === "advisor_activity",
  );
}

beforeEach(() => {
  clearAdvisorConsultGrantsForTest();
});

afterEach(() => {
  clearAdvisorConsultGrantsForTest();
});

describe("consultAdvisor", () => {
  test("rejects a key no grant was minted for", async () => {
    const outcome = await consultAdvisor({
      consultKey: "never-registered",
      question: "Is this safe?",
    });

    expect(outcome).toMatchObject({
      ok: false,
      code: "unknown-consult-key",
    });
  });

  test("a successful consult reports events, usage, and sanitized advice", async () => {
    const runnerUsage: UsageEvent = {
      type: "usage",
      inputTokens: 42,
      outputTokens: 7,
      totalCostUsd: 0.01,
    };
    const harness = createGrant({
      consultKey: "grant-success",
      consultLimit: 2,
      runners: adviceRunners({
        text: "Prefer the streaming API.",
        usage: runnerUsage,
      }),
    });
    registerAdvisorConsultGrant(harness.grant);

    const outcome = await consultAdvisor({
      consultKey: "grant-success",
      question: "Which API should the worker use?",
      context: "The worker currently polls.",
    });

    expect(outcome).toMatchObject({
      ok: true,
      advisorProviderId: "claude-code",
      advisorModel: "claude-fable-5-1",
      consultIndex: 1,
      consultLimit: 2,
      remainingConsults: 1,
    });
    if (!outcome.ok) {
      throw new Error("expected a successful consult");
    }
    // Advice is wrapped by buildAdvisorAdviceContent: the low-trust preamble
    // precedes the advisor's own words.
    expect(outcome.advice).toContain("low-trust reference material");
    expect(outcome.advice).toContain("Prefer the streaming API.");

    const activity = activityEvents(harness.events);
    expect(activity.map((event) => event.phase)).toEqual([
      "started",
      "completed",
    ]);
    const [started, completed] = activity;
    expect(started).toMatchObject({
      consultIndex: 1,
      consultLimit: 2,
      question: "Which API should the worker use?",
      primaryProviderId: "codex",
      advisorModel: "claude-fable-5-1",
    });
    expect(typeof started?.exchangeId).toBe("string");
    expect(completed?.exchangeId).toBe(started?.exchangeId);

    const traces = harness.events.filter((event) => event.type === "system");
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      content: expect.stringContaining("Advisor consult 1/2 completed with"),
    });

    expect(harness.usage).toEqual([runnerUsage]);
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: "delegated_usage",
        role: "advisor",
        providerId: "claude-code",
        model: "claude-fable-5-1",
        inputTokens: 42,
        outputTokens: 7,
      }),
    );
  });

  test("resumes an Advisor role session across turns in the same task", async () => {
    const resumeSessionIds: Array<string | undefined> = [];
    const runners = {
      runClaude: async (args: Parameters<AdvisorRunnerDependencies["runClaude"]>[0]) => {
        resumeSessionIds.push(args.resumeSessionId);
        return {
          ok: true,
          text: "Keep the role session scoped to this task.",
          nativeSessionId: "advisor-session-1",
          sessionReused: args.resumeSessionId === "advisor-session-1",
        };
      },
      runCodex: createUnusedRunner("Codex runner must not be called."),
    } satisfies AdvisorRunnerDependencies;

    const first = createGrant({
      consultKey: "grant-session-first",
      taskId: "task-session",
      runners,
    });
    registerAdvisorConsultGrant(first.grant);
    expect(
      await consultAdvisor({
        consultKey: "grant-session-first",
        question: "First turn?",
      }),
    ).toMatchObject({ ok: true });

    const second = createGrant({
      consultKey: "grant-session-second",
      taskId: "task-session",
      runners,
    });
    registerAdvisorConsultGrant(second.grant);
    expect(
      await consultAdvisor({
        consultKey: "grant-session-second",
        question: "Next turn?",
      }),
    ).toMatchObject({ ok: true });

    expect(resumeSessionIds).toEqual([undefined, "advisor-session-1"]);
    expect(second.events).toContainEqual(
      expect.objectContaining({
        type: "delegated_usage",
        role: "advisor",
        sessionReused: true,
      }),
    );
  });

  test("pause and resume bracket the consult with the same per-exchange key", async () => {
    const harness = createGrant({
      consultKey: "grant-pause",
      runners: adviceRunners(),
    });
    registerAdvisorConsultGrant(harness.grant);

    await consultAdvisor({ consultKey: "grant-pause", question: "Pace?" });

    expect(harness.pauses).toHaveLength(1);
    expect(harness.resumes).toEqual(harness.pauses);
    expect(harness.pauses[0]).toStartWith("advisor-consult:");
    const started = activityEvents(harness.events)[0];
    expect(harness.pauses[0]).toBe(`advisor-consult:${started?.exchangeId}`);
  });

  test("the consult budget is enforced per grant", async () => {
    const harness = createGrant({
      consultKey: "grant-limit",
      consultLimit: 1,
      runners: adviceRunners(),
    });
    registerAdvisorConsultGrant(harness.grant);

    const first = await consultAdvisor({
      consultKey: "grant-limit",
      question: "First question",
    });
    expect(first.ok).toBe(true);

    const second = await consultAdvisor({
      consultKey: "grant-limit",
      question: "Second question",
    });
    expect(second).toMatchObject({
      ok: false,
      code: "consult-limit-exhausted",
      consultLimit: 1,
      remainingConsults: 0,
    });
    // The rejected consult never started an exchange.
    expect(activityEvents(harness.events)).toHaveLength(2);
  });

  test("revoke ends the grant, aborts the in-flight consult, and silences its events", async () => {
    const harness = createGrant({
      consultKey: "grant-revoke",
      runners: hangingRunners(),
    });
    const handle = registerAdvisorConsultGrant(harness.grant);

    const pending = consultAdvisor({
      consultKey: "grant-revoke",
      question: "Will this ever settle?",
    });
    await Promise.resolve();
    expect(activityEvents(harness.events)).toHaveLength(1);

    handle.revoke();

    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, code: "turn-aborted" });
    // No outcome event or trace lands after revocation.
    expect(activityEvents(harness.events)).toHaveLength(1);
    expect(
      harness.events.filter((event) => event.type === "system"),
    ).toHaveLength(0);
    // The turn clock is still released.
    expect(harness.resumes).toEqual(harness.pauses);

    // The key is dead for any further consult.
    const afterRevoke = await consultAdvisor({
      consultKey: "grant-revoke",
      question: "Still there?",
    });
    expect(afterRevoke).toMatchObject({
      ok: false,
      code: "unknown-consult-key",
    });
  });

  test("skipInFlight cancels a hanging consult and keeps the grant alive", async () => {
    const harness = createGrant({
      consultKey: "grant-skip",
      runners: hangingRunners(),
    });
    const handle = registerAdvisorConsultGrant(harness.grant);

    // Nothing is running yet, so there is nothing to skip.
    expect(handle.skipInFlight()).toBe(false);

    const pending = consultAdvisor({
      consultKey: "grant-skip",
      question: "Slow question",
    });
    await Promise.resolve();
    expect(handle.skipInFlight()).toBe(true);

    const outcome = await pending;
    expect(outcome).toMatchObject({
      ok: false,
      code: "consult-cancelled",
    });
    expect(harness.resumes).toEqual(harness.pauses);

    // Back to idle: nothing left to skip.
    expect(handle.skipInFlight()).toBe(false);
  });

  test("a second consult is rejected while one is in flight", async () => {
    const harness = createGrant({
      consultKey: "grant-serial",
      consultLimit: 5,
      runners: hangingRunners(),
    });
    const handle = registerAdvisorConsultGrant(harness.grant);

    const pending = consultAdvisor({
      consultKey: "grant-serial",
      question: "Slow question",
    });
    await Promise.resolve();

    const concurrent = await consultAdvisor({
      consultKey: "grant-serial",
      question: "Parallel question",
    });
    expect(concurrent).toMatchObject({
      ok: false,
      code: "consult-in-flight",
    });
    // The rejection must not have burned budget or started an exchange.
    expect(activityEvents(harness.events)).toHaveLength(1);

    handle.skipInFlight();
    await pending;
  });
});
