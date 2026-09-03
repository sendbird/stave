import { ListTodo, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui";
import {
  formatTrackerSyncedAt,
  isTrackerSyncStale,
} from "@/lib/tracker-tasks/presentation";
import type { TrackerSourceSyncStatus } from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";
import { TRACKER_SOURCE_LABELS } from "./tracker-task-ui";

export interface TasksSurfaceHeaderProps {
  /** Only the sources that can currently produce rows. */
  readyStatuses: readonly TrackerSourceSyncStatus[];
  refreshIntervalSeconds: number;
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

/**
 * The surface header: what the list is, how fresh each source is, and the two
 * controls that always apply.
 *
 * The sync line is coarse on purpose — a second-accurate counter would re-render
 * the header every tick to report something the user cannot act on.
 */
export function TasksSurfaceHeader(props: TasksSurfaceHeaderProps) {
  const syncing = props.readyStatuses.some((status) => status.syncing);

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
          {props.readyStatuses.length === 0
            ? "Tracker tickets assigned to you, ready to kick off locally."
            : props.readyStatuses.map((status) => (
                <span
                  key={status.source}
                  className="inline-flex items-center gap-1"
                >
                  <span className="font-medium text-foreground">
                    {TRACKER_SOURCE_LABELS[status.source]}
                  </span>
                  <span>
                    {status.syncing
                      ? "syncing…"
                      : formatTrackerSyncedAt(status.lastSyncedAt, props.now)}
                  </span>
                  {isTrackerSyncStale(
                    status,
                    props.refreshIntervalSeconds,
                    props.now,
                  ) ? (
                    <span className="rounded-full border border-warning/40 bg-warning/10 px-1 text-[10px] text-warning">
                      stale
                    </span>
                  ) : null}
                  {status.truncated ? (
                    <span
                      className="rounded-full border border-border px-1 text-[10px]"
                      title="The tracker had more tickets than one page allows."
                    >
                      partial
                    </span>
                  ) : null}
                </span>
              ))}
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
