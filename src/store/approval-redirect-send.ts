import { i18n } from "@/i18n/runtime";
import type {
  ApprovalAnswerOutcome,
  SendUserMessageResult,
} from "@/store/app-store.types";

/** One approval request still waiting for an answer. */
export interface PendingApprovalTarget {
  messageId: string;
  requestId: string;
}

/** How a composer send reaches the agent while approvals are pending. */
export type ApprovalRedirectMode = "steer" | "queue";

/**
 * Whether the composer stays usable while approvals are pending, and how its
 * message reaches the agent. Only a running turn can be redirected: its
 * approvals are declined and the message is steered into it when the provider
 * of that turn can take one now, otherwise queued for the next turn. A
 * blocking question keeps its own card and owns the composer.
 */
export function resolveApprovalRedirectMode(args: {
  pendingApprovalCount: number;
  blockingUserInputPending: boolean;
  isTurnActive: boolean;
  canSteerRunningTurn: boolean;
}): ApprovalRedirectMode | null {
  if (
    args.pendingApprovalCount === 0 ||
    args.blockingUserInputPending ||
    !args.isTurnActive
  ) {
    return null;
  }
  return args.canSteerRunningTurn ? "steer" : "queue";
}

/**
 * How a send that redirects pending approvals ended.
 *
 * - `delivered`: every pending approval was declined (or skipped because the
 *   provider could no longer answer it) and the message was steered, queued
 *   or started.
 * - `decline-failed`: an approval could not be declined. Nothing was sent.
 * - `draft-changed`: the composer text changed while approvals were being
 *   declined, so the older text was not sent.
 * - `delivery-unknown`: the steer may still land; sending again could
 *   deliver it twice.
 * - `parked`: the message never reached the provider and now sits on a failed
 *   outgoing bubble.
 * - `not-sent`: the send path refused the message. When it refused before
 *   declining, the approvals are untouched.
 * - `turn-stopped`: the user stopped the turn this redirect targeted while it
 *   was declining or steering. Nothing was sent; the draft stays.
 */
export type ApprovalRedirectOutcome =
  | { kind: "delivered"; via: "steered" | "queued" | "started" | "run-started" }
  | { kind: "decline-failed"; message: string }
  | { kind: "draft-changed" }
  | { kind: "delivery-unknown"; message: string }
  | { kind: "parked"; message: string }
  | { kind: "not-sent"; result: SendUserMessageResult }
  | { kind: "turn-stopped" };

/**
 * The most approvals one redirect declines. Approvals that keep arriving past
 * this many are left pending, and the redirect reports them instead of
 * declining forever.
 */
const MAX_REDIRECT_DECLINES = 32;

/**
 * Decline every pending approval, one at a time, and stop at the first one that
 * fails. The list is read again after each decline, so an approval that
 * arrives meanwhile (a parallel tool call, a helper) is declined too. A request
 * the provider can no longer answer is skipped (the caller's `decline` closes
 * it), so it never blocks the redirect. Each request is declined at most once;
 * one that is still pending afterwards fails the redirect, so nothing is sent
 * while an approval waits.
 */
export async function declinePendingApprovals(args: {
  readPendingApprovals: () => readonly PendingApprovalTarget[];
  decline: (approval: PendingApprovalTarget) => Promise<ApprovalAnswerOutcome>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const attempted = new Set<string>();
  while (attempted.size < MAX_REDIRECT_DECLINES) {
    const approval = args
      .readPendingApprovals()
      .find(({ requestId }) => !attempted.has(requestId));
    if (!approval) {
      break;
    }
    attempted.add(approval.requestId);
    const outcome = await args.decline(approval);
    if (outcome.status === "failed") {
      return { ok: false, message: outcome.message };
    }
  }
  if (args.readPendingApprovals().length > 0) {
    return {
      ok: false,
      message: i18n.t("notifications:approvalAnswer.stillPendingAfterDecline"),
    };
  }
  return { ok: true };
}

/**
 * Send a message that redirects the agent away from its pending approvals:
 * decline them, then deliver the message into the same turn.
 *
 * With `preferSteer`, the send path calls back to decline only after it has
 * checked everything else it needs to steer, so a message it refuses leaves
 * the approvals alone. When steering is not possible (provider, setting,
 * attachments, or the turn stopped accepting it) the approvals are declined
 * and the message is queued for the next turn instead — never dropped.
 */
export async function sendWithApprovalRedirect(args: {
  preferSteer: boolean;
  readPendingApprovals: () => readonly PendingApprovalTarget[];
  decline: (approval: PendingApprovalTarget) => Promise<ApprovalAnswerOutcome>;
  /** Whether the composer still holds the text being sent. */
  isDraftCurrent: () => boolean;
  /**
   * Whether the user stopped the turn this redirect targets. A stop cancels
   * the redirect; a turn that ended on its own still gets the message as the
   * next turn.
   */
  isTargetTurnStopped: () => boolean;
  /**
   * Why the send path would refuse to queue this message, checked before the
   * approvals are declined for a queued delivery; `null` when it would not.
   */
  queueRefusal?: () => Extract<SendUserMessageResult, { status: "blocked" }> | null;
  send: (request: {
    intent: "steer" | "queue";
    declinePendingApprovals?: () => Promise<boolean>;
  }) => Promise<SendUserMessageResult>;
}): Promise<ApprovalRedirectOutcome> {
  const gate: { stop: ApprovalRedirectOutcome | null } = { stop: null };
  const declineThenConfirmDraft = async () => {
    gate.stop = null;
    const declined = await declinePendingApprovals(args);
    if (args.isTargetTurnStopped()) {
      gate.stop = { kind: "turn-stopped" };
      return false;
    }
    if (!declined.ok) {
      gate.stop = { kind: "decline-failed", message: declined.message };
      return false;
    }
    if (!args.isDraftCurrent()) {
      gate.stop = { kind: "draft-changed" };
      return false;
    }
    return true;
  };

  if (args.preferSteer) {
    const result = await args.send({
      intent: "steer",
      declinePendingApprovals: declineThenConfirmDraft,
    });
    if (gate.stop) {
      return gate.stop;
    }
    if (result.status !== "steer-unavailable") {
      return toRedirectOutcome(result);
    }
  }
  const refusal = args.queueRefusal?.() ?? null;
  if (refusal) {
    return { kind: "not-sent", result: refusal };
  }
  if (!(await declineThenConfirmDraft())) {
    return gate.stop ?? { kind: "draft-changed" };
  }
  return toRedirectOutcome(await args.send({ intent: "queue" }));
}

function toRedirectOutcome(
  result: SendUserMessageResult,
): ApprovalRedirectOutcome {
  switch (result.status) {
    case "steered":
    case "queued":
    case "started":
    case "run-started":
      return { kind: "delivered", via: result.status };
    case "steer-delivery-unknown":
      return { kind: "delivery-unknown", message: result.message };
    case "send-failed":
      return { kind: "parked", message: result.message };
    case "blocked":
    case "steer-unavailable":
      return { kind: "not-sent", result };
  }
}
