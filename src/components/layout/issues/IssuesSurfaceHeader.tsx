import { i18n, useTranslation } from "@/i18n";
import { ListTodo, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui";
import {
  formatTrackerSyncedAt,
  isTrackerSyncStale,
} from "@/lib/tracker-issues/presentation";
import type { TrackerSourceSummary } from "@/lib/tracker-issues/source-status";
import type { TrackerSourceSyncStatus } from "@/lib/tracker-issues/types";
import { sx } from "@/components/ads/utils/stylex";
import { taskLayoutStyles } from "./issues-layout.stylex";

export interface IssuesSurfaceHeaderProps {
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
export function IssuesSurfaceHeader(props: IssuesSurfaceHeaderProps) {
  const { t: tI18n } = useTranslation(["issues"]);
  const syncing = props.summaries.some(
    (summary) => summary.condition === "syncing",
  );

  return (
    <header className={sx(taskLayoutStyles.header)}>
      <div className={sx(taskLayoutStyles.headerLead)}>
        <div className={sx(taskLayoutStyles.headerTitleRow)}>
          <ListTodo className={sx(taskLayoutStyles.headerIcon)} />
          <h1 className={sx(taskLayoutStyles.headerTitle)}>{tI18n("issues:issuesSurfaceHeader.issues")}</h1>
        </div>
        <p className={sx(taskLayoutStyles.headerStatus)}>
          {props.summaries.map((summary) => {
            const status = statusFor(props.statuses, summary.source);
            return (
              <span
                key={summary.source}
                className={sx(taskLayoutStyles.headerSource)}
              >
                <span className={sx(taskLayoutStyles.headerSourceName)}>
                  {summary.label}
                </span>
                <span>
                  {summary.condition === "producing" ||
                  summary.condition === "syncing"
                    ? status?.syncing
                      ? tI18n("issues:issuesSurfaceHeader.syncing")
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
                  <span className={sx(taskLayoutStyles.headerStale)}>
                    {tI18n("issues:issuesSurfaceHeader.stale")}</span>
                ) : null}
                {status?.truncated ? (
                  <span
                    className={sx(taskLayoutStyles.headerPartial)}
                    title={tI18n("issues:issuesSurfaceHeader.theTrackerHadMoreTicketsThanOne")}
                  >
                    {tI18n("issues:issuesSurfaceHeader.partial")}</span>
                ) : null}
              </span>
            );
          })}
        </p>
      </div>
      <div className={sx(taskLayoutStyles.headerActions)}>
        <Button
          variant="ghost"
          size="sm"
          xstyle={taskLayoutStyles.headerAction}
          onClick={props.onRefresh}
          aria-label={tI18n("issues:issuesSurfaceHeader.refreshTrackerTickets")}
          title={tI18n("issues:issuesSurfaceHeader.refresh")}
        >
          <RefreshCw
            className={sx(
              taskLayoutStyles.icon16,
              (props.refreshing || syncing) && taskLayoutStyles.spinner,
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          xstyle={taskLayoutStyles.headerAction}
          data-testid="close-tasks"
          aria-label={i18n.t("issues:issuesSurfaceHeader.accessibility.closeTasks")}
          title={tI18n("issues:issuesSurfaceHeader.closeIssues")}
          onClick={props.onClose}
        >
          <X className={sx(taskLayoutStyles.icon16)} />
        </Button>
      </div>
    </header>
  );
}
