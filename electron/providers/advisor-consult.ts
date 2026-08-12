import { randomUUID } from "node:crypto";

import {
  buildAdvisorAdviceContent,
  buildAdvisorConsultPrompt,
  resolveAdvisorEffort,
  resolveAdvisorTimeoutMs,
} from "../../src/lib/providers/advisor";
import type {
  AdvisorTarget,
  ProviderId,
} from "../../src/lib/providers/provider.types";
import {
  buildAdvisorOutcomeEvent,
  buildAdvisorStartedEvent,
  formatAdvisorSystemTrace,
  runAdvisorCall,
  type AdvisorConsultDescriptor,
  type AdvisorRunnerDependencies,
} from "./advisor-runtime";
import type { BridgeEvent } from "./types";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;

/** Bounded copy of the question shown in the exchange monitor. */
const CONSULT_QUESTION_DISPLAY_MAX_CHARS = 600;

/**
 * A turn-scoped capability that lets the primary model consult the armed
 * Advisor on demand.
 *
 * The grant is minted by the shared provider runtime when a turn starts with an
 * armed Advisor, and the opaque `consultKey` is what the primary's briefing
 * carries. Everything the consult needs to bill, display, and pace itself flows
 * back through the callbacks registered here — the Local MCP handler never
 * touches the turn directly.
 */
export type AdvisorConsultGrant = {
  consultKey: string;
  turnId: string;
  taskId?: string;
  target: AdvisorTarget;
  primaryProviderId: ProviderId;
  primaryModel?: string;
  consultLimit: number;
  cwd: string;
  runtimeOptions?: {
    claudeBinaryPath?: string;
    codexBinaryPath?: string;
  };
  /** Streams advisor lifecycle events into the live turn. */
  emit: (event: BridgeEvent) => void;
  /**
   * Suspends the turn clock for the duration of one consult. Advisor latency is
   * another model's time, not the primary provider's generation budget.
   */
  pausePhase: (args: { phase: string }) => void;
  resumePhase: (args: { phase: string }) => void;
  /** Folds one consult's usage into the turn total (accumulated by the turn). */
  addUsage: (usage: UsageEvent) => void;
  runners?: AdvisorRunnerDependencies;
};

type ActiveGrant = AdvisorConsultGrant & {
  used: number;
  revoked: boolean;
  /** Cancel handle for the single in-flight consult, if any. */
  inFlightSkip: (() => void) | null;
  inFlightAbort: (() => void) | null;
};

const grantsByKey = new Map<string, ActiveGrant>();

export type AdvisorConsultGrantHandle = {
  consultKey: string;
  /**
   * Ends the grant: no new consults are honoured and an in-flight consult is
   * aborted. Called from the turn's terminal paths so a consult can never
   * outlive (or bill into) a finished turn.
   */
  revoke: () => void;
  /**
   * User-facing "skip": cancels the in-flight consult while keeping the grant.
   * Returns false when nothing was running.
   */
  skipInFlight: () => boolean;
};

export function registerAdvisorConsultGrant(
  grant: AdvisorConsultGrant,
): AdvisorConsultGrantHandle {
  const active: ActiveGrant = {
    ...grant,
    used: 0,
    revoked: false,
    inFlightSkip: null,
    inFlightAbort: null,
  };
  grantsByKey.set(grant.consultKey, active);
  return {
    consultKey: grant.consultKey,
    revoke: () => {
      active.revoked = true;
      grantsByKey.delete(grant.consultKey);
      active.inFlightAbort?.();
    },
    skipInFlight: () => {
      if (!active.inFlightSkip) {
        return false;
      }
      active.inFlightSkip();
      return true;
    },
  };
}

/** Test hook: drop every grant so suites cannot leak keys into each other. */
export function clearAdvisorConsultGrantsForTest() {
  grantsByKey.clear();
}

let defaultRunnersOverride: AdvisorRunnerDependencies | undefined;

/**
 * Test hook: runners applied to grants that did not pin their own (the shared
 * provider runtime never does). Bun's `mock.module` is process-global, so
 * integration tests that faked `runAdvisorCall` at the module level poisoned
 * every other suite in the run; injecting runners here keeps the fake scoped
 * to the file that installed it.
 */
export function setDefaultAdvisorConsultRunnersForTest(
  runners?: AdvisorRunnerDependencies,
) {
  defaultRunnersOverride = runners;
}

export type AdvisorConsultOutcome =
  | {
      ok: true;
      advice: string;
      advisorProviderId: ProviderId;
      advisorModel: string;
      advisorEffort: string;
      consultIndex: number;
      consultLimit: number;
      remainingConsults: number;
      durationMs: number;
    }
  | {
      ok: false;
      code:
        | "unknown-consult-key"
        | "consult-in-flight"
        | "consult-limit-exhausted"
        | "consult-cancelled"
        | "turn-aborted"
        | "advisor-timeout"
        | "advisor-failed";
      message: string;
      consultLimit?: number;
      remainingConsults?: number;
    };

/**
 * Entry point for the `stave_consult_advisor` Local MCP tool.
 *
 * Runs one read-only Advisor call against the grant's target and returns the
 * sanitised advice. One consult at a time per grant: the exchange monitor and
 * the turn-clock pause both model a single active exchange, and a primary that
 * wants parallel opinions should ask one better question instead.
 */
export async function consultAdvisor(args: {
  consultKey: string;
  question: string;
  context?: string;
}): Promise<AdvisorConsultOutcome> {
  const grant = grantsByKey.get(args.consultKey);
  if (!grant || grant.revoked) {
    return {
      ok: false,
      code: "unknown-consult-key",
      message:
        "No active Advisor grant matches this consultKey. Grants are valid only during the turn that issued them — proceed without consulting.",
    };
  }
  if (grant.inFlightSkip || grant.inFlightAbort) {
    return {
      ok: false,
      code: "consult-in-flight",
      message:
        "Another Advisor consult is already running for this turn. Wait for it to return before asking again.",
    };
  }
  if (grant.used >= grant.consultLimit) {
    return {
      ok: false,
      code: "consult-limit-exhausted",
      message: `The Advisor consult budget for this turn (${grant.consultLimit}) is exhausted. Proceed with your own judgment.`,
      consultLimit: grant.consultLimit,
      remainingConsults: 0,
    };
  }
  const question = args.question.trim();
  if (!question) {
    return {
      ok: false,
      code: "advisor-failed",
      message: "The consult question is empty.",
      consultLimit: grant.consultLimit,
      remainingConsults: grant.consultLimit - grant.used,
    };
  }

  grant.used += 1;
  const consult: AdvisorConsultDescriptor = {
    exchangeId: randomUUID(),
    consultIndex: grant.used,
    consultLimit: grant.consultLimit,
  };
  const timeoutMs = resolveAdvisorTimeoutMs(grant.target);
  const pauseKey = `advisor-consult:${consult.exchangeId}`;
  const emitIfLive = (event: BridgeEvent) => {
    if (!grant.revoked) {
      grant.emit(event);
    }
  };
  emitIfLive(
    buildAdvisorStartedEvent({
      primaryProviderId: grant.primaryProviderId,
      ...(grant.primaryModel ? { primaryModel: grant.primaryModel } : {}),
      target: grant.target,
      at: Date.now(),
      timeoutMs,
      consult,
      question:
        question.length > CONSULT_QUESTION_DISPLAY_MAX_CHARS
          ? `${question.slice(0, CONSULT_QUESTION_DISPLAY_MAX_CHARS - 1)}…`
          : question,
    }),
  );
  grant.pausePhase({ phase: pauseKey });
  try {
    const result = await runAdvisorCall({
      target: grant.target,
      prompt: buildAdvisorConsultPrompt({
        question,
        ...(args.context ? { context: args.context } : {}),
        primaryProviderId: grant.primaryProviderId,
        ...(grant.primaryModel ? { primaryModel: grant.primaryModel } : {}),
      }),
      cwd: grant.cwd,
      runtimeOptions: grant.runtimeOptions,
      registerAbort: (aborter) => {
        grant.inFlightAbort = aborter;
        if (grant.revoked) {
          aborter();
        }
      },
      registerSkip: (skip) => {
        grant.inFlightSkip = skip;
      },
      // Late usage from a cancelled consult still reaches the turn total as
      // long as the turn is alive; after revocation there is nothing to bill.
      reportLateUsage: (usage) => {
        if (!grant.revoked) {
          grant.addUsage(usage);
        }
      },
      runners: grant.runners ?? defaultRunnersOverride,
      timeoutMs,
    });
    if (result.usage && !grant.revoked) {
      grant.addUsage(result.usage);
    }
    emitIfLive(
      buildAdvisorOutcomeEvent({
        primaryProviderId: grant.primaryProviderId,
        result,
        at: Date.now(),
        consult,
      }),
    );
    if (result.shouldTrace) {
      // The structured event above drives the live UI; this durable transcript
      // receipt is what survives a restart.
      emitIfLive({
        type: "system",
        content: formatAdvisorSystemTrace(result, consult),
      });
    }
    const remainingConsults = grant.consultLimit - grant.used;
    if (result.status === "completed") {
      return {
        ok: true,
        advice: buildAdvisorAdviceContent({
          advice: result.advice,
          target: grant.target,
        }),
        advisorProviderId: grant.target.providerId,
        advisorModel: grant.target.model,
        advisorEffort: resolveAdvisorEffort(grant.target),
        consultIndex: consult.consultIndex,
        consultLimit: grant.consultLimit,
        remainingConsults,
        durationMs: result.durationMs,
      };
    }
    if (result.status === "aborted") {
      return {
        ok: false,
        code: "turn-aborted",
        message: "The turn was aborted while the Advisor consult was running.",
      };
    }
    if (result.status === "skipped") {
      return {
        ok: false,
        code: "consult-cancelled",
        message:
          "The user cancelled this Advisor consult. Proceed with your own judgment and do not retry it.",
        consultLimit: grant.consultLimit,
        remainingConsults,
      };
    }
    return {
      ok: false,
      code: result.failureKind === "timeout" ? "advisor-timeout" : "advisor-failed",
      message: `The Advisor consult did not produce advice: ${result.detail} Proceed with your own judgment.`,
      consultLimit: grant.consultLimit,
      remainingConsults,
    };
  } finally {
    grant.inFlightSkip = null;
    grant.inFlightAbort = null;
    grant.resumePhase({ phase: pauseKey });
  }
}
