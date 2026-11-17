import type { TarsOpenAction } from "../../src/lib/tars/open";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import { resolveTarsWorkspace } from "../main/tars-scope";

/** Read-only admission. No work, permission, run or scheduler changes accompany navigation. */
export function admitTarsOpen(action: TarsOpenAction, registry: PersistenceRepositoryRegistryEntry[], rows: readonly TarsResponsibility[]): string | null {
  if (action.target === "activity" || action.target === "fleet") return null;
  if (action.target === "workspace") {
    try { resolveTarsWorkspace(action.id!, registry); return null; }
    catch { return "The workspace is missing or ambiguous in the current registry."; }
  }
  const matches = rows.filter((row) => row.taskId === action.id);
  return matches.length === 1 ? null : "The task is missing or ambiguous among the user's Tars work.";
}
