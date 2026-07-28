import { Copy, ExternalLink, RotateCw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  formatAutomationTrustPolicy,
  type RoutineRun,
  type RoutineSpec,
} from "@/lib/routines";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatRelativeTime,
  formatRunDuration,
  getRunStatusPresentation,
} from "./automation-center.utils";

export function AutomationRunRow(props: {
  run: RoutineRun;
  automationName?: string;
  active: boolean;
  onSelect: (run: RoutineRun) => void;
}) {
  const presentation = getRunStatusPresentation(props.run.status);
  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.run)}
      aria-current={props.active}
      className={cn(
        "w-full rounded-md border p-2.5 text-left transition-colors",
        props.active
          ? "border-primary/50 bg-primary/8"
          : "border-border/70 hover:bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            presentation.dotClassName,
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {props.automationName ?? "Removed automation"}
        </span>
        <Badge
          variant="outline"
          className={cn("h-5 shrink-0 px-1.5 text-[9px]", presentation.className)}
        >
          {presentation.label}
        </Badge>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{formatRelativeTime(props.run.startedAt)}</span>
        <span className="truncate">
          {props.run.trigger === "scheduled" ? "Schedule" : "Manual"} ·{" "}
          {formatRunDuration(props.run)}
        </span>
      </div>
    </button>
  );
}

function DetailRow(props: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {props.label}
      </dt>
      <dd
        // Values such as timestamps and paths truncate in the narrow detail
        // grid, so keep the full text reachable on hover.
        title={props.value}
        className={cn(
          "mt-0.5 truncate text-[11px] text-foreground",
          props.mono && "font-mono",
        )}
      >
        {props.value}
      </dd>
    </div>
  );
}

export function AutomationRunDetail(props: {
  run: RoutineRun;
  automation: RoutineSpec | null;
  busy: boolean;
  onOpenTask: (run: RoutineRun) => void;
  onRunAgain: (automation: RoutineSpec) => void;
}) {
  const presentation = getRunStatusPresentation(props.run.status);
  const automation = props.automation;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/65 px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Badge
                variant="outline"
                className={cn("h-5 px-1.5 text-[9px]", presentation.className)}
              >
                {presentation.label}
              </Badge>
              <h2 className="truncate text-sm font-semibold text-foreground">
                {automation?.name ?? "Removed automation"}
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Started {formatRelativeTime(props.run.startedAt)} ·{" "}
              {formatDateTime(props.run.startedAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {automation ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={props.busy}
                onClick={() => props.onRunAgain(automation)}
              >
                <RotateCw className="size-3.5" />
                Run again
              </Button>
            ) : null}
            {props.run.taskId ? (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => props.onOpenTask(props.run)}
              >
                <ExternalLink className="size-3.5" />
                Open task
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border/70 bg-surface/30 p-3 sm:grid-cols-3">
            <DetailRow
              label="Trigger"
              value={props.run.trigger === "scheduled" ? "Schedule" : "Manual"}
            />
            <DetailRow
              label="Permissions"
              value={formatAutomationTrustPolicy(props.run.trustPolicy)}
            />
            <DetailRow label="Duration" value={formatRunDuration(props.run)} />
            <DetailRow
              label="Scheduled for"
              value={formatDateTime(props.run.scheduledFor)}
            />
            <DetailRow
              label="Started"
              value={formatDateTime(props.run.startedAt)}
            />
            <DetailRow
              label="Completed"
              value={formatDateTime(props.run.completedAt)}
            />
            <DetailRow
              label="Repository"
              value={automation?.environment.label ?? props.run.projectPath}
            />
            <DetailRow
              label="Model"
              value={automation?.runtime.model ?? "—"}
            />
            <DetailRow
              label="Config hash"
              value={props.run.configHash ?? "legacy"}
              mono
            />
          </dl>

          <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2">
            <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Execution ID
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
              {props.run.id}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy execution ID"
              title="Copy execution ID"
              onClick={() => void copyTextToClipboard(props.run.id)}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>

          {props.run.error ? (
            <section className="grid gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {props.run.status === "skipped" ? "Skip reason" : "Error"}
              </h3>
              <p
                className={cn(
                  "whitespace-pre-wrap rounded-md border p-3 text-[11px] leading-5",
                  props.run.status === "skipped"
                    ? "border-border/70 bg-muted/40 text-muted-foreground"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {props.run.error}
              </p>
            </section>
          ) : null}

          <section className="grid gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Result
            </h3>
            {props.run.resultPreview ? (
              <p className="whitespace-pre-wrap rounded-md border border-border/70 bg-background p-3 text-[11px] leading-5 text-foreground">
                {props.run.resultPreview}
              </p>
            ) : (
              <p className="rounded-md border border-dashed border-border p-3 text-[11px] leading-5 text-muted-foreground">
                {props.run.status === "completed"
                  ? "Completed without a text response. Open the task to inspect its tool output."
                  : props.run.status === "waiting"
                    ? "Waiting for approval or user input. Open the task to respond."
                    : props.run.status === "running"
                      ? "The task is still running."
                      : "No result was recorded for this run."}
              </p>
            )}
          </section>

          {automation ? (
            <section className="grid gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Instructions
              </h3>
              <p className="whitespace-pre-wrap rounded-md border border-border/70 bg-surface/30 p-3 text-[11px] leading-5 text-muted-foreground">
                {automation.prompt}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
