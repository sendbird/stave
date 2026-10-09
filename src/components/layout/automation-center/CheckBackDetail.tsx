import { useTranslation } from "@/i18n";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import { SCHEDULE_STATE_LABEL, type ScheduleRow } from "@/lib/schedule-rows";
import {
  describePullRequestWatchEvents,
  describePullRequestWatchLastCheck,
  describePullRequestWatchTarget,
} from "@/lib/supervision/pull-request-watch-view";
import type { WakeUp } from "@/lib/supervision/wake-up-policy";
import { formatRelativeTime } from "./automation-center.utils";
import { centerStyles } from "./automation-center-view.styles";

/** Detail for a "Check back on a task" schedule: what it says, when, and why it stopped. */
export function CheckBackDetail(props: {
  row: ScheduleRow;
  wakeUp: WakeUp;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
  const { row, wakeUp } = props;
  const status = wakeUp.reasonDetail ? `${SCHEDULE_STATE_LABEL[row.state]} · ${wakeUp.reasonDetail}` : SCHEDULE_STATE_LABEL[row.state];
  return (
    <div className={sx(centerStyles.detailBody)}>
      <div className={sx(centerStyles.detailHeadRow)}>
        <div className={sx(centerStyles.detailHeadText)}>
          <h2 className={sx(centerStyles.detailTitle)}>{row.name}</h2>
          <p className={sx(centerStyles.detailPrompt)}>{wakeUp.prompt}</p>
        </div>
        <div className={sx(centerStyles.detailActions)}>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            onClick={props.onEdit}
            aria-label={tI18n("automation:checkBackDetail.editSchedule")}
            title={tI18n("automation:checkBackDetail.edit")}
          >
            <Pencil className={sx(centerStyles.buttonIcon)} />
          </Button>
        </div>
      </div>
      <dl className={sx(centerStyles.facts)}>
        <Fact label={tI18n("automation:checkBackDetail.status")} value={status} />
        {wakeUp.trigger.kind === "pull_request" ? (
          <>
            <Fact label={tI18n("automation:pullRequestWatch.factWatching")} value={describePullRequestWatchTarget(wakeUp.pullRequestWatch)} />
            <Fact label={tI18n("automation:pullRequestWatch.factEvents")} value={describePullRequestWatchEvents(wakeUp.trigger.events)} />
            <Fact label={tI18n("automation:pullRequestWatch.factLastCheck")} value={describePullRequestWatchLastCheck(wakeUp.pullRequestWatch)} />
            <Fact
              label={tI18n("automation:pullRequestWatch.factWoke")}
              value={
                wakeUp.maxOccurrences
                  ? tI18n("automation:pullRequestWatch.wokeOfCap", { count: wakeUp.occurrenceCount, cap: wakeUp.maxOccurrences })
                  : `${wakeUp.occurrenceCount}×`
              }
            />
          </>
        ) : (
          <>
            {row.cadence ? <Fact label={tI18n("automation:checkBackDetail.when")} value={row.cadence} /> : null}
            {row.nextRunAt || row.nextNote ? (
              <Fact label={tI18n("automation:checkBackDetail.next")} value={row.nextRunAt ? formatRelativeTime(row.nextRunAt) : (row.nextNote ?? "")} />
            ) : null}
            <Fact label={tI18n("automation:checkBackDetail.checked")} value={`${wakeUp.occurrenceCount}×`} />
          </>
        )}
      </dl>
      <div className={sx(centerStyles.footerActions)}>
        {row.toggle ? (
          <Button variant="outline" size="sm" xstyle={centerStyles.headerButton} onClick={props.onToggle} disabled={props.busy}>
            {row.toggle === "pause" ? (
              <>
                <Pause className={sx(centerStyles.buttonIcon)} />
                {tI18n("automation:checkBackDetail.pause")}</>
            ) : (
              <>
                <Play className={sx(centerStyles.buttonIcon)} />
                {tI18n("automation:checkBackDetail.resume")}</>
            )}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" xstyle={centerStyles.deleteButton} onClick={props.onRemove} disabled={props.busy}>
          <Trash2 className={sx(centerStyles.buttonIcon)} />
          {tI18n("automation:checkBackDetail.remove")}</Button>
      </div>
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div className={sx(centerStyles.detail)}>
      <dt className={sx(centerStyles.detailTerm)}>{props.label}</dt>
      <dd title={props.value} className={sx(centerStyles.detailValue)}>
        {props.value}
      </dd>
    </div>
  );
}
