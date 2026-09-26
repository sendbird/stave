import type { TrackerIssueDetail } from "../../../src/lib/tracker-issues/types";
import type { TrackerIssuesPersistence } from "./persistence";

/**
 * Fold a freshly fetched detail back into the summary cache so the list row and
 * the open detail pane can never show different status or titles.
 *
 * The whole-source rewrite is the only write the façade offers; the caller must
 * run it inside the source queue so it cannot lose a row to a concurrent sweep.
 */
export function applyTrackerDetailToCache(
  persistence: Pick<
    TrackerIssuesPersistence,
    "listTrackerSourceTasks" | "replaceTrackerSourceTasks"
  >,
  detail: TrackerIssueDetail,
  fetchedAt: string,
): void {
  const { description: _description, comments: _comments, ...summary } = detail;
  const tasks = persistence.listTrackerSourceTasks(detail.source);
  const index = tasks.findIndex((task) => task.ref === summary.ref);
  if (index >= 0) {
    tasks[index] = summary;
  } else {
    tasks.push(summary);
  }
  persistence.replaceTrackerSourceTasks(detail.source, tasks, fetchedAt);
}
