import { Pause, Play } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import {
  SCHEDULE_KIND_LABEL,
  SCHEDULE_STATE_LABEL,
  type ScheduleRow,
} from "@/lib/schedule-rows";
import { formatRelativeTime } from "./automation-center.utils";
import { runToneDotStyles } from "./automation-center.styles";
import { centerStyles } from "./automation-center-view.styles";
import { scheduleRowStyles as styles } from "./schedule-rows.styles";

function nextText(row: ScheduleRow) {
  return row.nextRunAt ? formatRelativeTime(row.nextRunAt) : (row.nextNote ?? "—");
}

/**
 * The Schedules list: one row per schedule, both kinds. Each row carries its
 * own Run now and Pause so the common action never needs the detail pane.
 */
export function ScheduleRows(props: {
  rows: readonly ScheduleRow[];
  selectedKey: string | null;
  busyId: string | null;
  onSelect: (row: ScheduleRow) => void;
  onRunNow: (row: ScheduleRow) => void;
  onToggle: (row: ScheduleRow) => void;
}) {
  return (
    <ul className={sx(styles.list)} aria-label="Schedules">
      {props.rows.map((row) => {
        const active = row.key === props.selectedKey;
        const busy = row.id === props.busyId;
        return (
          <li key={row.key} className={sx(styles.row, active && styles.rowActive)}>
            <AdsButton
              layout="host"
              type="button"
              onClick={() => props.onSelect(row)}
              aria-current={active}
              xstyle={[styles.select, transition.colors]}
            >
              <span className={sx(styles.head)}>
                <span
                  className={sx(
                    centerStyles.automationDot,
                    row.state === "on" ? centerStyles.automationDotOn : centerStyles.automationDotOff,
                  )}
                  aria-hidden="true"
                />
                <span className={sx(styles.name)}>{row.name}</span>
                <span className={sx(styles.state)}>{SCHEDULE_STATE_LABEL[row.state]}</span>
              </span>
              <span className={sx(styles.meta)}>
                <span className={sx(styles.metaText)}>
                  {SCHEDULE_KIND_LABEL[row.kind]} · {row.agent}
                </span>
              </span>
              <span className={sx(styles.meta)}>
                <span className={sx(styles.metaText)}>{row.cadence}</span>
                <span className={sx(styles.metaText)}>
                  <span
                    className={sx(centerStyles.automationDot, styles.resultDot, runToneDotStyles[row.lastResult.tone])}
                    aria-hidden="true"
                  />
                  {row.lastResult.label}
                  {row.lastResult.at ? ` ${formatRelativeTime(row.lastResult.at)}` : ""}
                </span>
                <span className={sx(styles.metaText)}>Next {nextText(row)}</span>
              </span>
            </AdsButton>
            {row.canRunNow ? (
              <Button
                variant="outline"
                size="sm"
                xstyle={styles.action}
                disabled={busy}
                onClick={() => props.onRunNow(row)}
                aria-label={`Run ${row.name} now`}
              >
                <Play className={sx(centerStyles.buttonIcon)} />
                Run now
              </Button>
            ) : null}
            {row.toggle ? (
              <Button
                variant="ghost"
                size="sm"
                xstyle={styles.action}
                disabled={busy}
                onClick={() => props.onToggle(row)}
                aria-label={`${row.toggle === "pause" ? "Pause" : "Resume"} ${row.name}`}
              >
                {row.toggle === "pause" ? (
                  <Pause className={sx(centerStyles.buttonIcon)} />
                ) : (
                  <Play className={sx(centerStyles.buttonIcon)} />
                )}
                {row.toggle === "pause" ? "Pause" : "Resume"}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
