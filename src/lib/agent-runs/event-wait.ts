import { i18n } from "@/i18n/runtime";
import { formatDateTime } from "@/i18n/format";
/**
 * Event waits: a run that waits inside itself for one outside event (the
 * checks or a review on a pull request, a time, delegated work finishing)
 * instead of ending. The agent asks for one through `stave_wait_for_event`;
 * while it waits the run stays running, starts no turn and spends no turn.
 * When the event comes, the run starts its next stage turn with what happened.
 *
 * It rides on the wake-up machinery's rules (expiry, a wake cap, one receipt
 * per event, a merged or closed pull request ends it) but is owned by the run:
 * while a run is active the task's own wake-ups stay paused
 * (`src/lib/supervision/automatic-turn-owner.ts`).
 *
 * This module holds the persisted shape, the request rules and the words
 * people see. `event-wait-observe.ts` turns reads into wakes.
 *
 * Pure: no clock, no I/O. It imports nothing from `domain.ts`, which imports it.
 */
import { z } from "zod";
import { PullRequestWatchStateSchema } from "@/lib/supervision/pull-request-watch";

export const AGENT_RUN_EVENT_WAIT_KINDS = [
  "pull_request_checks",
  "pull_request_review",
  "time",
  "delegated_completion",
] as const;
export type AgentRunEventWaitKind = (typeof AGENT_RUN_EVENT_WAIT_KINDS)[number];

export const AGENT_RUN_EVENT_WAIT_LIMITS = Object.freeze({
  defaultExpiryMs: 24 * 60 * 60_000,
  maxExpiryMs: 7 * 24 * 60 * 60_000,
  /** A `time` wait keeps this long past its time by default, so a slow tick still wakes it. */
  timeGraceMs: 60 * 60_000,
  defaultMaxWakes: 5,
  maxWakes: 20,
  maxTargetChars: 300,
  /** Delivered event keys kept per wait; the newest win. */
  maxConsumedKeys: 200,
  maxKeyChars: 600,
  /** The event summary a woken turn receives. */
  maxSummaryChars: 6_000,
});

/** Why a wait stopped without the event it waited for. */
export const AGENT_RUN_EVENT_WAIT_END_REASONS = ["expired", "wake-limit", "unreadable"] as const;
export type AgentRunEventWaitEndReason = (typeof AGENT_RUN_EVENT_WAIT_END_REASONS)[number];

const TimestampSchema = z.iso.datetime();
const IdSchema = z.string().trim().min(1).max(256);

/**
 * The run's one active wait, persisted on the run so a restart keeps it. A new
 * request replaces it. It belongs to the stage attempt whose turn asked for it;
 * once the run moves past that attempt it no longer applies.
 */
export const AgentRunEventWaitSchema = z
  .object({
    id: IdSchema,
    kind: z.enum(AGENT_RUN_EVENT_WAIT_KINDS),
    /**
     * PR kinds: the pull request in canonical form (`128`, or
     * `https://<host>/<owner>/<repo>/pull/128` when given as a URL), or null
     * for the workspace branch's pull request. `delegated_completion`: a
     * delegated task id or delegation key, or null for any delegated work of
     * the task.
     */
    target: z.string().trim().min(1).max(AGENT_RUN_EVENT_WAIT_LIMITS.maxTargetChars).nullable(),
    /**
     * `time` only: when the run wakes. Reaching it wakes the run even when
     * `expiresAt` is due too, so `at` may equal `expiresAt`.
     */
    at: TimestampSchema.nullable(),
    stageId: IdSchema,
    attempt: z.number().int().min(1),
    /** The turn whose grant asked for the wait. */
    turnId: IdSchema.nullable(),
    registeredAt: TimestampSchema,
    /** Review comments and untargeted completions count only from here on. */
    since: TimestampSchema,
    expiresAt: TimestampSchema,
    maxWakes: z.number().int().min(1).max(AGENT_RUN_EVENT_WAIT_LIMITS.maxWakes),
    wakes: z.number().int().min(0).max(AGENT_RUN_EVENT_WAIT_LIMITS.maxWakes),
    /** `expired`: it ended without its event and the run paused; Resume or a reply continues. */
    status: z.enum(["waiting", "expired"]),
    /** When the run settled into waiting between turns; absent while a turn runs. */
    waitingSince: TimestampSchema.optional(),
    endReason: z.enum(AGENT_RUN_EVENT_WAIT_END_REASONS).optional(),
    endedAt: TimestampSchema.optional(),
    /**
     * Event keys already delivered: the same event never wakes the run twice.
     * A pull request event's key starts with `pr:<host/owner/repo>#<number>|`.
     */
    consumedKeys: z
      .array(z.string().min(1).max(AGENT_RUN_EVENT_WAIT_LIMITS.maxKeyChars))
      .max(AGENT_RUN_EVENT_WAIT_LIMITS.maxConsumedKeys),
    /** PR kinds: what the pull request watch learned, so polling and backoff survive a restart. */
    watch: PullRequestWatchStateSchema.optional(),
    /** `delegated_completion` with a target: the saved Agent that delegated task runs as, for display. */
    targetLabel: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type AgentRunEventWait = z.infer<typeof AgentRunEventWaitSchema>;

/**
 * The input of `stave_wait_for_event`. Kind-specific rules live in
 * `resolveEventWaitRequest`, because a tool's input shape drops refinements.
 */
export const EventWaitInputSchema = z
  .object({
    kind: z
      .enum(AGENT_RUN_EVENT_WAIT_KINDS)
      .describe(
        "pull_request_checks: the pull request's checks finish (pass or fail). pull_request_review: a new review comment or review decision. time: the time in `at`. delegated_completion: delegated work of this task finishes.",
      ),
    target: z
      .string()
      .trim()
      .min(1)
      .max(AGENT_RUN_EVENT_WAIT_LIMITS.maxTargetChars)
      .optional()
      .describe(
        "PR kinds: the pull request number or URL; omit for this workspace branch's pull request. delegated_completion: the delegated task id or delegation key; omit for any delegated work. Not used for time.",
      ),
    at: z.iso.datetime({ offset: true }).optional().describe("time only: when to wake, as an ISO 8601 time within 7 days."),
    expiresAt: z.iso
      .datetime({ offset: true })
      .optional()
      .describe("When to stop waiting without the event. Default 24 hours from now; at most 7 days."),
    maxWakes: z
      .number()
      .int()
      .min(1)
      .max(AGENT_RUN_EVENT_WAIT_LIMITS.maxWakes)
      .optional()
      .describe(`How many times this wait may wake the run. Default ${AGENT_RUN_EVENT_WAIT_LIMITS.defaultMaxWakes}.`),
  })
  .strict();
export type EventWaitInput = z.infer<typeof EventWaitInputSchema>;

/** The tool's result. */
export interface EventWaitReceipt {
  waitId: string;
  expiresAt: string;
}

/** `#12`, `12` or a pull request URL; null when it names none. */
export function parsePullRequestTarget(target: string): number | null {
  return parsePullRequestRef(target)?.number ?? null;
}

/**
 * A pull request reference: its number and, from a URL, its repository as
 * `host/owner/repo` (lowercase, so spellings of one repository compare equal).
 */
export interface PullRequestRef {
  number: number;
  repository: string | null;
}

const PULL_REQUEST_URL = /^(?:https?:\/\/)?(?:www\.)?([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pull\/(\d{1,9})(?:[/?#]|$)/i;

/** `#12`, `12` or a pull request URL, as a reference; null when it names none. */
export function parsePullRequestRef(target: string): PullRequestRef | null {
  const trimmed = target.trim();
  const plain = /^#?(\d{1,9})$/.exec(trimmed)?.[1];
  const url = plain ? null : PULL_REQUEST_URL.exec(trimmed);
  const number = Number(plain ?? url?.[4]);
  if (!Number.isInteger(number) || number < 1) return null;
  return { number, repository: url ? `${url[1]}/${url[2]}/${url[3]}`.toLowerCase() : null };
}

/** One spelling per pull request: `12` for `#12` and `12`, a bare URL for a URL. */
function canonicalPullRequestTarget(target: string): string | null {
  const ref = parsePullRequestRef(target);
  if (!ref) return null;
  const url = PULL_REQUEST_URL.exec(target.trim());
  return url ? `https://${url[1]}/${url[2]}/${url[3]}/pull/${ref.number}` : String(ref.number);
}

/**
 * The pull request a wait is on: its target, or the one its watch locked onto
 * (a wait on the branch's pull request learns it from its first read).
 */
export function eventWaitPullRequest(wait: Pick<AgentRunEventWait, "target" | "watch">): PullRequestRef | null {
  const named = wait.target ? parsePullRequestRef(wait.target) : null;
  const seen = wait.watch?.pullRequest ?? null;
  const seenRepository = seen ? parsePullRequestRef(seen.url)?.repository ?? null : null;
  if (named) return { number: named.number, repository: named.repository ?? (seen?.number === named.number ? seenRepository : null) };
  return seen ? { number: seen.number, repository: seenRepository } : null;
}

/**
 * Whether a new request names the pull request an earlier wait is on: both
 * on the branch's pull request, or the same number in the same repository.
 * A bare number is the workspace's repository. An earlier wait that named
 * another repository's URL is never that; one on the workspace learned its
 * repository from the pull request it read, so a URL naming that repository
 * matches it.
 */
function samePullRequest(previous: AgentRunEventWait, target: string | null): boolean {
  if (previous.target === null && target === null) return true;
  const next = target ? parsePullRequestRef(target) : null;
  const earlier = eventWaitPullRequest(previous);
  if (!next || !earlier || next.number !== earlier.number) return false;
  const earlierNamedRepository = previous.target ? parsePullRequestRef(previous.target)?.repository ?? null : null;
  if (!next.repository) return !earlierNamedRepository;
  return next.repository === earlier.repository;
}

export function isPullRequestEventWait(kind: AgentRunEventWaitKind) {
  return kind === "pull_request_checks" || kind === "pull_request_review";
}

/**
 * Turns a request into the wait to persist, or a sentence for the agent.
 *
 * Replacing a wait of the same kind keeps the event keys it already
 * delivered: every key names its comment, review, check head or child run,
 * and a pull request key also the repository and number of the pull request
 * it was read from (`event-wait-observe.ts`), so a kept key only matches that
 * event on that pull request, however the next wait names it, and never
 * silences another pull request. One on the same target (for a
 * pull request: the same number and repository, however it is spelled, or the
 * branch's pull request it locked onto) also keeps what its watch learned and
 * its start, so a re-registered wait never wakes on an event the agent
 * already handled.
 *
 * A `time` wait's `at` wins over its expiry: the default expiry is at least
 * `at`, never past the 7-day cap, and an `expiresAt` equal to `at` still wakes.
 */
export function resolveEventWaitRequest(args: {
  input: EventWaitInput;
  id: string;
  now: Date;
  stageId: string;
  attempt: number;
  turnId: string | null;
  /** When the asking turn began: later review comments and completions are new to it. */
  since: Date;
  previous?: AgentRunEventWait | null;
}): { ok: true; wait: AgentRunEventWait } | { ok: false; message: string } {
  const { input, now } = args;
  const limits = AGENT_RUN_EVENT_WAIT_LIMITS;
  const nowMs = now.getTime();
  const requested = input.target?.trim() || null;
  // Refusals go back to the model as the tool's error, so they stay in English.
  const refused = (sentence: string) => ({ ok: false as const, message: sentence });
  const target = requested && isPullRequestEventWait(input.kind) ? canonicalPullRequestTarget(requested) : requested;
  if (isPullRequestEventWait(input.kind) && requested && target === null) {
    return refused("target must be a pull request number or URL, such as 128 or https://github.com/acme/app/pull/128.");
  }
  if (input.kind === "time" && target) return refused("A time wait takes `at`, not `target`.");
  if (input.kind !== "time" && input.at) return refused("`at` is only for a time wait.");
  let at: string | null = null;
  if (input.kind === "time") {
    if (!input.at) return refused("A time wait needs `at`, the time to wake.");
    const atMs = Date.parse(input.at);
    if (atMs <= nowMs) return refused("`at` must be in the future.");
    if (atMs > nowMs + limits.maxExpiryMs) return refused("`at` must be within 7 days.");
    at = new Date(atMs).toISOString();
  }
  let expiresMs: number;
  if (input.expiresAt) {
    expiresMs = Date.parse(input.expiresAt);
    if (expiresMs <= nowMs) return refused("`expiresAt` must be in the future.");
    if (expiresMs > nowMs + limits.maxExpiryMs) return refused("`expiresAt` must be within 7 days.");
    if (at && expiresMs < Date.parse(at)) return refused("`expiresAt` must not be before `at`.");
  } else {
    expiresMs = nowMs + limits.defaultExpiryMs;
    if (at) expiresMs = Math.max(expiresMs, Date.parse(at) + limits.timeGraceMs);
    expiresMs = Math.min(expiresMs, nowMs + limits.maxExpiryMs);
  }
  const sameKind = args.previous?.kind === input.kind ? args.previous : null;
  const same = sameKind && (isPullRequestEventWait(input.kind) ? samePullRequest(sameKind, target) : sameKind.target === target)
    ? sameKind
    : null;
  return {
    ok: true,
    wait: AgentRunEventWaitSchema.parse({
      id: args.id,
      kind: input.kind,
      target,
      at,
      stageId: args.stageId,
      attempt: args.attempt,
      turnId: args.turnId,
      registeredAt: now.toISOString(),
      since: (same ? new Date(Math.min(Date.parse(same.since), args.since.getTime())) : args.since).toISOString(),
      expiresAt: new Date(expiresMs).toISOString(),
      maxWakes: input.maxWakes ?? limits.defaultMaxWakes,
      wakes: 0,
      status: "waiting",
      consumedKeys: sameKind?.consumedKeys ?? [],
      ...(same?.watch ? { watch: same.watch } : {}),
    }),
  };
}

/** The run's wait when it belongs to the stage attempt the run is on now. */
export function currentEventWait(
  agentRun: { eventWait?: AgentRunEventWait },
  record: { stageId: string; attempt: number },
): AgentRunEventWait | null {
  const wait = agentRun.eventWait;
  return wait && wait.stageId === record.stageId && wait.attempt === record.attempt ? wait : null;
}

/**
 * The wait a running run is sitting in between turns, for its surfaces: it
 * shows as waiting on the event instead of working. Null while a turn runs.
 */
export function activeEventWait(
  agentRun: { state: string; eventWait?: AgentRunEventWait },
  record: { stageId: string; attempt: number; status: string } | null | undefined,
): AgentRunEventWait | null {
  if (agentRun.state !== "running" || !record || record.status !== "running") return null;
  const wait = currentEventWait(agentRun, record);
  return wait?.status === "waiting" && wait.waitingSince ? wait : null;
}

/** Keeps the newest delivered keys within the cap. */
export function appendConsumedKeys(consumed: readonly string[], keys: readonly string[]): string[] {
  const merged = [...consumed.filter((key) => !keys.includes(key)), ...keys];
  return merged.slice(-AGENT_RUN_EVENT_WAIT_LIMITS.maxConsumedKeys);
}

/* -------------------------------------------------------------------------- */
/* Facts: what woke the run, in a shape the timeline and report can word      */
/* -------------------------------------------------------------------------- */

export const EVENT_WAIT_FACTS = [
  "checks-failed",
  "checks-passed",
  "review-comments",
  "review-approved",
  "review-changes-requested",
  "pull-request-merged",
  "pull-request-closed",
  "delegated-finished",
  "time-reached",
] as const;
export type EventWaitFactKind = (typeof EVENT_WAIT_FACTS)[number];

export const EventWaitFactSchema = z
  .object({
    fact: z.enum(EVENT_WAIT_FACTS),
    count: z.number().int().min(0),
    pullRequestNumber: z.number().int().min(1).nullable(),
  })
  .strict();
export type EventWaitFact = z.infer<typeof EventWaitFactSchema>;

/* -------------------------------------------------------------------------- */
/* Words people see                                                            */
/* -------------------------------------------------------------------------- */

const KIND_KEYS = {
  pull_request_checks: "agentRuns:eventWait.kind.pullRequestChecks",
  pull_request_review: "agentRuns:eventWait.kind.pullRequestReview",
  time: "agentRuns:eventWait.kind.time",
  delegated_completion: "agentRuns:eventWait.kind.delegatedCompletion",
} as const satisfies Record<AgentRunEventWaitKind, string>;

/** "PR checks", "PR review", "Scheduled time", "Delegated work". */
export function describeEventWaitKind(kind: AgentRunEventWaitKind): string {
  return i18n.t(KIND_KEYS[kind]);
}

/** "Waiting · PR checks": the run's state while it waits. */
export function describeEventWaitLabel(wait: Pick<AgentRunEventWait, "kind">): string {
  return i18n.t("agentRuns:eventWait.waitingOn", { event: describeEventWaitKind(wait.kind) });
}

const OPAQUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function describeTarget(wait: Pick<AgentRunEventWait, "kind" | "target" | "watch" | "targetLabel">): string {
  if (wait.kind === "delegated_completion" && wait.targetLabel) {
    return i18n.t("agentRuns:eventWait.target.delegatedAgent", { name: wait.targetLabel });
  }
  // A bare task id means nothing to a reader; a delegation key the agent chose may.
  if (wait.kind === "delegated_completion" && wait.target && OPAQUE_ID.test(wait.target)) {
    return i18n.t("agentRuns:eventWait.target.delegatedTaskUnnamed");
  }
  if (isPullRequestEventWait(wait.kind)) {
    const number = (wait.target ? parsePullRequestTarget(wait.target) : null) ?? wait.watch?.pullRequest?.number ?? null;
    return number
      ? i18n.t("agentRuns:eventWait.target.pullRequest", { number })
      : i18n.t("agentRuns:eventWait.target.branchPullRequest");
  }
  if (wait.kind === "delegated_completion") {
    return wait.target
      ? i18n.t("agentRuns:eventWait.target.delegatedTask", { target: wait.target })
      : i18n.t("agentRuns:eventWait.target.anyDelegated");
  }
  return "";
}

/** What the run waits for and until when, in one sentence. */
export function describeEventWaitDetail(wait: AgentRunEventWait): string {
  const expires = formatDateTime(wait.expiresAt);
  switch (wait.kind) {
    case "pull_request_checks":
      return i18n.t("agentRuns:eventWait.detail.pullRequestChecks", { target: describeTarget(wait), expires });
    case "pull_request_review":
      return i18n.t("agentRuns:eventWait.detail.pullRequestReview", { target: describeTarget(wait), expires });
    case "time":
      return i18n.t("agentRuns:eventWait.detail.time", { at: formatDateTime(wait.at ?? wait.expiresAt) });
    case "delegated_completion":
      return i18n.t("agentRuns:eventWait.detail.delegatedCompletion", { target: describeTarget(wait), expires });
  }
}

/** The sentence a run pauses with when its wait ends without the event. */
export function describeEventWaitEnd(
  wait: AgentRunEventWait,
  reason: AgentRunEventWaitEndReason,
  error?: string,
): string {
  const event = describeEventWaitKind(wait.kind);
  switch (reason) {
    case "expired":
      return i18n.t("agentRuns:eventWait.ended.expired", { event, time: formatDateTime(wait.expiresAt) });
    case "wake-limit":
      return i18n.t("agentRuns:eventWait.ended.wakeLimit", { event, count: wait.maxWakes });
    case "unreadable":
      return i18n.t("agentRuns:eventWait.ended.unreadable", { event, error: error ?? "" }).trim();
  }
}

/** "3 failing checks", "PR #12 merged", "the scheduled time". */
export function describeEventWaitFact(fact: EventWaitFact): string {
  const number = fact.pullRequestNumber ?? 0;
  switch (fact.fact) {
    case "checks-failed":
      return i18n.t("agentRuns:eventWait.fact.checksFailed", { count: fact.count });
    case "checks-passed":
      return i18n.t("agentRuns:eventWait.fact.checksPassed");
    case "review-comments":
      return i18n.t("agentRuns:eventWait.fact.reviewComments", { count: fact.count });
    case "review-approved":
      return i18n.t("agentRuns:eventWait.fact.reviewApproved");
    case "review-changes-requested":
      return i18n.t("agentRuns:eventWait.fact.reviewChangesRequested");
    case "pull-request-merged":
      return i18n.t("agentRuns:eventWait.fact.pullRequestMerged", { number });
    case "pull-request-closed":
      return i18n.t("agentRuns:eventWait.fact.pullRequestClosed", { number });
    case "delegated-finished":
      return i18n.t("agentRuns:eventWait.fact.delegatedFinished", { count: fact.count });
    case "time-reached":
      return i18n.t("agentRuns:eventWait.fact.timeReached");
  }
}

/* -------------------------------------------------------------------------- */
/* Timeline and report lines, from the run's events                            */
/* -------------------------------------------------------------------------- */

export interface AgentRunEventWaitLine {
  at: string;
  text: string;
}

function eventKind(value: unknown): AgentRunEventWaitKind | null {
  return (AGENT_RUN_EVENT_WAIT_KINDS as readonly unknown[]).includes(value) ? (value as AgentRunEventWaitKind) : null;
}

/** One line for a wait event, or null for any other event. */
export function describeEventWaitEvent(event: {
  kind: string;
  detail: Record<string, unknown>;
  createdAt: string;
}): AgentRunEventWaitLine | null {
  const kind = eventKind(event.detail.waitKind);
  if (!kind) return null;
  const name = describeEventWaitKind(kind);
  switch (event.kind) {
    case "wait-registered": {
      const target = describeTarget({
        kind,
        target: typeof event.detail.target === "string" ? event.detail.target : null,
        ...(typeof event.detail.targetLabel === "string" ? { targetLabel: event.detail.targetLabel } : {}),
      });
      return {
        at: event.createdAt,
        text: target
          ? i18n.t("agentRuns:eventWait.timeline.registeredTarget", { event: name, target })
          : i18n.t("agentRuns:eventWait.timeline.registered", { event: name }),
      };
    }
    case "wait-woke": {
      const fact = EventWaitFactSchema.safeParse(event.detail.fact);
      return {
        at: event.createdAt,
        text: i18n.t("agentRuns:eventWait.timeline.woke", {
          fact: fact.success ? describeEventWaitFact(fact.data) : name,
          wake: Number(event.detail.wake ?? 1),
          max: Number(event.detail.maxWakes ?? 1),
        }),
      };
    }
    case "wait-expired": {
      const text =
        event.detail.reason === "wake-limit"
          ? i18n.t("agentRuns:eventWait.timeline.endedWakeLimit", { event: name })
          : event.detail.reason === "unreadable"
            ? i18n.t("agentRuns:eventWait.timeline.endedUnreadable", { event: name })
            : i18n.t("agentRuns:eventWait.timeline.endedExpired", { event: name });
      return { at: event.createdAt, text };
    }
    default:
      return null;
  }
}

export function collectEventWaitLines(
  events: ReadonlyArray<{ kind: string; detail: Record<string, unknown>; createdAt: string }>,
): AgentRunEventWaitLine[] {
  return events.flatMap((event) => describeEventWaitEvent(event) ?? []);
}
