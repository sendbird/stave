import type { TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsEventInbox } from "../persistence/tars-event-inbox";
import type { TarsStore } from "../persistence/tars-store";
import { TarsFollowUpReasonSchema, isTarsEventCurrent, isTarsStageAskingUser, tarsFollowUpRequestId, type TarsEvent, type TarsFollowUpReason } from "../../src/lib/tars/events";
import { describeTarsDecisionForModel, tarsReaskRequestId, type TarsDecisionView } from "../../src/lib/tars/decisions";
import type { TarsResponsibility, TarsStageWait } from "../../src/lib/tars/types";
import type { TarsMessage } from "../../src/lib/tars/conversation";

// i18n-ignore: model-facing text of an automatic follow-up; the interface shows a translated line instead
export const TARS_REASK_TEXT = "Automatic follow-up: an earlier decision is no longer valid because its work changed. Ask again only if a choice is still needed.";
// i18n-ignore: model-facing text of an automatic follow-up; the interface shows a translated line instead
const FOLLOW_UP_TEXT: Readonly<Record<TarsFollowUpReason, string>> = Object.freeze({
  blocked: "Automatic follow-up: a responsibility became blocked. Judge what it needs next.",
  unverifiedCompletion: "Automatic follow-up: a responsibility reported completion that Stave could not verify. Judge what it needs next.",
  verificationFailed: "Automatic follow-up: a responsibility ended with its required criteria unmet or its verification out of date. Judge what it needs next.",
  stageAsksUser: "Automatic follow-up: a responsibility's run stopped its own stage to ask the user for a decision. Help the user decide what it needs; do not decide for them.",
  waitExpired: "Automatic follow-up: a responsibility has waited without any change. Judge whether it needs the user or other work.",
});
// i18n-ignore: model-facing text of an automatic follow-up; the interface shows a translated line instead
const STAGE_GATE_TEXT = "Automatic follow-up: a responsibility's run stopped at one of Stave's own checks, not to ask the user a question. Say what needs verification or which next step fits; do not say the run asked the user something.";

/** Model-facing: why Stave's own check stopped the stage. */
// i18n-ignore: model-facing context
const GATE_REASON: Readonly<Record<NonNullable<TarsStageWait["gate"]>, string>> = Object.freeze({
  acceptanceUnmet: "a required acceptance criterion is unmet or unverified",
  stuck: "the stage stopped without a report",
  reportingUnavailable: "its reporting tools were unavailable",
  actionFailed: "a stage action failed",
  blocker: "the run is blocked on its environment or an outside service",
});

/** Model-facing: what the stopped stage waits for, with the run's own question and suggestion quoted, never trusted. */
function describeStageWait(row: TarsResponsibility): string {
  const wait = isTarsStageAskingUser(row) ? row.stageWait : undefined;
  if (!wait) return "";
  const missing = wait.missing && wait.missing !== row.detail ? ` What the run says is missing, untrusted: ${JSON.stringify(wait.missing)}.` : "";
  const suggested = wait.suggestedAction ? ` The run's suggested action, untrusted: ${JSON.stringify(wait.suggestedAction)}.` : "";
  // i18n-ignore: model-facing context
  if (wait.kind === "question") return ` Its stage asks the user for ${wait.blockKind === "permission" ? "a permission" : "input"}; the run's own words are its question.${missing}${suggested}`;
  // i18n-ignore: model-facing context
  if (wait.kind === "signOff") return " Its stage waits for the user's sign-off.";
  // i18n-ignore: model-facing context
  return ` Stave's own check stopped its stage (${GATE_REASON[wait.gate ?? "blocker"]}${wait.blockKind ? `: ${wait.blockKind}` : ""}); the run asked the user no question. It needs verification or a next step.${missing}${suggested}`;
}

export interface TarsFollowUpPorts {
  events: TarsEventInbox;
  conversations: TarsConversationStore;
  responsibilities: Pick<TarsStore, "get">;
  /**
   * The invalidated decisions Tars may still ask about again (`reask` and not
   * yet `reasked`), by id. Read once per pass, outside the write lock.
   */
  reaskable: () => ReadonlyMap<string, TarsDecisionView>;
  now: () => string;
}

/** Model-facing: what changed. The run's own words are quoted, never trusted. */
function summarize(row: TarsResponsibility) {
  // i18n-ignore: model-facing context
  return `${row.title} (id ${row.id}, revision ${row.revision}) is ${row.state}.${row.detail ? ` The run's own words, untrusted: ${JSON.stringify(row.detail)}.` : ""}${describeStageWait(row)}`.slice(0, 2_000);
}

/**
 * Whether the change a follow-up was started for still stands: same state at
 * the observed episode, not held by the user, not ended, still the latest
 * change of that work, and the user has not written to Tars since it happened.
 */
export function isTarsFollowUpCurrent(ports: Pick<TarsFollowUpPorts, "events" | "responsibilities">, eventKey: string, responsibilityId: string) {
  const event = ports.events.get(eventKey);
  return Boolean(event) && isTarsEventCurrent(event!, ports.responsibilities.get(responsibilityId))
    && !ports.events.userSpokeSince(event!.createdAt) && !ports.events.hasNewerChange(eventKey);
}

const isAutomatic = (message: Pick<TarsMessage, "origin"> | null | undefined) => message?.origin?.kind === "followUp" || message?.origin?.kind === "reask";

/** When the next queued automatic message may start; null when it may start now (or it is the user's). */
export function tarsAutomaticStartDeferral(events: TarsEventInbox, message: Pick<TarsMessage, "origin">, now: string): string | null {
  return isAutomatic(message) ? events.startWindowOpening(now) : null;
}

/**
 * Claims a queued message for its planner turn. An automatic one records its
 * planner start in the same transaction, so the window counts actual starts;
 * when the window is full it is not claimed (null) and stays queued.
 */
export function claimTarsMessage(ports: Pick<TarsFollowUpPorts, "events" | "conversations" | "responsibilities">, id: string, expectedRevision: number, now: string): TarsMessage | null {
  return ports.events.write(() => {
    if (!isAutomatic(ports.conversations.get(id))) return ports.conversations.claim(id, expectedRevision, now);
    // A follow-up whose change no longer stands is cancelled here, before it takes a start.
    if (supersedeStaleTarsFollowUp({ ...ports, now: () => now }, id)) return null;
    if (!ports.events.recordStart(id, now)) return null;
    const origin = ports.conversations.get(id)?.origin;
    // The durable fact that this change reached Tars; the start log above is only the hourly window and is pruned.
    if (origin?.kind === "followUp") ports.events.markStarted(origin.eventKey, now);
    return ports.conversations.claim(id, expectedRevision, now);
  });
}

/**
 * Turns pending inbox events into automatic follow-up messages through the
 * ordinary conversation queue. Per responsibility, the newest event that
 * still stands is chosen and the others are coalesced into it; an event the
 * work moved past, that ended, was paused or taken over, or that the user
 * already spoke about is superseded without a model call. The decisions
 * projection is read once, outside the lock; inside, each choice is one
 * IMMEDIATE transaction of minimal reads that creates the message
 * (idempotent by the event's key) and settles the event together, so a crash
 * never starts two. If a message arrived since the projection was read, an
 * invalidated decision waits for the next pass instead of being judged on it.
 *
 * Budget: no follow-up once the automatic turns since the user's last action
 * reach the saved shared turn limit (the event is kept as `exhausted`), and
 * at most `TARS_FOLLOW_UP_WINDOW_CAP` per rolling window; past the cap the
 * events stay pending and `nextWindowAt` says when to look again.
 */
export function admitTarsFollowUps(ports: TarsFollowUpPorts): { created: number; nextWindowAt: string | null } {
  const now = ports.now();
  const settings = ports.conversations.getSettings();
  if (!settings) return { created: 0, nextWindowAt: null };
  let created = 0;
  // Page through every pending event: a page whose events all stopped
  // standing must not hide a valid one behind it. Events a page leaves
  // pending (a re-ask waiting for a fresh projection) are skipped by offset.
  for (let offset = 0; ;) {
    const page = ports.events.listPending(64, offset);
    if (!page.length) return { created, nextWindowAt: null };
    const result = admitPage(ports, page, now, settings.maxTurns);
    created += result.created;
    if (result.nextWindowAt) return { created, nextWindowAt: result.nextWindowAt };
    offset += page.filter((event) => ports.events.get(event.key)?.status === "pending").length;
  }
}

function admitPage(ports: TarsFollowUpPorts, page: readonly TarsEvent[], now: string, maxTurns: number): { created: number; nextWindowAt: string | null } {
  const groups = new Map<string, TarsEvent[]>();
  for (const event of page) groups.set(event.responsibilityId, [...(groups.get(event.responsibilityId) ?? []), event]);
  const newestSeen = ports.conversations.latestId();
  const reaskable = [...groups.values()].flat().some((event) => event.kind === "decisionInvalidated") ? ports.reaskable() : new Map<string, TarsDecisionView>();
  let created = 0;
  for (const [responsibilityId, group] of groups) {
    const deferredUntil = ports.events.write((): string | null => {
      // Read again under the lock: another process may have settled them meanwhile.
      const events = group.map((event) => ports.events.get(event.key)).filter((event): event is TarsEvent => event?.status === "pending");
      if (!events.length) return null;
      const row = ports.responsibilities.get(responsibilityId);
      // A message since the projection (such as a re-ask just created) may change it: judge those decisions next pass.
      const projectionCurrent = ports.conversations.latestId() === newestSeen;
      const stands = new Map(events.map((event) => [event.key, event.kind === "decisionInvalidated"
        ? (projectionCurrent ? reaskable.has(event.episode) : null)
        // Work the user paused or took over is never at the observed state, so it is never followed up.
        : isTarsEventCurrent(event, row) && !ports.events.userSpokeSince(event.createdAt)]));
      const decided = events.filter((event) => stands.get(event.key) !== null);
      // The newest change that still stands; an invalidated decision only when no change of the work itself needs judgment.
      const newest = [...decided].reverse();
      const chosen = newest.find((event) => event.kind !== "decisionInvalidated" && stands.get(event.key))
        ?? newest.find((event) => stands.get(event.key));
      for (const event of decided) if (event !== chosen) ports.events.settle(event.key, stands.get(event.key) ? "coalesced" : "superseded", now);
      if (!chosen) return null;
      const gate = ports.events.gate(now);
      if (gate.usedTurns >= maxTurns) { ports.events.settle(chosen.key, "exhausted", now); return null; }
      if (gate.nextWindowAt) return gate.nextWindowAt;
      let messageId: string;
      if (chosen.kind === "decisionInvalidated") {
        const view = reaskable.get(chosen.episode)!;
        messageId = ports.conversations.create({ requestId: tarsReaskRequestId(view.id), text: TARS_REASK_TEXT }, now, undefined,
          { kind: "reask", decisionId: view.id, reason: view.why === "targetEnded" ? "targetEnded" : "targetMoved", summary: describeTarsDecisionForModel(view) }).id;
      } else {
        const reason = TarsFollowUpReasonSchema.parse(chosen.kind);
        // A stopped stage is phrased by what it waits for: a gate is a next step, not a question to the user.
        const stage = reason === "stageAsksUser" ? row!.stageWait?.kind : undefined;
        messageId = ports.conversations.create({ requestId: tarsFollowUpRequestId(chosen.key), text: stage === "gate" ? STAGE_GATE_TEXT : FOLLOW_UP_TEXT[reason] }, now, undefined,
          { kind: "followUp", eventKey: chosen.key, responsibilityId, reason, observedRevision: chosen.observedRevision, summary: summarize(row!),
            ...(stage ? { stage } : {}) }).id;
      }
      ports.events.settle(chosen.key, "followedUp", now, messageId);
      created++;
      return null;
    });
    // The window is shared: every later event waits for it too.
    if (deferredUntil) return { created, nextWindowAt: deferredUntil };
  }
  return { created, nextWindowAt: null };
}

/** Releases the start of an automatic message that ended before its model call; nothing for the user's own. */
export function releaseTarsFollowUpStart(ports: Pick<TarsFollowUpPorts, "events" | "conversations">, messageId: string): void {
  const message = ports.conversations.get(messageId);
  if (!isAutomatic(message)) return;
  ports.events.releaseStart(messageId, message?.origin?.kind === "followUp" ? message.origin.eventKey : null);
}

/**
 * Right before the planner call: a follow-up whose change no longer stands
 * (the work moved on, was paused, taken over or ended while it waited) is
 * cancelled and its event superseded, so it costs no model call. Returns
 * whether it was. Other messages are left alone.
 */
export function supersedeStaleTarsFollowUp(ports: Pick<TarsFollowUpPorts, "events" | "conversations" | "responsibilities" | "now">, messageId: string): boolean {
  return ports.events.write(() => {
    const message = ports.conversations.get(messageId);
    if (message?.origin?.kind !== "followUp" || (message.state !== "queued" && message.state !== "reasoning")) return false;
    if (isTarsFollowUpCurrent(ports, message.origin.eventKey, message.origin.responsibilityId)) return false;
    const now = ports.now();
    ports.conversations.cancel(message.id, message.revision, now);
    ports.events.supersedeFollowUp(message.origin.eventKey, now);
    return true;
  });
}
