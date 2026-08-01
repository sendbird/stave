import type {
  AdvisorEffort,
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";

/**
 * Advisor lifecycle phases.
 *
 * `completed` and `applied` are deliberately separate: the advisor producing
 * advice and that advice actually reaching the primary prompt are different
 * events, and only the second one changes what the primary model sees. The
 * previous single system-trace string could not express that difference, which
 * made "advisor ran but the advice never landed" an invisible failure mode.
 *
 * `failed` and `timeout` are graceful fallbacks — the primary turn still runs.
 * `aborted` is a user cancellation of the whole turn. `skipped` means the
 * advisor never ran (ineligible turn, invalid target, unknown model).
 */
export type AdvisorActivityPhase =
  | "started"
  | "completed"
  | "applied"
  | "primary_started"
  | "failed"
  | "timeout"
  | "aborted"
  | "skipped";

/**
 * How the advisor call was actually isolated, reported by the runtime that
 * applied the isolation rather than derived in the renderer. Deriving it from
 * the provider id would make the UI claim isolation it never verified.
 */
export type AdvisorIsolationMode =
  | "claude-tools-disabled"
  | "codex-ephemeral-read-only";

export type AdvisorActivityEvent = Extract<
  NormalizedProviderEvent,
  { type: "advisor_activity" }
>;

export type AdvisorExchangeOutcome =
  | "pending"
  | "completed"
  | "failed"
  | "timeout"
  | "aborted"
  | "skipped";

export type AdvisorExchangeStage = {
  phase: AdvisorActivityPhase;
  at: number;
  detail?: string;
};

/**
 * Per-turn record of a primary -> advisor -> primary exchange.
 *
 * Lives in its own store slice rather than inside a `MessagePart` so the
 * observability surface does not depend on transcript rendering, and so the
 * advice text is never persisted as an assistant response.
 */
export type AdvisorExchangeSnapshot = {
  turnId: string;
  primaryProviderId: ProviderId;
  primaryModel?: string;
  advisorProviderId?: ProviderId;
  advisorModel?: string;
  /** Effort the runtime requested, after defaulting and clamping. */
  advisorEffort?: AdvisorEffort;
  isolation?: AdvisorIsolationMode;
  startedAt: number;
  timeoutMs?: number;
  outcome: AdvisorExchangeOutcome;
  outcomeAt?: number;
  durationMs?: number;
  detail?: string;
  advice?: string;
  adviceChars?: number;
  applied: boolean;
  appliedAt?: number;
  injectedChars?: number;
  injectedPartIndex?: number;
  primaryStartedAt?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
  stages: AdvisorExchangeStage[];
};

export type AdvisorExchangeByTask = Record<
  string,
  AdvisorExchangeSnapshot | undefined
>;

const ADVISOR_STAGE_LIMIT = 12;

/**
 * Sub-second advisors are real (a cached Codex reply lands in ~150ms), so the
 * duration must not be floored to "1s" — that made a fast advisor look slow and
 * an instant skip look like it did work. Shared by the main-process trace and
 * the renderer overlay so both report the same number.
 */
export function formatAdvisorDuration(durationMs: number) {
  const safeMs = Math.max(0, Math.round(durationMs));
  if (safeMs < 1_000) {
    return `${safeMs}ms`;
  }
  return `${Math.round(safeMs / 100) / 10}s`;
}

const TERMINAL_OUTCOME_BY_PHASE: Partial<
  Record<AdvisorActivityPhase, AdvisorExchangeOutcome>
> = {
  completed: "completed",
  failed: "failed",
  timeout: "timeout",
  aborted: "aborted",
  skipped: "skipped",
};

export function isAdvisorExchangeTerminal(snapshot: AdvisorExchangeSnapshot) {
  return snapshot.outcome !== "pending";
}

/** True while the advisor is holding the turn and the primary has not started. */
export function isAdvisorExchangeBlocking(snapshot: AdvisorExchangeSnapshot) {
  return snapshot.outcome === "pending" && snapshot.primaryStartedAt === undefined;
}

function appendStage(
  stages: AdvisorExchangeStage[],
  stage: AdvisorExchangeStage,
) {
  const next = [...stages, stage];
  return next.length > ADVISOR_STAGE_LIMIT
    ? next.slice(next.length - ADVISOR_STAGE_LIMIT)
    : next;
}

function startSnapshot(args: {
  event: AdvisorActivityEvent;
  turnId: string;
}): AdvisorExchangeSnapshot {
  const { event } = args;
  return {
    turnId: args.turnId,
    primaryProviderId: event.primaryProviderId,
    ...(event.primaryModel ? { primaryModel: event.primaryModel } : {}),
    ...(event.advisorProviderId
      ? { advisorProviderId: event.advisorProviderId }
      : {}),
    ...(event.advisorModel ? { advisorModel: event.advisorModel } : {}),
    ...(event.advisorEffort ? { advisorEffort: event.advisorEffort } : {}),
    ...(event.isolation ? { isolation: event.isolation } : {}),
    startedAt: event.at,
    ...(event.timeoutMs !== undefined ? { timeoutMs: event.timeoutMs } : {}),
    outcome: "pending",
    applied: false,
    stages: [{ phase: "started", at: event.at }],
  };
}

function reduceEvent(args: {
  snapshot: AdvisorExchangeSnapshot;
  event: AdvisorActivityEvent;
}): AdvisorExchangeSnapshot {
  const { event } = args;
  const base: AdvisorExchangeSnapshot = {
    ...args.snapshot,
    // Identity can only be filled in, never blanked, so a later phase that
    // omits it (an invalid-target skip) cannot erase what `started` reported.
    ...(event.primaryModel ? { primaryModel: event.primaryModel } : {}),
    ...(event.advisorProviderId
      ? { advisorProviderId: event.advisorProviderId }
      : {}),
    ...(event.advisorModel ? { advisorModel: event.advisorModel } : {}),
    ...(event.advisorEffort ? { advisorEffort: event.advisorEffort } : {}),
    ...(event.isolation ? { isolation: event.isolation } : {}),
    stages: appendStage(args.snapshot.stages, {
      phase: event.phase,
      at: event.at,
      ...(event.detail ? { detail: event.detail } : {}),
    }),
  };

  if (event.phase === "started") {
    return base;
  }

  if (event.phase === "applied") {
    return {
      ...base,
      applied: true,
      appliedAt: event.at,
      ...(event.injectedChars !== undefined
        ? { injectedChars: event.injectedChars }
        : {}),
      ...(event.injectedPartIndex !== undefined
        ? { injectedPartIndex: event.injectedPartIndex }
        : {}),
    };
  }

  if (event.phase === "primary_started") {
    return { ...base, primaryStartedAt: event.at };
  }

  const outcome = TERMINAL_OUTCOME_BY_PHASE[event.phase];
  if (!outcome) {
    return base;
  }
  return {
    ...base,
    outcome,
    outcomeAt: event.at,
    ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.advice ? { advice: event.advice } : {}),
    ...(event.adviceChars !== undefined
      ? { adviceChars: event.adviceChars }
      : {}),
    ...(event.inputTokens !== undefined
      ? { inputTokens: event.inputTokens }
      : {}),
    ...(event.outputTokens !== undefined
      ? { outputTokens: event.outputTokens }
      : {}),
    ...(event.totalCostUsd !== undefined
      ? { totalCostUsd: event.totalCostUsd }
      : {}),
  };
}

/**
 * Folds the turn's advisor events into the task's exchange snapshot.
 *
 * Returns the original map when nothing changed so the Zustand slice keeps a
 * stable reference and subscribed components do not re-render.
 */
export function applyAdvisorActivityEvents(args: {
  exchangeByTask: AdvisorExchangeByTask;
  taskId: string;
  turnId: string;
  events: NormalizedProviderEvent[];
}): AdvisorExchangeByTask {
  const advisorEvents = args.events.filter(
    (event): event is AdvisorActivityEvent =>
      event.type === "advisor_activity",
  );
  if (advisorEvents.length === 0) {
    return args.exchangeByTask;
  }

  const current = args.exchangeByTask[args.taskId];
  let snapshot = current?.turnId === args.turnId ? current : undefined;

  for (const event of advisorEvents) {
    if (!snapshot) {
      // A non-`started` first event still produces a usable record; dropping it
      // would lose the outcome when the replay window evicted `started`.
      snapshot =
        event.phase === "started"
          ? startSnapshot({ event, turnId: args.turnId })
          : reduceEvent({
              snapshot: startSnapshot({
                event: { ...event, phase: "started" },
                turnId: args.turnId,
              }),
              event,
            });
      continue;
    }
    snapshot = reduceEvent({ snapshot, event });
  }

  if (!snapshot || snapshot === current) {
    return args.exchangeByTask;
  }
  return { ...args.exchangeByTask, [args.taskId]: snapshot };
}

/**
 * Store-shaped wrapper: returns the partial state patch, or `null` when the
 * events changed nothing. Keeps the fold (and its "did anything change?"
 * comparison) out of the hot `app.store.ts` event loop.
 */
export function buildAdvisorExchangePatch(args: {
  exchangeByTask: AdvisorExchangeByTask;
  taskId: string;
  turnId: string;
  events: NormalizedProviderEvent[];
}): { advisorExchangeByTask: AdvisorExchangeByTask } | null {
  const next = applyAdvisorActivityEvents(args);
  return next === args.exchangeByTask ? null : { advisorExchangeByTask: next };
}

export function clearAdvisorExchange(args: {
  exchangeByTask: AdvisorExchangeByTask;
  taskId: string;
}) {
  if (!(args.taskId in args.exchangeByTask)) {
    return args.exchangeByTask;
  }
  const next = { ...args.exchangeByTask };
  delete next[args.taskId];
  return next;
}
