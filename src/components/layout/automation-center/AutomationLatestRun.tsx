import { ExternalLink } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { RoutineRun } from "@/lib/routines";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatRelativeTime,
  formatRunDuration,
  getRunStatusPresentation,
} from "./automation-center.utils";

export function AutomationLatestRun(props: {
  run: RoutineRun | null;
  onOpenTask: (run: RoutineRun) => void;
  onOpenDetail: (run: RoutineRun) => void;
}) {
  const { run } = props;
  if (!run) {
    return (
      <section className="rounded-md border border-border/70 p-3">
        <h3 className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          Latest run
        </h3>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          No runs yet. Use Run now, or wait for the next scheduled occurrence.
        </p>
      </section>
    );
  }

  const presentation = getRunStatusPresentation(run.status);
  const summary = run.error ?? run.resultPreview;

  return (
    <section className="rounded-md border border-border/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          Latest run
        </h3>
        <Badge
          variant="outline"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "h-5 shrink-0 px-1.5 text-[9px]",
            presentation.className,
          )}
        >
          {presentation.label}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{run.trigger === "scheduled" ? "Scheduled" : "Manual"}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={run.startedAt} title={formatDateTime(run.startedAt)}>
          {formatRelativeTime(run.startedAt)}
        </time>
        <span aria-hidden="true">·</span>
        <span>{formatRunDuration(run)}</span>
      </div>

      {summary ? (
        <p
          title={summary}
          className={cn(
            "mt-2 line-clamp-2 text-[11px] leading-5",
            run.error ? "text-destructive" : "text-foreground",
          )}
        >
          {summary}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {run.taskId ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => props.onOpenTask(run)}
          >
            <ExternalLink className="size-3.5" />
            Open task
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={() => props.onOpenDetail(run)}
        >
          Open run detail
        </Button>
      </div>
    </section>
  );
}
