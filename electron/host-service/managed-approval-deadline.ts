import { earlierApprovalDeadline } from "../../src/lib/approvals/approval-expiry";
import { MANAGED_TASK_APPROVAL_TIMEOUT_MS } from "../../src/lib/providers/managed-task-runtime";
import { isExternallyManagedTask } from "../../src/lib/tasks";
import type { Task } from "../../src/types/chat";
import type { BridgeEvent } from "../providers/types";

/**
 * A delegated task's host denies an unanswered approval (the managed auto-deny
 * in local-mcp-runtime) before the
 * runtime's own timer would, so the request carries the deadline that
 * actually applies and its card does not promise a later one.
 */
export function withManagedApprovalDeadline(
  event: BridgeEvent,
  task: Pick<Task, "controlMode" | "controlOwner"> | null | undefined,
): BridgeEvent {
  if (event.type !== "approval" || !isExternallyManagedTask(task)) {
    return event;
  }
  const expiresAt = earlierApprovalDeadline({
    expiresAt: event.expiresAt,
    timeoutMs: MANAGED_TASK_APPROVAL_TIMEOUT_MS,
  });
  return expiresAt ? { ...event, expiresAt } : event;
}
