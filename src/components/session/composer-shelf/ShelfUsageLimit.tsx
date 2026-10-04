import { memo } from "react";
import { AlarmClock, Gauge, Play, X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import type { TaskUsageLimitPause } from "@/store/task-work-pause";
import { describeUsageLimitLine } from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";

export interface ShelfUsageLimitProps {
  pause: TaskUsageLimitPause;
  queuedCount: number;
  onResumeNow: () => void;
  onResumeAtReset: (enabled: boolean) => void;
  onDismiss: () => void;
}

/**
 * The line for work a usage limit stopped: when the limit resets, and the
 * choice of resuming now, resuming on its own at the reset, or letting it go.
 * Once armed, the line says when Stave resumes and offers to cancel that.
 */
export const ShelfUsageLimit = memo(function ShelfUsageLimit(props: ShelfUsageLimitProps) {
  // The countdown moves by the minute; a 30s tick keeps it within one.
  const now = useNow(true);
  const line = describeUsageLimitLine({
    pause: props.pause,
    queuedCount: props.queuedCount,
    now,
  });
  const Icon = line.armed ? AlarmClock : Gauge;
  return (
    <div
      className={sx(styles.line)}
      role="group"
      aria-label="Usage limit"
      data-testid="composer-shelf-usage-limit"
      data-armed={line.armed ? "true" : undefined}
    >
      <span className={sx(styles.mark)}>
        <Icon
          aria-hidden
          className={sx(styles.markIcon, line.armed ? styles.labelAccent : styles.labelWaiting)}
        />
      </span>
      <p className={sx(styles.text)} title={line.hint}>
        <span className={sx(styles.label, line.armed ? styles.labelAccent : styles.labelWaiting)}>
          {line.label}
        </span>
        <span>{` · ${line.detail}`}</span>
        <span className={sx(styles.visuallyHidden)}>{` ${line.hint}`}</span>
      </p>
      <span className={sx(styles.actions)}>
        {line.canResumeAtReset ? (
          <Button
            variant="quiet"
            size="xs"
            title="Resume on its own once the limit resets, while Stave is open"
            onClick={() => props.onResumeAtReset(true)}
            xstyle={styles.itemAccent}
          >
            <AlarmClock aria-hidden />
            <span className={sx(styles.actionWord)}>Resume at reset</span>
          </Button>
        ) : null}
        {line.armed ? (
          <Button
            variant="quiet"
            size="xs"
            title="Don't resume on its own"
            onClick={() => props.onResumeAtReset(false)}
            xstyle={styles.quiet}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          variant="quiet"
          size="xs"
          title="Resume now"
          onClick={props.onResumeNow}
          xstyle={styles.itemAccent}
        >
          <Play aria-hidden />
          <span className={sx(styles.actionWord)}>Resume now</span>
        </Button>
        {line.canDismiss ? (
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label="Dismiss without resuming"
            title="Dismiss without resuming"
            onClick={props.onDismiss}
            xstyle={styles.quiet}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </span>
    </div>
  );
});
