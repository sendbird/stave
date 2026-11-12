import { z } from "zod";
import { TarsEventKindSchema, TarsStateSchema, type TarsEventKind, type TarsResponsibility } from "./types";

export { TarsEventKindSchema, TarsFollowUpStateSchema, type TarsEventKind, type TarsFollowUpState } from "./types";

/**
 * Tars's event inbox: one durable row per observed change of a
 * responsibility. The host writes it in the same transaction as the change;
 * main turns the events that need judgment into at most one automatic
 * follow-up planner turn per episode. Nothing here starts a model call by itself.
 */

/** At most this many automatic follow-ups start in any rolling window, across all responsibilities. */
export const TARS_FOLLOW_UP_WINDOW_CAP = 6;
export const TARS_FOLLOW_UP_WINDOW_MS = 60 * 60_000;
/** Processed events older than this are removed at startup; pending ones always stay. */
export const TARS_EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Work that has waited this long without any change gets one follow-up for that wait. */
export const TARS_WAIT_FOLLOW_UP_MS = 60 * 60_000;

export const TARS_JUDGMENT_EVENTS: ReadonlySet<TarsEventKind> = new Set(["resultReady", "blocked", "unverifiedCompletion", "verificationFailed", "stageAsksUser", "waitExpired", "decisionInvalidated"]);
/** The kinds an automatic follow-up message can carry; an invalidated decision keeps its own re-ask message. */
export const TarsFollowUpReasonSchema = z.enum(["resultReady", "blocked", "unverifiedCompletion", "verificationFailed", "stageAsksUser", "waitExpired"]);
export type TarsFollowUpReason = z.infer<typeof TarsFollowUpReasonSchema>;

/**
 * `pending`: waits for main. `settled`: the host applied it without judgment.
 * `followedUp`: it started its follow-up (`messageId`). `coalesced`: a newer
 * event of the same responsibility covered it. `superseded`: the work moved on,
 * ended, was paused or taken over, or the user spoke since. `exhausted`: the
 * saved turn limit was reached by automatic turns, so no follow-up started.
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

type AskEpisodeFields = "state" | "stageAsksUser" | "observedTurns" | "observedStage";

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
export function classifyTarsTransition(previous: Pick<TarsResponsibility, "detailCode" | AskEpisodeFields> | null,
  next: Pick<TarsResponsibility, "detailCode" | AskEpisodeFields>): TarsEventKind | null {
  if (next.state === "resultReady") return previous?.state === "resultReady" ? null : "resultReady";
  if (next.state === "completed") return previous?.state === "completed" ? null : "completed";
  // A stage that asks starts its episode when the ask is new; the run continuing ends it.
  if (isTarsStageAskingUser(next)) return previous && sameAsk(previous, next) ? null : "stageAsksUser";
  if (next.state !== "blocked") return null;
  const kind = blockedKind(next);
  return previous?.state === "blocked" && blockedKind(previous) === kind ? null : kind;
}

/** Whether the responsibility still stands where the event saw it; anything else supersedes the event. */
export function isTarsEventCurrent(event: Pick<TarsEvent, "kind" | "observedState" | "observedRevision">,
  row: Pick<TarsResponsibility, "state" | "detailCode" | "revision" | "stageAsksUser"> | null) {
  if (!row || row.revision < event.observedRevision || row.state !== event.observedState) return false;
  if (event.kind === "waitExpired") return row.state === "waiting" && row.revision === event.observedRevision;
  // New words from the same asking stage keep its episode; a plain wait since does not.
  if (event.kind === "stageAsksUser") return isTarsStageAskingUser(row);
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
