import {
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  Circle,
  CircleAlert,
  CirclePause,
  ClipboardList,
  ListChecks,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import type {
  TurnActivityIconKey,
  TurnActivityRowStatus,
} from "@/components/session/turn-activity.utils";
import { turnActivityStatusIconStyles as styles } from "./turn-activity-status-icon.styles";

/**
 * The shelf's status vocabulary, shared by the flat activity list and the work
 * graph tree.
 *
 * It lives outside `TurnActivity.tsx` so a second surface can render the same
 * state without importing the shelf itself: two copies of this mapping would
 * drift the moment one surface learned a new status, and a turn that reads as
 * "failed" in the list but "running" in the tree is worse than either alone.
 */

export const TURN_ACTIVITY_ICONS: Record<TurnActivityIconKey, LucideIcon> = {
  alert: CircleAlert,
  pause: CirclePause,
  plan: ListChecks,
  subagent: Bot,
  // Same glyph as the composer's Advisor pill: the row and the control that
  // armed it must be recognisably the same feature.
  advisor: ArrowLeftRight,
  todo: ClipboardList,
  tool: Wrench,
  hook: Webhook,
};

export function getTurnActivityStatusLabel(status: TurnActivityRowStatus) {
  if (status === "completed") {
    return "Done";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "waiting") {
    return "Waiting";
  }
  if (status === "pending") {
    return "Queued";
  }
  return "Running";
}

export function TurnActivityStatusIcon({
  status,
  iconKey,
  label,
}: {
  status: TurnActivityRowStatus;
  iconKey: TurnActivityIconKey;
  /**
   * Overrides the announced state for rows whose meaning is narrower than the
   * glyph they borrow — a cancelled agent shows the inert queued circle but
   * must not be read out as "Queued".
   */
  label?: string;
}) {
  if (status === "completed") {
    return (
      <span className={sx(styles.slot)}>
        <CheckCircle2
          className={sx(styles.iconLg, styles.success)}
          aria-hidden
        />
        <VisuallyHidden>{label ?? "Done"}</VisuallyHidden>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={sx(styles.slot)}>
        <CircleAlert className={sx(styles.iconLg, styles.danger)} aria-hidden />
        <VisuallyHidden>{label ?? "Failed"}</VisuallyHidden>
      </span>
    );
  }
  if (status === "waiting") {
    return (
      <span className={sx(styles.slot)}>
        <CirclePause
          className={sx(styles.iconLg, styles.warning)}
          aria-hidden
        />
        <VisuallyHidden>{label ?? "Waiting"}</VisuallyHidden>
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className={sx(styles.slot)}>
        <Circle className={sx(styles.iconSm, styles.pending)} aria-hidden />
        <VisuallyHidden>{label ?? "Queued"}</VisuallyHidden>
      </span>
    );
  }
  const Icon = TURN_ACTIVITY_ICONS[iconKey];
  return (
    <span className={sx(styles.slot)}>
      <Icon className={sx(styles.iconSm, styles.running)} aria-hidden />
      <VisuallyHidden>{label ?? "Running"}</VisuallyHidden>
    </span>
  );
}
