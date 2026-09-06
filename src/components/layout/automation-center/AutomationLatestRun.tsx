import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import type { RoutineRun } from "@/lib/routines";
import { automationStyles } from "./automation-center.styles";
import {
  formatDateTime,
  formatRelativeTime,
  formatRunDuration,
  getRunStatusPresentation,
} from "./automation-center.utils";
import { latestRunStyles } from "./automation-latest-run.styles";

export function AutomationLatestRun(props: {
  run: RoutineRun | null;
  onOpenTask: (run: RoutineRun) => void;
  onOpenDetail: (run: RoutineRun) => void;
}) {
  const { run } = props;
  if (!run) {
    return (
      <section className={sx(latestRunStyles.root)}>
        <h3 className={sx(automationStyles.eyebrow)}>Latest run</h3>
        <p className={sx(latestRunStyles.emptyCopy)}>
          No runs yet. Use Run now, or wait for the next scheduled occurrence.
        </p>
      </section>
    );
  }

  const presentation = getRunStatusPresentation(run.status);
  const summary = run.error ?? run.resultPreview;

  return (
    <section className={sx(latestRunStyles.root)}>
      <div className={sx(latestRunStyles.header)}>
        <h3 className={sx(automationStyles.eyebrow)}>Latest run</h3>
        <Badge
          variant="outline"
          tone={presentation.tone}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={sx(automationStyles.statusBadge)}
        >
          {presentation.label}
        </Badge>
      </div>

      <div className={sx(latestRunStyles.meta)}>
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
          className={sx(
            latestRunStyles.summary,
            run.error
              ? latestRunStyles.summaryError
              : latestRunStyles.summaryDefault,
          )}
        >
          {summary}
        </p>
      ) : null}

      <div className={sx(latestRunStyles.actions)}>
        {run.taskId ? (
          <Button
            variant="outline"
            size="sm"
            xstyle={latestRunStyles.actionButton}
            onClick={() => props.onOpenTask(run)}
          >
            <ExternalLink className={sx(latestRunStyles.actionIcon)} />
            Open task
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          xstyle={latestRunStyles.actionButtonQuiet}
          onClick={() => props.onOpenDetail(run)}
        >
          Open run detail
        </Button>
      </div>
    </section>
  );
}
