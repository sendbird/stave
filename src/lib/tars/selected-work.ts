import { z } from "zod";
import type { TarsDecisionAction } from "./conversation";
import type { TarsResponsibility } from "./types";

/** Identity only: neither a display title nor a stale revision is routing authority. */
export const TarsWorkTargetSchema = z.object({ responsibilityId: z.string().trim().min(1).max(256) }).strict();
export const TarsSelectionReasonSchema = z.enum(["targetMismatch", "targetUnavailable"]);
export type TarsSelectionReason = z.infer<typeof TarsSelectionReasonSchema>;
export type TarsWorkTarget = z.infer<typeof TarsWorkTargetSchema>;

/** The selected work as admission reads it: its identity and where its execution lives. */
export type TarsSelectedWork = Pick<TarsResponsibility, "id" | "taskId" | "executionWorkspaceId">;

/**
 * Whether an action stays on the selected work. New work, clearing and batch
 * operations beyond that one item reach past it, so they never do.
 * `withdrawn` is the earlier decision a withdraw would close.
 */
function staysOnSelectedWork(action: TarsDecisionAction, work: TarsSelectedWork, withdrawn: TarsDecisionAction | null): boolean {
  switch (action.kind) {
    case "bulkControl": case "cleanup":
      return action.scope.kind === "ids" && action.scope.ids.every((id) => id === work.id);
    case "control": case "show": case "inspect": case "publish": case "reprioritize":
      return action.responsibilityId === work.id;
    case "ask":
      return action.options.every(({ effect }) => effect.kind === "reply" || effect.responsibilityId === work.id);
    case "open":
      return action.target === "task" ? action.id === work.taskId : action.target === "workspace" && action.id === work.executionWorkspaceId;
    case "workspace":
      return action.workspaceId === work.executionWorkspaceId;
    case "withdraw":
      return withdrawn !== null && withdrawn.kind !== "withdraw" && staysOnSelectedWork(withdrawn, work, null);
    case "delegate": case "clear":
      return false;
  }
}

/**
 * A selection narrows routing to one existing work item; it never grants an
 * action or creates replacement work. A selected message whose work is gone,
 * or an action that leaves it, is refused with a translated reason.
 */
export function tarsSelectedWorkRefusal(target: TarsWorkTarget | undefined, action: TarsDecisionAction,
  work: TarsSelectedWork | null | undefined, withdrawn: TarsDecisionAction | null = null): { reason: TarsSelectionReason; error: string } | null {
  if (!target) return null;
  if (!work || work.id !== target.responsibilityId)
    // i18n-ignore: host diagnostic; the UI renders the translated targetUnavailable reason
    return { reason: "targetUnavailable", error: "The selected work is unavailable. Select an existing work item before acting." };
  if (staysOnSelectedWork(action, work, withdrawn)) return null;
  // i18n-ignore: host diagnostic; the UI renders the translated targetMismatch reason
  if (action.kind === "ask") return { reason: "targetMismatch", error: "A question cannot act on work other than the selected target." };
  // i18n-ignore: host diagnostic; the UI renders the translated targetMismatch reason
  return { reason: "targetMismatch", error: "This message targets existing work. Select the intended work or clear the selection; it cannot create new work or act on another target." };
}
