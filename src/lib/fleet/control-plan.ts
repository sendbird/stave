import type { FleetSelectionTarget } from "@/store/fleet-selection-store";
import { isTaskManaged } from "@/lib/tasks";
export type FleetControlOperation = "stop" | "archive" | "delete";
export interface FleetControlFacts { running: ReadonlySet<string>; waiting: ReadonlySet<string> }
export function planFleetControl(operation: FleetControlOperation, targets: readonly FleetSelectionTarget[], facts: FleetControlFacts) {
  const applicable: FleetSelectionTarget[] = [];
  const skipped: { item: FleetSelectionTarget; reason: string }[] = [];
  for (const item of targets) {
    const live = Boolean(item.activeTurnId) || facts.running.has(item.key);
    const waiting = facts.waiting.has(item.key);
    const reason = operation === "stop" ? (live ? null : "no-running-work")
      : isTaskManaged(item.task ?? null) ? "protected"
      : live ? "live-work"
      : waiting ? "waiting"
      : operation === "delete" ? (!item.task?.archivedAt ? "not-archived" : null)
      : item.task?.archivedAt ? "changed" : null;
    if (reason) skipped.push({ item, reason }); else applicable.push(item);
  }
  return { applicable, skipped };
}
