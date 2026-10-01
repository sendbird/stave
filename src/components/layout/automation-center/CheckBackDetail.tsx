import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import type { ScheduleRow } from "@/lib/schedule-rows";
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
  const { row, wakeUp } = props;
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
            aria-label="Edit schedule"
            title="Edit"
          >
            <Pencil className={sx(centerStyles.buttonIcon)} />
          </Button>
        </div>
      </div>
      <dl className={sx(centerStyles.facts)}>
        <Fact label="Status" value={wakeUp.reasonDetail ? `${row.state} · ${wakeUp.reasonDetail}` : row.state} />
        <Fact label="When" value={row.cadence} />
        <Fact label="Next" value={row.nextRunAt ? formatRelativeTime(row.nextRunAt) : (row.nextNote ?? "—")} />
        <Fact label="Checked" value={`${wakeUp.occurrenceCount}×`} />
      </dl>
      <div className={sx(centerStyles.footerActions)}>
        {row.toggle ? (
          <Button variant="outline" size="sm" xstyle={centerStyles.headerButton} onClick={props.onToggle} disabled={props.busy}>
            {row.toggle === "pause" ? (
              <>
                <Pause className={sx(centerStyles.buttonIcon)} />
                Pause
              </>
            ) : (
              <>
                <Play className={sx(centerStyles.buttonIcon)} />
                Resume
              </>
            )}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" xstyle={centerStyles.deleteButton} onClick={props.onRemove} disabled={props.busy}>
          <Trash2 className={sx(centerStyles.buttonIcon)} />
          Remove
        </Button>
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
