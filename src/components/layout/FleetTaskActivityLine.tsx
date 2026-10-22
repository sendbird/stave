import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import type { FleetDisplayStatus } from "@/lib/fleet/task-status";
import {
  buildTaskActivityLine,
  describeLastActivity,
  formatActivityDuration,
} from "@/lib/fleet/task-activity-line";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";

/** Live rows re-read the clock this often; settled rows never tick. */
const ACTIVITY_CLOCK_MS = 5_000;

/** The span that matters for a status: how long it ran, waited or went quiet. */
function describeStatusDuration(
  status: FleetDisplayStatus,
  line: NonNullable<ReturnType<typeof buildTaskActivityLine>>,
) {
  if (status === "stalled") {
    return line.quietMs === null
      ? null
      : i18n.t("fleet:taskActivity.quiet", {
          duration: formatActivityDuration(line.quietMs),
        });
  }
  if (status === "waiting-input" || status === "waiting-approval") {
    return line.waitingMs === null
      ? null
      : i18n.t("fleet:taskActivity.waiting", {
          duration: formatActivityDuration(line.waitingMs),
        });
  }
  if (status === "running") {
    return i18n.t("fleet:taskActivity.running", {
      duration: formatActivityDuration(line.elapsedMs),
    });
  }
  return null;
}

/**
 * A running task's last observed activity and how long it has run, waited or
 * been quiet — "Edit file · src/search.ts · 12s ago · Running for 2m 10s". Every
 * part comes from the turn's activity snapshot; a turn that reported no work
 * shows only its duration, and a task with no live turn shows nothing.
 */
export function FleetTaskActivityLine(props: {
  activity: ProviderTurnActivitySnapshot | null | undefined;
  status: FleetDisplayStatus;
  xstyle?: StyleXValue;
}) {
  useTranslation();
  const live = Boolean(props.activity && props.activity.completedAt == null);
  const now = useNow(live, ACTIVITY_CLOCK_MS);
  const line = buildTaskActivityLine({ activity: props.activity, now });
  if (!line) {
    return null;
  }
  const last = describeLastActivity(line, now);
  const duration = describeStatusDuration(props.status, line);
  if (!last && !duration) {
    return null;
  }
  return (
    <span className={sx(styles.line, props.xstyle)} data-fleet-activity-line="">
      {last ? <span className={sx(styles.last)}>{last}</span> : null}
      {last && duration ? (
        <span aria-hidden="true" className={sx(styles.separator)}>
          ·
        </span>
      ) : null}
      {duration ? <span className={sx(styles.duration)}>{duration}</span> : null}
    </span>
  );
}

/** "No updates for 7m 12s", for a quiet turn's attention row. */
export function FleetQuietDuration(props: { since: string; xstyle?: StyleXValue }) {
  useTranslation();
  const sinceMs = Date.parse(props.since);
  const now = useNow(Number.isFinite(sinceMs), ACTIVITY_CLOCK_MS);
  if (!Number.isFinite(sinceMs)) {
    return null;
  }
  return (
    <span className={sx(styles.duration, props.xstyle)}>
      {i18n.t("fleet:taskActivity.quiet", {
        duration: formatActivityDuration(now - sinceMs),
      })}
    </span>
  );
}

const styles = stylex.create({
  line: {
    alignItems: "baseline",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-normal"],
    minWidth: 0,
  },
  last: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  separator: {
    flexShrink: 0,
  },
  duration: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
});
