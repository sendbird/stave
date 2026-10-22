import { z } from "zod";
import type { NormalizedProviderEvent } from "./provider.types";

/**
 * A turn's digest: the facts about it that exist only as provider events, so
 * the saved conversation cannot say them once the turn's event journal is
 * compacted. Steps, approvals and questions are already saved on the turn's
 * messages; errors and retries, stalls, model and account switches, and the
 * Stave checks that ran after the turn are not.
 *
 * It lives in `turns.digest_json` and goes with the turn row, so a task's
 * digests last as long as the task and are deleted with it. A turn that began
 * before digests existed has none (`null`), which reads as "No record"; a
 * digest with no entries means nothing of the kind happened.
 */

/** At most this many entries per turn. */
export const TURN_DIGEST_ENTRY_LIMIT = 64;
/** And at most this many bytes of JSON per turn. */
export const TURN_DIGEST_BYTE_LIMIT = 16 * 1024;
/**
 * Silence this long between two events is recorded as a stall. It matches the
 * run line's stall threshold (`PROVIDER_TURN_STALL_THRESHOLD_MS`), so a turn
 * the shelf showed as stalled has a matching entry.
 */
export const TURN_DIGEST_STALL_MS = 5 * 60 * 1000;
const TEXT_LIMIT = 400;
const CHECK_FAILURE_LIMIT = 6;
const CHECK_MESSAGE_LIMIT = 200;
const ID_LIMIT = 200;

const AtSchema = z.string().min(1).max(64);
const TextSchema = z.string().max(TEXT_LIMIT);
const CountSchema = z.number().int().min(1);

export const TurnDigestEntrySchema = z.discriminatedUnion("kind", [
  /** A provider error the turn did not recover from. */
  z.object({
    kind: z.literal("error"),
    at: AtSchema,
    message: TextSchema,
    count: CountSchema,
    lastAt: AtSchema.optional(),
  }),
  /** A recoverable provider error: the provider retried. */
  z.object({
    kind: z.literal("retry"),
    at: AtSchema,
    message: TextSchema,
    count: CountSchema,
    lastAt: AtSchema.optional(),
  }),
  /** No events for `silentMs`, starting at `at`. */
  z.object({
    kind: z.literal("stall"),
    at: AtSchema,
    silentMs: z.number().int().min(0),
    /** The next event ended the turn rather than continuing it. */
    endedTurn: z.boolean(),
  }),
  /** The model that ran changed, by the runtime or by an agent run's route. */
  z.object({
    kind: z.literal("route"),
    at: AtSchema,
    toModel: TextSchema,
    fromModel: TextSchema.optional(),
    reason: TextSchema.optional(),
    cause: z.string().max(64).optional(),
  }),
  /** The account changed within the turn or since the task's previous turn. */
  z.object({
    kind: z.literal("account"),
    at: AtSchema,
    providerId: z.string().max(64),
    fromAccountId: z.string().max(ID_LIMIT),
    toAccountId: z.string().max(ID_LIMIT),
    /** `previous-turn` when the task's previous turn ran on `fromAccountId`. */
    since: z.enum(["turn", "previous-turn"]),
  }),
  /** The `turn.completed` checks Stave ran on the workspace after the turn. */
  z.object({
    kind: z.literal("checks"),
    at: AtSchema,
    status: z.enum(["pass", "warn", "fail"]),
    executed: z.number().int().min(0),
    total: z.number().int().min(0),
    failures: z
      .array(
        z.object({
          scriptId: z.string().max(ID_LIMIT),
          message: z.string().max(CHECK_MESSAGE_LIMIT),
          blocking: z.boolean(),
        }),
      )
      .max(CHECK_FAILURE_LIMIT),
    omittedFailures: z.number().int().min(0),
  }),
]);
export type TurnDigestEntry = z.infer<typeof TurnDigestEntrySchema>;
export type TurnDigestEntryKind = TurnDigestEntry["kind"];

export const TurnDigestSchema = z.object({
  version: z.literal(1),
  entries: z.array(TurnDigestEntrySchema).max(TURN_DIGEST_ENTRY_LIMIT),
  /** Entries dropped to keep the digest inside its limits. */
  omitted: z.number().int().min(0),
  /** The account the turn last ran on, compared to spot a switch. */
  accountProfileId: z.string().max(ID_LIMIT).nullable(),
});
export type TurnDigest = z.infer<typeof TurnDigestSchema>;

export function createTurnDigest(accountProfileId: string | null = null): TurnDigest {
  return {
    version: 1,
    entries: [],
    omitted: 0,
    accountProfileId: accountProfileId ? bound(accountProfileId, ID_LIMIT) : null,
  };
}

/**
 * Read a stored digest. Entries this version cannot read (written by a newer
 * one) are dropped and counted as omitted rather than discarding the whole
 * digest.
 */
export function parseTurnDigest(value: string | null | undefined): TurnDigest | null {
  if (!value) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 1) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const rawEntries = Array.isArray(record.entries) ? record.entries : [];
  const entries: TurnDigestEntry[] = [];
  let unreadable = 0;
  for (const entry of rawEntries.slice(0, TURN_DIGEST_ENTRY_LIMIT)) {
    const parsed = TurnDigestEntrySchema.safeParse(entry);
    if (parsed.success) entries.push(parsed.data);
    else unreadable += 1;
  }
  unreadable += Math.max(0, rawEntries.length - TURN_DIGEST_ENTRY_LIMIT);
  const omitted =
    typeof record.omitted === "number" && Number.isInteger(record.omitted) && record.omitted >= 0
      ? record.omitted
      : 0;
  const account = record.accountProfileId;
  return {
    version: 1,
    entries,
    omitted: omitted + unreadable,
    accountProfileId: typeof account === "string" && account ? bound(account, ID_LIMIT) : null,
  };
}

export function serializeTurnDigest(digest: TurnDigest) {
  return JSON.stringify(digest);
}

function bound(value: string, limit: number) {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

function byteLength(digest: TurnDigest) {
  return new TextEncoder().encode(serializeTurnDigest(digest)).length;
}

/**
 * Least important first. A retry storm or a run of stalls gives way before
 * the turn's errors, and the checks the acceptance of a turn depends on go
 * last.
 */
const EVICTION_ORDER: readonly TurnDigestEntryKind[] = [
  "retry",
  "stall",
  "route",
  "account",
  "error",
  "checks",
];

function evictOne(entries: TurnDigestEntry[]) {
  for (const kind of EVICTION_ORDER) {
    const index = entries.findIndex((entry) => entry.kind === kind);
    if (index >= 0) {
      return [...entries.slice(0, index), ...entries.slice(index + 1)];
    }
  }
  return entries.slice(1);
}

/** Keep the digest inside both limits, counting what had to go. */
export function enforceTurnDigestLimits(digest: TurnDigest): TurnDigest {
  let next = digest;
  while (
    next.entries.length > 0 &&
    (next.entries.length > TURN_DIGEST_ENTRY_LIMIT || byteLength(next) > TURN_DIGEST_BYTE_LIMIT)
  ) {
    next = { ...next, entries: evictOne(next.entries), omitted: next.omitted + 1 };
  }
  return next;
}

/**
 * Add one fact. A provider that fails the same way repeatedly (a retry loop)
 * counts on the last entry instead of filling the digest with copies.
 */
export function appendTurnDigestEntry(digest: TurnDigest, entry: TurnDigestEntry): TurnDigest {
  const last = digest.entries.at(-1);
  if (
    last &&
    (entry.kind === "error" || entry.kind === "retry") &&
    last.kind === entry.kind &&
    last.message === entry.message
  ) {
    const merged = { ...last, count: last.count + entry.count, lastAt: entry.lastAt ?? entry.at };
    return { ...digest, entries: [...digest.entries.slice(0, -1), merged] };
  }
  return enforceTurnDigestLimits({ ...digest, entries: [...digest.entries, entry] });
}

/** The digest entry a provider event stands for, or null when it adds no fact. */
export function turnDigestEntryForEvent(
  event: NormalizedProviderEvent,
  at: string,
): TurnDigestEntry | null {
  if (event.type === "error") {
    const message = bound(event.message || "", TEXT_LIMIT);
    return { kind: event.recoverable ? "retry" : "error", at, message, count: 1 };
  }
  if (event.type === "model_resolved") {
    if (event.modelExecution) {
      const { requestedModel, actualModel, reason } = event.modelExecution;
      if (!actualModel || requestedModel === actualModel) return null;
      return {
        kind: "route",
        at,
        toModel: bound(actualModel, TEXT_LIMIT),
        ...(requestedModel ? { fromModel: bound(requestedModel, TEXT_LIMIT) } : {}),
        ...(reason ? { reason: bound(reason, TEXT_LIMIT) } : {}),
      };
    }
    if (event.agentRunRoute) {
      return {
        kind: "route",
        at,
        toModel: bound(event.resolvedModel, TEXT_LIMIT),
        cause: bound(event.agentRunRoute.cause, 64),
      };
    }
  }
  return null;
}

/** The account an event says the turn is running on, when it says one. */
export function turnDigestAccountForEvent(event: NormalizedProviderEvent): string | null {
  if (event.type === "provider_session" || event.type === "provider_turn" || event.type === "done") {
    const account = event.accountProfileId?.trim();
    return account ? bound(account, ID_LIMIT) : null;
  }
  return null;
}

/**
 * Note the account an event reports. The first one only sets the turn's
 * account; a later, different one is a switch within the turn.
 */
export function observeTurnDigestAccount(args: {
  digest: TurnDigest;
  providerId: string;
  accountProfileId: string;
  at: string;
}): TurnDigest {
  const current = args.digest.accountProfileId;
  if (current === args.accountProfileId) return args.digest;
  if (!current) return { ...args.digest, accountProfileId: args.accountProfileId };
  return appendTurnDigestEntry(
    { ...args.digest, accountProfileId: args.accountProfileId },
    {
      kind: "account",
      at: args.at,
      providerId: args.providerId,
      fromAccountId: current,
      toAccountId: args.accountProfileId,
      since: "turn",
    },
  );
}

/** Events a turn waits on the user after, so the silence that follows is not a stall. */
export function isTurnDigestWaitEvent(eventType: string | null | undefined) {
  return eventType === "approval" || eventType === "user_input";
}

/**
 * The stall entry for the silence between two events, or null when it was
 * short or the turn was waiting for an answer.
 */
export function turnDigestStallEntry(args: {
  previousAt: string | null;
  previousEventType: string | null;
  at: string;
  /** The event after the silence ended the turn. */
  endsTurn: boolean;
}): TurnDigestEntry | null {
  if (!args.previousAt || isTurnDigestWaitEvent(args.previousEventType)) return null;
  const silentMs = Date.parse(args.at) - Date.parse(args.previousAt);
  if (!Number.isFinite(silentMs) || silentMs < TURN_DIGEST_STALL_MS) return null;
  return { kind: "stall", at: args.previousAt, silentMs: Math.round(silentMs), endedTurn: args.endsTurn };
}

/** Whether an event ends the turn, for a stall entry's wording. */
export function isTurnDigestEndingEvent(event: NormalizedProviderEvent) {
  return event.type === "done" || (event.type === "error" && !event.recoverable);
}

/** A `turn.completed` hook run summary, as the workspace scripts runtime reports it. */
export interface TurnDigestCheckSummary {
  totalEntries: number;
  executedEntries: number;
  failures: ReadonlyArray<{ scriptId: string; message: string; blocking: boolean }>;
}

/** The checks entry for a `turn.completed` hook run, or null when no check is configured. */
export function turnDigestChecksEntry(summary: TurnDigestCheckSummary, at: string): TurnDigestEntry | null {
  if (summary.totalEntries <= 0) return null;
  const status = summary.failures.length === 0
    ? "pass"
    : summary.failures.some((failure) => failure.blocking)
      ? "fail"
      : "warn";
  const failures = summary.failures.slice(0, CHECK_FAILURE_LIMIT).map((failure) => ({
    scriptId: bound(failure.scriptId, ID_LIMIT),
    message: bound(failure.message || "", CHECK_MESSAGE_LIMIT),
    blocking: failure.blocking,
  }));
  return {
    kind: "checks",
    at,
    status,
    executed: Math.max(0, Math.trunc(summary.executedEntries)),
    total: Math.max(0, Math.trunc(summary.totalEntries)),
    failures,
    omittedFailures: Math.max(0, summary.failures.length - failures.length),
  };
}

/**
 * Settle the digest when its turn closes. A recoverable error is recorded as
 * a retry while the turn runs; when the turn then ended on it without
 * continuing, it was the failure, and the run line said "Turn failed" too.
 * The last retry of that message becomes an error.
 */
export function settleTurnDigestFailure(
  digest: TurnDigest,
  lastError: { message: string; recoverable: boolean; continuationObserved?: boolean } | null,
  failed: boolean,
): TurnDigest {
  if (!failed || !lastError?.recoverable || lastError.continuationObserved) return digest;
  const message = bound(lastError.message || "", TEXT_LIMIT);
  let index = -1;
  for (let candidate = digest.entries.length - 1; candidate >= 0; candidate -= 1) {
    const entry = digest.entries[candidate];
    if ((entry?.kind === "retry" || entry?.kind === "error") && entry.message === message) {
      index = candidate;
      break;
    }
  }
  const retry = digest.entries[index];
  // Already settled (an error is the latest entry for it) or never recorded.
  if (!retry || retry.kind !== "retry") return digest;
  const error: TurnDigestEntry = { kind: "error", at: retry.lastAt ?? retry.at, message, count: 1 };
  const replacement: TurnDigestEntry[] = retry.count > 1
    ? [{ kind: "retry", at: retry.at, message, count: retry.count - 1 }, error]
    : [error];
  return enforceTurnDigestLimits({
    ...digest,
    entries: [...digest.entries.slice(0, index), ...replacement, ...digest.entries.slice(index + 1)],
  });
}
