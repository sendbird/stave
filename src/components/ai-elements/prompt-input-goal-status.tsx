import { Target } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface PromptInputGoalStatus {
  statusLabel: string;
  objective: string;
  tokenLabel: string;
  elapsedLabel: string;
  progressPercent: number | null;
  tone: "default" | "warning" | "success";
}

function goalStatusToneClass(tone: PromptInputGoalStatus["tone"]) {
  if (tone === "success") {
    return "border-success/30 bg-success/5 text-success dark:bg-success/10";
  }
  if (tone === "warning") {
    return "border-warning/40 bg-warning/10 text-warning dark:bg-warning/15";
  }
  return "border-primary/20 bg-primary/5 text-primary dark:bg-primary/10";
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
      className={cn(
        "space-y-2 rounded-lg border px-3 py-2.5",
        goalStatusToneClass(args.status.tone),
        args.compact && "rounded-md px-2.5 py-2",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge
          variant={goalStatusBadgeVariant(args.status.tone)}
          className="h-5 gap-1 px-1.5 text-[10px] uppercase tracking-wide"
        >
          <Target className="size-3" />
          Goal {args.status.statusLabel}
        </Badge>
        <p
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          title={args.status.objective}
        >
          {args.status.objective}
        </p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {args.status.tokenLabel}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {args.status.elapsedLabel}
        </span>
      </div>
      {progressWidth ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-background/70">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              args.status.tone === "success"
                ? "bg-success"
                : args.status.tone === "warning"
                  ? "bg-warning"
                  : "bg-primary",
            )}
            style={{ width: progressWidth }}
          />
        </div>
      ) : null}
    </div>
  );
}
