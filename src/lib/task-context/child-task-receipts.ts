import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import {
  isActiveChildTaskPhase,
  type ChildTaskSummary,
} from "@/lib/runs/child-task";

const MAX_RENDERED_CHILDREN = 20;

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/**
 * The parent's view of what it delegated: who the child is, what phase it is in
 * and why it ended. The child's transcript is deliberately absent — a parent
 * that wants the conversation opens the child task, and a receipt that carried
 * output would make the ledger a second, unbounded message store.
 */
export function buildChildTaskReceiptsRetrievedContext(args: {
  children: ChildTaskSummary[];
}): CanonicalRetrievedContextPart | null {
  if (args.children.length === 0) {
    return null;
  }
  const ordered = [...args.children].sort((left, right) => {
    const leftActive = isActiveChildTaskPhase(left.phase) ? 0 : 1;
    const rightActive = isActiveChildTaskPhase(right.phase) ? 0 : 1;
    return (
      leftActive - rightActive || right.updatedAt.localeCompare(left.updatedAt)
    );
  });
  const rendered = ordered.slice(0, MAX_RENDERED_CHILDREN);
  const lines = rendered.flatMap((child) => {
    const head = [
      `- delegation: ${child.delegationKey}`,
      `phase: ${child.phase}`,
      `lifecycle: ${child.lifecycle}`,
      `provider: ${child.providerId}`,
    ].join(" | ");
    const identity = `  child task: ${child.childTaskId} in workspace ${child.childWorkspaceId}`;
    const reason = child.reason
      ? [`  reason: ${truncate(child.reason, 300)}`]
      : [];
    return [head, identity, ...reason];
  });
  const omitted = ordered.length - rendered.length;

  return {
    type: "retrieved_context",
    sourceId: "stave:child-tasks",
    title: "Delegated Child Tasks",
    content: [
      "Child tasks this task delegated, as recorded on the run ledger.",
      "Identity, phase and reason only — a child's transcript is never included here.",
      "Use `stave_list_child_tasks` for a fresh read and `stave_stop_child_task` to stop one.",
      "",
      ...lines,
      ...(omitted > 0 ? ["", `(${omitted} older delegations omitted)`] : []),
    ].join("\n"),
  };
}
