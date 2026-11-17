import type { DelegatedTaskList, DelegatedTaskSummary } from "@/lib/runs/delegated-task";
/** Read the whole delegation tree once, so nested work is counted once. */
export async function previewFleetChildren(parentIds: readonly string[], list: (parentTaskId: string) => Promise<DelegatedTaskList>) {
  const visited = new Set<string>();
  const children = new Map<string, DelegatedTaskSummary>();
  const parentsWithChildren = new Set<string>();
  async function visit(parentTaskId: string): Promise<boolean> {
    if (visited.has(parentTaskId)) return false;
    visited.add(parentTaskId);
    const rows = await list(parentTaskId);
    let active = false;
    for (const child of rows) {
      if (["completed", "cancelled", "failed", "interrupted"].includes(child.phase)) continue;
      active = true;
      children.set(child.delegatedTaskId, child);
      await visit(child.delegatedTaskId);
    }
    if (active) parentsWithChildren.add(parentTaskId);
    return active;
  }
  for (const parent of parentIds) await visit(parent);
  return { children: [...children.values()], parentsWithChildren };
}
