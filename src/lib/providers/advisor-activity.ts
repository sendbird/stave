import type {
  AdvisorEffort,
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";

/**
 * Advisor consult lifecycle phases.
 *
 * `armed` is turn-level, not consult-level: it says an Advisor is available to
 * the primary this turn. Every other phase describes one consult. `failed` and
 * `timeout` are graceful fallbacks — the primary turn keeps running. `aborted`
 * means the whole turn was cancelled while a consult ran. `skipped` means this
 * consult was cancelled by the user or never runnable.
 */
export type AdvisorActivityPhase =
  | "armed"
  | "started"
  | "completed"
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
  /** Armed for the turn, not yet consulted. Never produced by a consult. */
  | "armed"
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
 * Record of one on-demand consult: primary -> advisor -> primary.
 *
 * Lives in its own store slice rather than inside a `MessagePart` so the
 * observability surface does not depend on transcript rendering, and so the
 * advice text is never persisted as an assistant response. A turn can hold
 * several consults; the slice keeps the latest one plus a settled counter so
 * the card can read "Consult 3/5".
 */
export type AdvisorExchangeSnapshot = {
  turnId: string;
  /** Identity of this consult; events with a new id open a new snapshot. */
  exchangeId?: string;
  /** 1-based index of this consult within the turn, as the runtime counted. */
  consultIndex?: number;
  /** Per-turn consult budget the primary was granted. */
  consultLimit?: number;
  /** The question the primary asked, bounded by the runtime. */
  question?: string;
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
  inputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
  /** Consults of this turn that already reached a terminal outcome. */
  settledConsults: number;
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
  return snapshot.outcome !== "pending" && snapshot.outcome !== "armed";
}

/**
 * True for the turn-level grant record: an Advisor is available but the primary
 * has not consulted it. Surfaces render this as "armed, 0 consults" rather than
 * as an exchange, so a cost-free turn still proves the Advisor was live.
 */
export function isAdvisorArmedOnly(snapshot: AdvisorExchangeSnapshot) {
  return snapshot.outcome === "armed";
}

/** True while a consult is running and the primary is waiting on its answer. */
export function isAdvisorExchangeBlocking(snapshot: AdvisorExchangeSnapshot) {
  return snapshot.outcome === "pending";
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
  settledConsults: number;
}): AdvisorExchangeSnapshot {
  const { event } = args;
  return {
    turnId: args.turnId,
    ...(event.exchangeId ? { exchangeId: event.exchangeId } : {}),
    ...(event.consultIndex !== undefined
      ? { consultIndex: event.consultIndex }
      : {}),
    ...(event.consultLimit !== undefined
      ? { consultLimit: event.consultLimit }
      : {}),
    ...(event.question ? { question: event.question } : {}),
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
    outcome: event.phase === "armed" ? "armed" : "pending",
    settledConsults: args.settledConsults,
    stages: [{ phase: event.phase === "armed" ? "armed" : "started", at: event.at }],
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
    ...(event.consultIndex !== undefined
      ? { consultIndex: event.consultIndex }
      : {}),
    ...(event.consultLimit !== undefined
      ? { consultLimit: event.consultLimit }
      : {}),
    stages: appendStage(args.snapshot.stages, {
      phase: event.phase,
      at: event.at,
      ...(event.detail ? { detail: event.detail } : {}),
    }),
  };

  if (event.phase === "started") {
    return base;
  }

  const outcome = TERMINAL_OUTCOME_BY_PHASE[event.phase];
  if (!outcome) {
    return base;
  }
  return {
    ...base,
    outcome,
    outcomeAt: event.at,
    settledConsults: args.snapshot.settledConsults + 1,
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

/** Whether this event belongs to a different consult than the snapshot shows. */
function isNewExchange(
  snapshot: AdvisorExchangeSnapshot,
  event: AdvisorActivityEvent,
) {
  if (event.phase !== "started") {
    // Outcome events without a matching snapshot are handled by the synthesis
    // branch below; an id mismatch on a non-started event still updates the
    // visible card rather than silently dropping the outcome.
    return false;
  }
  if (snapshot.outcome === "armed") {
    // The grant record is not an exchange, so the first consult replaces it
    // outright rather than inheriting its start time and empty identity.
    return true;
  }
  return (
    snapshot.exchangeId !== undefined &&
    event.exchangeId !== undefined &&
    snapshot.exchangeId !== event.exchangeId
  );
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
    if (event.phase === "armed" && snapshot) {
      // The grant is announced once per turn. A repeat (a recoverable provider
      // retry re-entering the runtime) must not erase consults already folded.
      continue;
    }
    if (snapshot && isNewExchange(snapshot, event)) {
      // A new consult replaces the card; how many already settled this turn is
      // carried forward so "Consult n/limit" stays truthful across cards.
      snapshot = startSnapshot({
        event,
        turnId: args.turnId,
        settledConsults: snapshot.settledConsults,
      });
      continue;
    }
    if (!snapshot) {
      // A non-`started` first event still produces a usable record; dropping it
      // would lose the outcome when the replay window evicted `started`.
      snapshot =
        event.phase === "started" || event.phase === "armed"
          ? startSnapshot({ event, turnId: args.turnId, settledConsults: 0 })
          : reduceEvent({
              snapshot: startSnapshot({
                event: { ...event, phase: "started" },
                turnId: args.turnId,
                settledConsults: 0,
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
