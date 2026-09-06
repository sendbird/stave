import { Target } from "lucide-react";
import { Badge } from "@/components/ui";
import { sx } from "../ads/utils/stylex";
import { goalStatusStyles } from "./prompt-input-goal-status.styles";

export interface PromptInputGoalStatus {
  statusLabel: string;
  objective: string;
  tokenLabel: string;
  elapsedLabel: string;
  progressPercent: number | null;
  tone: "default" | "warning" | "success";
}

function goalStatusToneStyle(tone: PromptInputGoalStatus["tone"]) {
  if (tone === "success") {
    return goalStatusStyles.toneSuccess;
  }
  if (tone === "warning") {
    return goalStatusStyles.toneWarning;
  }
  return goalStatusStyles.toneDefault;
}

function goalStatusBadgeVariant(tone: PromptInputGoalStatus["tone"]) {
  if (tone === "success") {
    return "success" as const;
  }
  if (tone === "warning") {
    return "warning" as const;
  }
  return "default" as const;
}

function goalProgressFillStyle(tone: PromptInputGoalStatus["tone"]) {
  if (tone === "success") {
    return goalStatusStyles.progressFillSuccess;
  }
  if (tone === "warning") {
    return goalStatusStyles.progressFillWarning;
  }
  return goalStatusStyles.progressFillDefault;
}

export function PromptInputGoalStatusStrip(args: {
  status: PromptInputGoalStatus;
  compact?: boolean;
}) {
  const progressWidth =
    args.status.progressPercent == null
      ? null
      : `${Math.min(100, Math.max(0, args.status.progressPercent))}%`;

  return (
    <div
      className={sx(
        goalStatusStyles.strip,
        goalStatusToneStyle(args.status.tone),
        args.compact && goalStatusStyles.stripCompact,
      )}
      role="status"
      aria-live="polite"
    >
      <div className={sx(goalStatusStyles.header)}>
        <Badge
          variant={goalStatusBadgeVariant(args.status.tone)}
          className={sx(goalStatusStyles.badge)}
        >
          <Target className={sx(goalStatusStyles.badgeIcon)} />
          Goal {args.status.statusLabel}
        </Badge>
        <p
          className={sx(goalStatusStyles.objective)}
          title={args.status.objective}
        >
          {args.status.objective}
        </p>
        <span className={sx(goalStatusStyles.meta)}>
          {args.status.tokenLabel}
        </span>
        <span className={sx(goalStatusStyles.meta)}>
          {args.status.elapsedLabel}
        </span>
      </div>
      {progressWidth ? (
        <div className={sx(goalStatusStyles.progressTrack)}>
          <div
            className={sx(
              goalStatusStyles.progressFill,
              goalProgressFillStyle(args.status.tone),
            )}
            style={{ width: progressWidth }}
          />
        </div>
      ) : null}
    </div>
  );
}
