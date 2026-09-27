import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import {
  isActiveDelegatedTaskPhase,
  type DelegatedTaskSummary,
} from "@/lib/runs/delegated-task";

const MAX_RENDERED_CHILDREN = 20;

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/**
 * The parent's view of what it delegated: who the child is, what phase it is in
 * and why it ended. The child's transcript is deliberately absent — a parent
 * that wants the conversation opens the delegated task, and a receipt that carried
 * output would make the ledger a second, unbounded message store.
 */
export function buildDelegatedTaskReceiptsRetrievedContext(args: {
  children: DelegatedTaskSummary[];
}): CanonicalRetrievedContextPart | null {
  if (args.children.length === 0) {
    return null;
  }
  const ordered = [...args.children].sort((left, right) => {
    const leftActive = isActiveDelegatedTaskPhase(left.phase) ? 0 : 1;
    const rightActive = isActiveDelegatedTaskPhase(right.phase) ? 0 : 1;
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
    const identity = `  delegated task: ${child.delegatedTaskId} in workspace ${child.delegatedWorkspaceId}`;
    const reason = child.reason
      ? [`  reason: ${truncate(child.reason, 300)}`]
      : [];
    return [head, identity, ...reason];
  });
  const omitted = ordered.length - rendered.length;

  return {
    type: "retrieved_context",
    sourceId: "stave:delegated-tasks",
    title: "Delegated Delegated Tasks",
    content: [
      "Delegated tasks this task delegated, as recorded on the run ledger.",
      "Identity, phase and reason only — a child's transcript is never included here.",
      "Use `stave_list_delegated_tasks` for a fresh read and `stave_stop_delegated_task` to stop one.",
      "Read `stave_get_task` with the delegated task and workspace ids to collect its latest answer. Use `stave_follow_up_delegated_task` with the fresh expected identity to request clarification or further work. Review results before reporting the parent complete.",
      "",
      ...lines,
      ...(omitted > 0 ? ["", `(${omitted} older delegations omitted)`] : []),
    ].join("\n"),
  };
}
