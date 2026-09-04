import { ListTodo, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui";
import {
  formatTrackerSyncedAt,
  isTrackerSyncStale,
} from "@/lib/tracker-tasks/presentation";
import type { TrackerSourceSummary } from "@/lib/tracker-tasks/source-status";
import type { TrackerSourceSyncStatus } from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";

export interface TasksSurfaceHeaderProps {
  summaries: readonly TrackerSourceSummary[];
  statuses: readonly TrackerSourceSyncStatus[];
  refreshIntervalSeconds: number;
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

function statusFor(
  statuses: readonly TrackerSourceSyncStatus[],
  source: TrackerSourceSummary["source"],
) {
  return statuses.find((status) => status.source === source) ?? null;
}

/**
 * The surface header: what the list is, how each tracker is connected, and the
 * two controls that always apply.
 *
 * Connection state belongs here, not only in an empty-state banner. A paired
 * Crane that is failing to sync used to look like a healthy header with a
 * mysteriously empty list.
 */
export function TasksSurfaceHeader(props: TasksSurfaceHeaderProps) {
  const syncing = props.summaries.some(
    (summary) => summary.condition === "syncing",
  );

  return (
    <header className="flex min-h-18 shrink-0 items-center justify-between gap-4 border-b border-border/65 bg-[linear-gradient(110deg,color-mix(in_oklch,var(--surface)_92%,var(--background)),var(--background))] px-5 py-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <ListTodo className="size-4.5 shrink-0 text-primary" />
          <h1 className="font-heading truncate text-base font-semibold tracking-[-0.01em] text-foreground">
            Tasks
          </h1>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {props.summaries.map((summary) => {
            const status = statusFor(props.statuses, summary.source);
            return (
              <span
                key={summary.source}
                className="inline-flex items-center gap-1"
              >
                <span className="font-medium text-foreground">
                  {summary.label}
                </span>
                <span>
                  {summary.condition === "producing" ||
                  summary.condition === "syncing"
                    ? status?.syncing
                      ? "syncing…"
                      : formatTrackerSyncedAt(
                          status?.lastSyncedAt ?? summary.lastSyncedAt,
                          props.now,
                        )
                    : summary.headline.toLowerCase()}
                </span>
                {status &&
                isTrackerSyncStale(
                  status,
                  props.refreshIntervalSeconds,
                  props.now,
                ) ? (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-1.5 text-xs text-warning">
                    stale
                  </span>
                ) : null}
                {status?.truncated ? (
                  <span
                    className="rounded-full border border-border px-1.5 text-xs"
                    title="The tracker had more tickets than one refresh can load."
                  >
                    partial
                  </span>
                ) : null}
              </span>
            );
          })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={props.onRefresh}
          aria-label="Refresh tracker tickets"
          title="Refresh"
        >
          <RefreshCw
            className={cn(
              "size-4",
              (props.refreshing || syncing) && "animate-spin",
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="close-tasks"
          title="Close Tasks"
          onClick={props.onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}
