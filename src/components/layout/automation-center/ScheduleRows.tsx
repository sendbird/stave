import { i18n, useTranslation } from "@/i18n";
import { Pause, Play } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import {
  SCHEDULE_STATE_LABEL,
  type ScheduleRow,
} from "@/lib/schedule-rows";
import { formatRelativeTime } from "./automation-center.utils";
import { runToneDotStyles } from "./automation-center.styles";
import { centerStyles } from "./automation-center-view.styles";
import { scheduleRowStyles as styles } from "./schedule-rows.styles";

function toggleLabel(row: ScheduleRow) {
  return row.toggle === "pause" ? i18n.t("automation:scheduleRows.pause") : row.kind === "start" ? i18n.t("automation:scheduleRows.turnOn") : i18n.t("automation:scheduleRows.resume");
}

function nextText(row: ScheduleRow) {
  return row.nextRunAt ? i18n.t("automation:scheduleRows.nextValue", { value1: formatRelativeTime(row.nextRunAt) }) : (row.nextNote ?? "");
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
  const { t: tI18n } = useTranslation(["automation"]);
  return (
    <ul className={sx(styles.list)} aria-label={tI18n("automation:scheduleRows.schedules")}>
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
                  {row.kindLabel} · {row.agent}
                </span>
              </span>
              <span className={sx(styles.meta)}>
                {row.cadence ? <span className={sx(styles.metaText)}>{row.cadence}</span> : null}
                <span className={sx(styles.metaText)}>
                  <span
                    className={sx(centerStyles.automationDot, styles.resultDot, runToneDotStyles[row.lastResult.tone])}
                    aria-hidden="true"
                  />
                  {row.lastResult.label}
                  {row.lastResult.at ? ` ${formatRelativeTime(row.lastResult.at)}` : ""}
                </span>
                {nextText(row) ? <span className={sx(styles.metaText)}>{nextText(row)}</span> : null}
              </span>
            </AdsButton>
            <span className={sx(styles.actions)}>
            {row.canRunNow ? (
              <Button
                variant="outline"
                size="sm"
                xstyle={styles.action}
                disabled={busy}
                onClick={() => props.onRunNow(row)}
                aria-label={tI18n("automation:scheduleRows.runValueNow", { value1: row.name })}
              >
                <Play className={sx(centerStyles.buttonIcon)} />
                {tI18n("automation:scheduleRows.runNow")}</Button>
            ) : null}
            {row.toggle ? (
              <Button
                variant="ghost"
                size="sm"
                xstyle={styles.action}
                disabled={busy}
                onClick={() => props.onToggle(row)}
                aria-label={`${toggleLabel(row)} ${row.name}`}
              >
                {row.toggle === "pause" ? (
                  <Pause className={sx(centerStyles.buttonIcon)} />
                ) : (
                  <Play className={sx(centerStyles.buttonIcon)} />
                )}
                {toggleLabel(row)}
              </Button>
            ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
