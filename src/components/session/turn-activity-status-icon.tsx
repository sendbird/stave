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
import type {
  TurnActivityIconKey,
  TurnActivityRowStatus,
} from "@/components/session/turn-activity.utils";

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
      <span className="flex size-4 shrink-0 items-center justify-center">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        <span className="sr-only">{label ?? "Done"}</span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <CircleAlert className="size-4 text-destructive" aria-hidden />
        <span className="sr-only">{label ?? "Failed"}</span>
      </span>
    );
  }
  if (status === "waiting") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <CirclePause className="size-4 text-warning" aria-hidden />
        <span className="sr-only">{label ?? "Waiting"}</span>
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Circle className="size-3.5 text-muted-foreground/45" aria-hidden />
        <span className="sr-only">{label ?? "Queued"}</span>
      </span>
    );
  }
  const Icon = TURN_ACTIVITY_ICONS[iconKey];
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="sr-only">{label ?? "Running"}</span>
    </span>
  );
}
