import { i18n, useTranslation } from "@/i18n";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import type { AutomationRun } from "@/lib/automations";
import { automationStyles } from "./automation-center.styles";
import {
  formatDateTime,
  formatRelativeTime,
  formatRunDuration,
  getRunStatusPresentation,
} from "./automation-center.utils";
import { latestRunStyles } from "./automation-latest-run.styles";

export function AutomationLatestRun(props: {
  run: AutomationRun | null;
  onOpenTask: (run: AutomationRun) => void;
  onOpenDetail: (run: AutomationRun) => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
  const { run } = props;
  if (!run) {
    return (
      <section className={sx(latestRunStyles.root)}>
        <h3 className={sx(automationStyles.eyebrow)}>{tI18n("automation:automationLatestRun.latestRun")}</h3>
        <p className={sx(latestRunStyles.emptyCopy)}>
          {tI18n("automation:automationLatestRun.noRunsYetUseRunNowOr")}</p>
      </section>
    );
  }

  const presentation = getRunStatusPresentation(run.status);
  const summary = run.error ?? run.resultPreview;

  return (
    <section className={sx(latestRunStyles.root)}>
      <div className={sx(latestRunStyles.header)}>
        <h3 className={sx(automationStyles.eyebrow)}>{tI18n("automation:automationLatestRun.latestRun")}</h3>
        <Badge
          variant="outline"
          tone={presentation.tone}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          xstyle={automationStyles.statusBadge}
        >
          {presentation.label}
        </Badge>
      </div>

      <div className={sx(latestRunStyles.meta)}>
        <span>{run.trigger === "scheduled" ? tI18n("automation:automationLatestRun.scheduled") : tI18n("automation:automationLatestRun.manual")}</span>
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
            {tI18n("automation:automationLatestRun.openTask")}</Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          xstyle={latestRunStyles.actionButtonQuiet}
          onClick={() => props.onOpenDetail(run)}
        >
          {tI18n("automation:automationLatestRun.openRunDetail")}</Button>
      </div>
    </section>
  );
}
