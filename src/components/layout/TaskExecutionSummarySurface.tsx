import {
  Activity,
  BadgeCheck,
  Clock3,
  Coins,
  FileDiff,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import type {
  TaskExecutionMetric,
  TaskExecutionSummary,
} from "@/lib/fleet/task-execution-summary";
import { cn } from "@/lib/utils";

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function provenanceLabel(metric: TaskExecutionMetric<unknown>) {
  switch (metric.provenance) {
    case "reported":
      return "Reported";
    case "derived":
      return "Derived";
    case "unavailable":
      return "Unavailable";
  }
}

function SummaryMetric(args: {
  icon: LucideIcon;
  label: string;
  value: string;
  metric: TaskExecutionMetric<unknown>;
  tone?: "default" | "success" | "warning" | "danger";
  compact?: boolean;
}) {
  const Icon = args.icon;
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border border-border/60 bg-background/55",
        args.compact ? "px-2.5 py-2" : "px-3 py-2.5",
      )}
      title={args.metric.detail}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            args.tone === "success"
              ? "text-success"
              : args.tone === "warning"
                ? "text-warning"
                : args.tone === "danger"
                  ? "text-destructive"
                  : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {args.label}
        </dt>
      </div>
      <dd
        className={cn(
          "mt-1 truncate font-medium text-foreground",
          args.compact ? "text-[11px]" : "text-xs",
          args.metric.provenance === "unavailable" &&
            "font-normal text-muted-foreground",
        )}
      >
        {args.value}
      </dd>
      {!args.compact ? (
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {provenanceLabel(args.metric)}
        </span>
      ) : null}
    </div>
  );
}

export function TaskExecutionSummarySurface(args: {
  summary: TaskExecutionSummary;
  compact?: boolean;
  showLatestActivity?: boolean;
  className?: string;
}) {
  const { summary } = args;
  const elapsed = summary.elapsed.value;
  const changes = summary.changes.value;
  const verification = summary.verification.value;
  const usage = summary.usage.value;
  const accountLimit = summary.accountLimit.value;
  const contextHeadroom = summary.contextHeadroom.value;
  const latest = summary.latestActivity.value;
  const verificationTone =
    verification?.status === "pass"
      ? "success"
      : verification?.status === "fail"
        ? "danger"
          : verification?.status === "warn"
          ? "warning"
          : "default";
  const showLatestActivity = args.showLatestActivity ?? true;

  return (
    <section
      className={cn("min-w-0", args.className)}
      aria-label="Task execution summary"
    >
      {showLatestActivity ? (
        <div className="flex min-w-0 items-start gap-2 rounded-md border border-border/60 bg-muted/18 px-3 py-2">
          <Activity
            className="mt-0.5 size-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Latest activity
            </h3>
            <p
              className={cn(
                "mt-0.5 text-xs text-foreground",
                args.compact ? "line-clamp-1" : "line-clamp-2",
              )}
            >
              {latest?.label ?? "No activity reported"}
              {latest?.detail ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {latest.detail}
                </span>
              ) : null}
            </p>
            {!args.compact ? (
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {provenanceLabel(summary.latestActivity)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <dl
        className={cn(
          "grid gap-2",
          showLatestActivity && "mt-2",
          args.compact
            ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
            : "grid-cols-2 sm:grid-cols-3",
        )}
      >
        <SummaryMetric
          compact={args.compact}
          icon={Clock3}
          label="Elapsed"
          metric={summary.elapsed}
          value={
            elapsed
              ? `${formatDuration(elapsed.milliseconds)}${elapsed.running ? " · running" : ""}`
              : "Not reported"
          }
        />
        <SummaryMetric
          compact={args.compact}
          icon={FileDiff}
          label="Changes"
          metric={summary.changes}
          value={
            changes
              ? `${changes.files.length} file${changes.files.length === 1 ? "" : "s"}${
                  changes.additions == null || changes.deletions == null
                    ? ""
                    : ` · +${changes.additions}/−${changes.deletions}`
                }`
              : "No diff reported"
          }
        />
        <SummaryMetric
          compact={args.compact}
          icon={BadgeCheck}
          label="Verification"
          metric={summary.verification}
          tone={verificationTone}
          value={
            verification
              ? `${verification.status} · ${verification.executedEntries}/${verification.totalEntries}`
              : "Not reported"
          }
        />
        <SummaryMetric
          compact={args.compact}
          icon={Coins}
          label="Usage"
          metric={summary.usage}
          value={
            usage
              ? `${formatCount(usage.inputTokens + usage.outputTokens)} tokens${
                  usage.totalCostUsd == null
                    ? ""
                    : ` · $${usage.totalCostUsd.toFixed(4)}`
                }`
              : "Not reported"
          }
        />
        <SummaryMetric
          compact={args.compact}
          icon={Gauge}
          label="Account limit"
          metric={summary.accountLimit}
          tone={
            accountLimit && accountLimit.usedPercent >= 90
              ? "danger"
              : accountLimit && accountLimit.usedPercent >= 75
                ? "warning"
                : "default"
          }
          value={
            accountLimit
              ? `${Math.round(accountLimit.usedPercent)}% used · ${accountLimit.label}`
              : "Not reported"
          }
        />
        <SummaryMetric
          compact={args.compact}
          icon={Gauge}
          label="Context left"
          metric={summary.contextHeadroom}
          value={
            contextHeadroom
              ? `${formatCount(contextHeadroom.remainingTokens)} tokens`
              : "Not supported"
          }
        />
      </dl>
    </section>
  );
}
