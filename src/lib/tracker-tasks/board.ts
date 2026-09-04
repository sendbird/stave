import { TRACKER_STATUS_PRESENTATION } from "@/lib/tracker-tasks/presentation";
import {
  TRACKER_STATUS_CATEGORIES,
  type TrackerStatusCategory,
  type TrackerTaskListItem,
} from "@/lib/tracker-tasks/types";

export interface TrackerTaskBoardColumn {
  id: TrackerStatusCategory;
  title: string;
  items: TrackerTaskListItem[];
}

/**
 * Place already-filtered, already-sorted tickets into status columns.
 *
 * Empty columns stay visible so the board shape does not jump when a filter
 * leaves a workflow state vacant. Order inside a column is the incoming sort.
 */
export function groupTrackerTasksForBoard(
  items: readonly TrackerTaskListItem[],
): TrackerTaskBoardColumn[] {
  const byCategory = new Map<TrackerStatusCategory, TrackerTaskListItem[]>(
    TRACKER_STATUS_CATEGORIES.map((category) => [category, []]),
  );
  for (const item of items) {
    byCategory.get(item.task.status.category)?.push(item);
  }
  return TRACKER_STATUS_CATEGORIES.map((category) => ({
    id: category,
    title: TRACKER_STATUS_PRESENTATION[category].label,
    items: byCategory.get(category) ?? [],
  }));
}
