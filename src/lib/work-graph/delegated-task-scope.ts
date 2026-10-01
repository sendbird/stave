import { isActiveDelegatedTaskPhase, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { ledgerNodeKey, type WorkGraph } from "./work-graph.types";

/** Active children survive turns; settled children belong only to the graph that delegated them. */
export function isDelegatedTaskInTurn(child: DelegatedTaskSummary, graph: WorkGraph | null | undefined): boolean {
  const node = graph?.nodesByKey[ledgerNodeKey(child.delegationKey)];
  return isActiveDelegatedTaskPhase(child.phase) || Boolean(
    node && node.delegatedTaskId === child.delegatedTaskId && (node.attempt ?? 0) === child.attempt,
  );
}
