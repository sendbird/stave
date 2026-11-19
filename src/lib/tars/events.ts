import { tarsPrWatchEpisode } from "./pr-checks";
import { z } from "zod";
import { TarsEventKindSchema, TarsStateSchema, type TarsEventKind, type TarsResponsibility } from "./types";

export { TarsEventKindSchema, TarsFollowUpStateSchema, type TarsEventKind, type TarsFollowUpState } from "./types";

/**
 * Tars's event inbox: one durable row per observed change of a
 * responsibility. The host writes it in the same transaction as the change;
 * main turns the events that need judgment into at most one automatic
 * follow-up planner turn per episode. Nothing here starts a model call by itself.
 */

/**
 * At most this many automatic follow-ups start in any rolling window, across
 * all responsibilities. This time bound is the whole budget: each change gets
 * one follow-up and only live work changes, so no count since the user's last
 * action stops them.
 */
export const TARS_FOLLOW_UP_WINDOW_CAP = 6;
export const TARS_FOLLOW_UP_WINDOW_MS = 60 * 60_000;
/**
 * Automatic follow-ups in a row that may see a work at the same progress
 * (`tarsWorkProgress`). Waiting work: answering an ask can return it to
 * running while the same provider turn asks again, which spends no Run turn.
 * Ended work: a follow-up on a Run that ended (`TARS_ENDED_RESULT_EVENTS`)
 * may start a new Run as a continuation, with a fresh turn guard; one that
 * ends with the same result made no progress. The first follow-up acts; the
 * second covers an attempt that fell short; a third time with nothing moved
 * means Tars's automatic attempts do not help, so it goes to the user
 * (`exhausted`) instead. CI and review continuations keep their own two rounds.
 */
export const TARS_FOLLOW_UPS_WITHOUT_PROGRESS = 2;
/**
 * Automatic continuations of one piece of ended work between two user actions,
 * whatever their results say. The result brake stops repeats after two (three
 * for an alternation between two results, `tarsEndedResultBrake`); five leaves
 * room for two real steps beyond that, stays below one hour's window
 * (`TARS_FOLLOW_UP_WINDOW_CAP`) so one work never spends it alone, and keeps
 * the count bounded even if a result fingerprint ever reads a change that is
 * not one.
 */
export const TARS_ENDED_FOLLOW_UPS_MAX = 5;
/** Processed events older than this are removed at startup; pending ones always stay. */
export const TARS_EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Work that has waited this long without any change gets one follow-up for that wait. */
export const TARS_WAIT_FOLLOW_UP_MS = 60 * 60_000;

/** Follow-ups on a Run that ended; their progress is the result it ended with, compared only among themselves. */
export const TARS_ENDED_RESULT_EVENTS: ReadonlySet<TarsEventKind> = new Set(["resultReady", "blocked", "unverifiedCompletion", "verificationFailed"]);
export const TARS_JUDGMENT_EVENTS: ReadonlySet<TarsEventKind> = new Set(["resultReady", "blocked", "unverifiedCompletion", "verificationFailed", "stageAsksUser", "limitReached", "waitExpired", "decisionInvalidated", "ciFailed", "ciPassed", "ciUnavailable", "prChangesRequested", "prReviewNotice"]);
/** The kinds an automatic follow-up message can carry; an invalidated decision keeps its own re-ask message. */
export const TarsFollowUpReasonSchema = z.enum(["resultReady", "blocked", "unverifiedCompletion", "verificationFailed", "stageAsksUser", "limitReached", "waitExpired", "ciFailed", "ciPassed", "ciUnavailable", "prChangesRequested", "prReviewNotice"]);
export type TarsFollowUpReason = z.infer<typeof TarsFollowUpReasonSchema>;

/**
 * `pending`: waits for main. `settled`: the host applied it without judgment.
 * `followedUp`: it started its follow-up (`messageId`). `coalesced`: a newer
 * event of the same responsibility covered it. `superseded`: the work moved on,
 * ended, was paused or taken over, or the user addressed this work. `exhausted`:
 * Tars stopped following up because the work asked again without progress
 * (`TARS_FOLLOW_UPS_WITHOUT_PROGRESS`), or, on older rows, because a count of
 * automatic follow-ups stopped it; the event is a visible notice.
 */
export const TarsEventStatusSchema = z.enum(["pending", "settled", "followedUp", "coalesced", "superseded", "exhausted"]);
export type TarsEventStatus = z.infer<typeof TarsEventStatusSchema>;

const IdSchema = z.string().trim().min(1).max(256);

export const TarsEventSchema = z.object({
  /** Idempotency key: kind, responsibility and episode. A duplicate delivery names the same row. */
  key: z.string().min(1).max(700),
  responsibilityId: IdSchema,
  kind: TarsEventKindSchema,
  /** The responsibility revision the change produced; for an invalidated decision, the decision id. */
  episode: z.string().min(1).max(300),
  observedRevision: z.number().int().min(1),
  observedState: TarsStateSchema,
  /** The run the change was observed on, when there was one. */
  attempt: IdSchema.nullable(),
  status: TarsEventStatusSchema,
  messageId: IdSchema.nullable(),
  /**
   * When its follow-up's planner turn started. Durable, unlike the hourly
   * start log the window prunes: it says this change actually reached Tars.
   */
  startedAt: z.iso.datetime().nullable().optional(),
  /** The work's progress (`tarsWorkProgress`) when it was followed up; absent when it had none to compare or on older rows. */
  progress: z.string().min(1).max(400).optional(),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
}).strict();
export type TarsEvent = z.infer<typeof TarsEventSchema>;

export type TarsEventInput = Pick<TarsEvent, "responsibilityId" | "kind" | "episode" | "observedRevision" | "observedState" | "attempt">;

export function tarsEventKey(event: Pick<TarsEvent, "kind" | "responsibilityId" | "episode">) {
  return `${event.kind}:${event.responsibilityId}:${event.episode}`;
}
/** The follow-up message an event starts; its request id keeps creation idempotent across crashes. */
export function tarsFollowUpRequestId(eventKey: string) {
  return `followup:${eventKey}`;
}

/** What a blocked responsibility needs judged, by the code the host wrote. */
function blockedKind(row: Pick<TarsResponsibility, "detailCode">): TarsEventKind {
  if (row.detailCode === "unverifiedCompletion") return "unverifiedCompletion";
  return row.detailCode === "incompleteReport" || row.detailCode === "staleVerification" ? "verificationFailed" : "blocked";
}

/**
 * Waiting because the run's own stage stopped to ask the user (blocked, stuck
 * or awaiting sign-off). This is the boundary between the two kinds of wait:
 * such a wait is judged at once (`stageAsksUser`), once per episode; every
 * other wait (the user paused the run, a usage-limit or other run pause, a
 * tool approval or question the user answers in the task) keeps the quiet
 * wait rule and gets its one follow-up only after `TARS_WAIT_FOLLOW_UP_MS`.
 */
export function isTarsStageAskingUser(row: Pick<TarsResponsibility, "state" | "stageAsksUser">) {
  return row.state === "waiting" && row.stageAsksUser === true;
}

/** Prefix of the progress of ended work (`tarsWorkProgress`), so it is compared only with other ended results. */
export const TARS_RESULT_PROGRESS_PREFIX = "result:";

/**
 * Where work stands, for telling a repeat from progress. Waiting work: its
 * run, Run turn and stage attempt (a helper's includes its report revision);
 * a commit, a stage or a report comes from a turn or a stage attempt, so any
 * of them changes this. Ended work: the result its Run ended with
 * (`observedResult`), never the run id, so a continuation that ends the same
 * way is no progress. Null when the row has nothing observed to compare.
 */
export function tarsWorkProgress(row: Pick<TarsResponsibility, "state" | "agentRunId" | "observedTurns" | "observedStage" | "observedResult">): string | null {
  if (row.state === "resultReady" || row.state === "blocked" || row.state === "completed")
    return row.observedResult ? `${TARS_RESULT_PROGRESS_PREFIX}${row.observedResult}` : null;
  if (row.state !== "waiting" || row.observedTurns === undefined) return null;
  return `${row.agentRunId ?? ""}|${row.observedTurns}|${row.observedStage ?? ""}`.slice(0, 400);
}

/**
 * The progress a follow-up of this kind is compared by: the result for a Run
 * that ended, the waiting position for waiting work. CI and review follow-ups
 * on ended work keep their own two rounds, so they carry none.
 */
export function tarsFollowUpProgress(kind: TarsEventKind, row: Parameters<typeof tarsWorkProgress>[0]): string | null {
  return TARS_ENDED_RESULT_EVENTS.has(kind) || row.state === "waiting" ? tarsWorkProgress(row) : null;
}

/** The parts of an ended result, in its fingerprint's order (`tarsRunResult`): outcome, workspace revision, review verdict, unmet criteria. */
export const TARS_RESULT_PARTS = ["o", "r", "v", "u"] as const;
const RESULT_FORMAT = /^o\.[0-9a-f]{8,32}\|r\.(?:[0-9a-f]{8,32}|\?)\|v\.(?:[0-9a-f]{8,32}|\?)\|u\.(?:[0-9a-f]{8,32}|\?)$/;

/** The known parts of an ended result's fingerprint; a part read as `?` was not known and is left out. Null for anything else. */
function resultParts(progress: string): Map<string, string> | null {
  const result = progress.startsWith(TARS_RESULT_PROGRESS_PREFIX) ? progress.slice(TARS_RESULT_PROGRESS_PREFIX.length) : progress;
  if (!RESULT_FORMAT.test(result)) return null;
  return new Map(result.split("|").map((part) => part.split(".") as [string, string]).filter(([, value]) => value !== "?"));
}

/**
 * Whether one ended result positively differs from another: some part known
 * on both sides (a known revision, the outcome, verdict or unmet criteria)
 * differs. A part one side could not read is never a change, so a revision
 * read that alternates between known and unknown is no progress.
 */
export function tarsResultProgressed(next: string, previous: string): boolean {
  const [a, b] = [resultParts(next), resultParts(previous)];
  if (!a || !b) return false;
  return [...a].some(([part, value]) => b.has(part) && b.get(part) !== value);
}

/**
 * Whether the next follow-up on ended work goes to the user instead
 * (`exhausted`), given the results of its earlier automatic follow-ups since
 * the user last acted, oldest first. A result is new when it positively
 * differs from every earlier one; repeats are counted from the last new
 * result, so results alternating between two values (A/B/A/B) cannot reset
 * the count. After `TARS_FOLLOW_UPS_WITHOUT_PROGRESS` follow-ups since the
 * last new result, a result that is not new stops; after
 * `TARS_ENDED_FOLLOW_UPS_MAX` follow-ups everything stops.
 */
export function tarsEndedResultBrake(previous: readonly string[], next: string): boolean {
  if (previous.length >= TARS_ENDED_FOLLOW_UPS_MAX) return true;
  const isNew = (result: string, earlier: readonly string[]) => earlier.every((item) => tarsResultProgressed(result, item));
  if (isNew(next, previous)) return false;
  let lastNew = 0;
  previous.forEach((result, index) => { if (isNew(result, previous.slice(0, index))) lastNew = index; });
  return previous.length - lastNew >= TARS_FOLLOW_UPS_WITHOUT_PROGRESS;
}

/** Which notice says a follow-up's state: Tars stopped continuing ended work (`exhaustedResult`) reads apart from a repeated ask. */
export function tarsFollowUpNotice<S extends string>(state: { kind: TarsEventKind; status: S }): S | "exhaustedResult" {
  return state.status === "exhausted" && TARS_ENDED_RESULT_EVENTS.has(state.kind) ? "exhaustedResult" : state.status;
}

type AskEpisodeFields = "state" | "stageAsksUser" | "observedTurns" | "observedStage";
type TransitionFields = "detailCode" | AskEpisodeFields;

/** The execution turn limit needs an immediate judgment, even when its stage has explanatory words. */
export function isTarsLimitReached(row: Pick<TarsResponsibility, "state" | "detailCode" | "detailParams">) {
  return row.state === "waiting" && row.detailCode === "runPaused" && row.detailParams?.reason === "limit-reached";
}

/**
 * Whether two observations of an asking stage are the same ask: same run
 * turn and same stage attempt. The run may continue and ask again between two
 * looks; a new turn or attempt is then a new ask, even though both looks saw
 * the stage asking. New words within the same turn are the same ask.
 */
function sameAsk(previous: Pick<TarsResponsibility, AskEpisodeFields>, next: Pick<TarsResponsibility, AskEpisodeFields>) {
  return isTarsStageAskingUser(previous) && previous.observedTurns === next.observedTurns && previous.observedStage === next.observedStage;
}

/**
 * The event a saved change produces, or null. Only a transition counts: the
 * same state observed again (or a new sentence in it) is the same episode, so
 * an unchanged or flapping observation never produces another model call.
 */
export function classifyTarsTransition(previous: Pick<TarsResponsibility, TransitionFields> & Partial<Pick<TarsResponsibility, "detailParams">> | null,
  next: Pick<TarsResponsibility, TransitionFields> & Partial<Pick<TarsResponsibility, "detailParams">>): TarsEventKind | null {
  if (next.state === "resultReady") return previous?.state === "resultReady" ? null : "resultReady";
  if (next.state === "completed") return previous?.state === "completed" ? null : "completed";
  if (isTarsLimitReached(next)) return previous && isTarsLimitReached(previous) && previous.observedTurns === next.observedTurns
    && previous.observedStage === next.observedStage ? null : "limitReached";
  // A stage that asks starts its episode when the ask is new; the run continuing ends it.
  if (isTarsStageAskingUser(next)) return previous && sameAsk(previous, next) ? null : "stageAsksUser";
  if (next.state !== "blocked") return null;
  const kind = blockedKind(next);
  return previous?.state === "blocked" && blockedKind(previous) === kind ? null : kind;
}

/** Whether the responsibility still stands where the event saw it; anything else supersedes the event. */
export function isTarsEventCurrent(event: Pick<TarsEvent, "kind" | "observedState" | "observedRevision"> & { episode?: string; attempt?: string | null },
  row: Pick<TarsResponsibility, "state" | "detailCode" | "revision" | "stageAsksUser"> & Partial<Pick<TarsResponsibility, "detailParams">> & { publication?: TarsResponsibility["publication"]; agentRunId?: string | null } | null) {
  if (!row || row.revision < event.observedRevision || row.state !== event.observedState) return false;
  if (event.kind === "prChangesRequested" || event.kind === "prReviewNotice") {
    const publication = row.publication;
    const feedback = publication?.watch?.feedback;
    return (row.state === "completed" || row.state === "resultReady") && publication?.state === "opened"
      && !publication.watch?.stopped?.match(/closed|merged/) && row.agentRunId === event.attempt
      && publication.agentRunId === row.agentRunId && feedback?.headSha === publication.commit
      && publication.checks?.headSha === publication.commit && feedback?.episode === event.episode;
  }
  if (event.kind.startsWith("ci")) {
    const checks = row.publication?.checks;
    return (row.state === "completed" || row.state === "resultReady") && row.publication?.state === "opened" && !row.publication.watch?.stopped?.match(/closed|merged/)
      && row.agentRunId === event.attempt && row.publication.agentRunId === row.agentRunId
      && (event.kind === "ciUnavailable" ? tarsPrWatchEpisode(row.publication.commit ?? "", row.publication.watch?.startedAt) === event.episode : row.publication.commit === event.episode) && checks?.headSha === row.publication.commit
      && checks?.state === ({ ciFailed: "failed", ciPassed: "passed", ciUnavailable: "unavailable" } as Record<string, string>)[event.kind];
  }
  if (event.kind === "waitExpired") return row.state === "waiting" && row.revision === event.observedRevision;
  // New words from the same asking stage keep its episode; a plain wait since does not.
  if (event.kind === "stageAsksUser") return isTarsStageAskingUser(row);
  if (event.kind === "limitReached") return isTarsLimitReached(row);
  return row.state !== "blocked" || blockedKind(row) === event.kind;
}

/**
 * When waiting work gets its one follow-up if nothing changes before then.
 * A stage that asks the user is covered by its immediate follow-up instead;
 * the inbox applies this quiet wait to it only as a fallback, when that
 * follow-up never reached the model (`TarsEventInbox.askCovered`).
 */
export function tarsNextWaitCheck(row: Pick<TarsResponsibility, "state" | "updatedAt">): string | null {
  if (row.state !== "waiting") return null;
  const at = Date.parse(row.updatedAt);
  return Number.isFinite(at) ? new Date(at + TARS_WAIT_FOLLOW_UP_MS).toISOString() : null;
}
