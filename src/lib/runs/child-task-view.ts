import {
  CHILD_TASK_DETACHED_REASON,
  describeChildTaskRejection,
  isActiveChildTaskPhase,
  type ChildTaskActionResponse,
  type ChildTaskExpectedIdentity,
  type ChildTaskSummary,
} from "./child-task";

/**
 * The parent surface's half of the child-task vocabulary: how a delegation
 * reads on screen and which identity a control was prepared against. Kept pure
 * and free of React so the wording and the staleness contract can be tested
 * without a renderer, and so both parent surfaces phrase a child the same way.
 */

export type ChildTaskPhaseTone =
  "active" | "waiting" | "done" | "failed" | "released";

export interface ChildTaskPhaseDescription {
  label: string;
  tone: ChildTaskPhaseTone;
  /** True while the child cannot progress without a human answer. */
  blocked: boolean;
}

/**
 * A child stalled on a question or a tool approval. The ledger cannot express
 * this: its phases only describe whether a turn is in flight, so a child sitting
 * on an unanswered approval reads as plain `running` right up until the request
 * auto-denies. The signal therefore comes from the interaction the child raised,
 * not from the delegation record.
 */
export type ChildTaskBlockedKind = "user-input" | "approval";

const BLOCKED_LABEL: Record<ChildTaskBlockedKind, string> = {
  "user-input": "Needs answer",
  approval: "Needs approval",
};

/**
 * Notification kinds a child raises when it is waiting on a person. Keyed by
 * the persisted `AppNotification.kind` so the mapping lives in one place.
 */
const BLOCKED_KIND_BY_NOTIFICATION: Record<string, ChildTaskBlockedKind> = {
  "task.user_input_requested": "user-input",
  "task.approval_requested": "approval",
};

/**
 * Which delegations are currently waiting on a human, keyed by delegation key.
 *
 * Notifications are the input because they are global and durable: a child can
 * be blocked in a workspace the renderer has not loaded, where no message list
 * exists to inspect. Only delegations still in an active phase can be blocked —
 * a settled child's leftover request is history, not an open ask. An unanswered
 * question outranks an unanswered approval because answering it is what unblocks
 * the child first.
 */
export function selectChildTaskBlockedKinds(args: {
  children: readonly ChildTaskSummary[];
  notifications: readonly {
    kind: string;
    taskId?: string | null;
    resolvedAt?: string | null;
  }[];
}): Record<string, ChildTaskBlockedKind> {
  const activeChildren = args.children.filter((child) =>
    isActiveChildTaskPhase(child.phase),
  );
  if (activeChildren.length === 0) {
    return {};
  }
  const blocked: Record<string, ChildTaskBlockedKind> = {};
  for (const notification of args.notifications) {
    if (notification.resolvedAt) {
      continue;
    }
    const kind = BLOCKED_KIND_BY_NOTIFICATION[notification.kind];
    if (!kind || !notification.taskId) {
      continue;
    }
    for (const child of activeChildren) {
      if (child.childTaskId !== notification.taskId) {
        continue;
      }
      if (blocked[child.delegationKey] === "user-input") {
        continue;
      }
      blocked[child.delegationKey] = kind;
    }
  }
  return blocked;
}

/**
 * Stopping and detaching both land the delegation in `cancelled`, but they mean
 * opposite things to the reader: a stop ended the child's work, a detach only
 * ended the parent's claim while the child task carries on. The ledger already
 * records which one happened in the reason, so the row never has to guess.
 *
 * A blocked child overrides the ledger phase outright: "Running" is actively
 * misleading for a child that has been sitting on an unanswered approval, and
 * that request is the only thing the reader can act on.
 */
export function describeChildTaskPhase(
  child: ChildTaskSummary,
  blockedKind?: ChildTaskBlockedKind | null,
): ChildTaskPhaseDescription {
  if (blockedKind && isActiveChildTaskPhase(child.phase)) {
    return {
      label: BLOCKED_LABEL[blockedKind],
      tone: "waiting",
      blocked: true,
    };
  }
  switch (child.phase) {
    case "pending":
      return { label: "Queued", tone: "waiting", blocked: false };
    case "running":
      return { label: "Running", tone: "active", blocked: false };
    case "waiting":
      return { label: "Waiting", tone: "waiting", blocked: false };
    case "completed":
      return { label: "Completed", tone: "done", blocked: false };
    case "failed":
      return { label: "Failed", tone: "failed", blocked: false };
    case "interrupted":
      return { label: "Interrupted", tone: "failed", blocked: false };
    case "cancelled":
      return child.reason === CHILD_TASK_DETACHED_REASON
        ? { label: "Detached", tone: "released", blocked: false }
        : { label: "Stopped", tone: "failed", blocked: false };
  }
}

/**
 * The identity the row was rendered against, sent back with every action so a
 * click prepared against a delegation that has since moved on is refused rather
 * than applied to whatever is there now.
 */
export function buildChildTaskExpectedIdentity(
  child: ChildTaskSummary,
): ChildTaskExpectedIdentity {
  return {
    childTaskId: child.childTaskId,
    childWorkspaceId: child.childWorkspaceId,
    attempt: child.attempt,
    phase: child.phase,
  };
}

const CHILD_TASK_UNKNOWN_REFUSAL =
  "This action was refused. Review the latest child state.";

/**
 * A refusal always carries a sentence the surface can show as-is; the reason
 * code is only a fallback for responses that predate the message field. A
 * control that fails silently is indistinguishable from one that worked.
 */
export function resolveChildTaskActionError(
  response: ChildTaskActionResponse,
): string | null {
  if (response.accepted) {
    return null;
  }
  if (response.message) {
    return response.message;
  }
  return response.reason
    ? describeChildTaskRejection(response.reason)
    : CHILD_TASK_UNKNOWN_REFUSAL;
}

/**
 * Rows are ordered so the delegations a human still has to act on sit at the
 * top, then by most recent movement. Sorting a copy keeps the listing response
 * usable as an immutable snapshot.
 */
export function sortChildTaskRows(
  children: readonly ChildTaskSummary[],
): ChildTaskSummary[] {
  return [...children].sort((left, right) => {
    const byUpdated = right.updatedAt.localeCompare(left.updatedAt);
    return byUpdated !== 0
      ? byUpdated
      : left.delegationKey.localeCompare(right.delegationKey);
  });
}
