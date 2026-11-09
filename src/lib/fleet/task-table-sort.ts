import { getIntlLocale } from "@/i18n/runtime";
import { FLEET_ATTENTION_KIND_LABEL } from "./fleet-vocabulary";
import { FLEET_TASK_STATUS_PRIORITY } from "./task-status";
import type { FleetTaskRow } from "./task-rows";
import { FLEET_TASK_OWNER_LABEL, type FleetTaskOwner } from "./task-owner";

/** The Fleet table's columns that order its rows. */
export type FleetTaskSortKey = "task" | "owner" | "workspace" | "state" | "needs" | "waiting" | "activity";

interface FleetTaskSortOptions {
  nowMs: number;
  untitled: string;
  /** The row's owner; unknown owners sort last. */
  ownerOf?: (row: FleetTaskRow) => FleetTaskOwner | null | undefined;
}
export type FleetTaskSortDirection = "ascending" | "descending";
/** Null is the table's own order: the Work queue's lanes, longest wait first. */
export type FleetTaskSort = { key: FleetTaskSortKey; direction: FleetTaskSortDirection } | null;

/**
 * A header press: an unsorted column sorts ascending, then descending, then
 * gives the rows back to the table's own order.
 */
export function nextFleetTaskSort(current: FleetTaskSort, key: FleetTaskSortKey): FleetTaskSort {
  if (!current || current.key !== key) return { key, direction: "ascending" };
  return current.direction === "ascending" ? { key, direction: "descending" } : null;
}

type SortValue = string | number | null;

/** What a column orders by. Null is a missing value: it sorts after every value in both directions. */
function sortValue(row: FleetTaskRow, key: FleetTaskSortKey, options: FleetTaskSortOptions): SortValue {
  const { nowMs, untitled } = options;
  switch (key) {
    case "task": return row.task.title || untitled;
    case "owner": {
      const owner = options.ownerOf?.(row);
      return owner ? FLEET_TASK_OWNER_LABEL[owner] : null;
    }
    case "workspace": return `${row.workspaceName}\u0000${row.repositoryName}`;
    case "state": return row.status === "unknown" ? null : FLEET_TASK_STATUS_PRIORITY[row.status];
    case "needs": return row.need ? FLEET_ATTENTION_KIND_LABEL[row.need.kind] : null;
    case "waiting": {
      const since = row.waitingSince ? Date.parse(row.waitingSince) : Number.NaN;
      return Number.isFinite(since) ? nowMs - since : null;
    }
    case "activity": {
      const at = Date.parse(row.task.updatedAt);
      return Number.isFinite(at) ? at : null;
    }
  }
}

/**
 * Rows in a column's order. Stable: rows that tie keep the table's own order
 * between them, so sorting by State keeps each state's longest wait first.
 * Text compares in the display language, numbers by value.
 */
export function sortFleetTaskRows(rows: readonly FleetTaskRow[], sort: FleetTaskSort, options: FleetTaskSortOptions): readonly FleetTaskRow[] {
  if (!sort) return rows;
  const collator = new Intl.Collator(getIntlLocale(), { numeric: true, sensitivity: "base" });
  const sign = sort.direction === "ascending" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, sort.key, options) }))
    .sort((left, right) => {
      if (left.value === null || right.value === null) {
        if (left.value === right.value) return left.index - right.index;
        return left.value === null ? 1 : -1;
      }
      const order = typeof left.value === "number" && typeof right.value === "number"
        ? left.value - right.value
        : collator.compare(String(left.value), String(right.value));
      return order === 0 ? left.index - right.index : order * sign;
    })
    .map((entry) => entry.row);
}
