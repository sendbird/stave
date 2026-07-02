import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  LoaderCircle,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ScriptLogView } from "./ScriptLogView";
import { ScriptEntryFormFields } from "./ScriptEntryFormFields";
import { targetLabel } from "./scripts-manager-state";
import type {
  ScriptEditorEntry,
  ScriptEntryFieldIssues,
} from "@/lib/workspace-scripts/editor";
import { SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts/constants";
import type { ScriptKind, ScriptTrigger } from "@/lib/workspace-scripts/types";
import type { ScriptUiState } from "@/lib/workspace-scripts/runtime-state";
import { cn } from "@/lib/utils";

export interface ScriptEntryRunControls {
  /** Whether run controls should render at all (a workspace runtime is bound). */
  available: boolean;
  state: ScriptUiState | undefined;
  /** Non-empty when Run is disabled (dirty, or entry absent from resolved config). */
  disabledReason: string | null;
  onRun: () => void;
  onStop: () => void;
  onClearLog: () => void;
  /** Caption shown when no runtime is bound. */
  hint?: string;
}

export function ScriptEntryCard(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  index: number;
  totalCount: number;
  triggers: ScriptTrigger[];
  targetOptions: Array<{ id: string; label: string }>;
  issues: ScriptEntryFieldIssues;
  expanded: boolean;
  onToggleExpand: () => void;
  onFieldChange: (field: keyof ScriptEditorEntry, value: string | boolean) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  run: ScriptEntryRunControls;
}) {
  const title = props.entry.label.trim()
    || props.entry.id.trim()
    || `${props.kind === "service" ? "Service" : "Action"} ${props.index + 1}`;
  const moveUpDisabled = props.index === 0;
  const moveDownDisabled = props.index === props.totalCount - 1;
  const hasIssues = Object.keys(props.issues).length > 0;

  const runState = props.run.state;
  const isRunning = runState?.running ?? false;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/60",
        hasIssues && !props.expanded ? "border-destructive/50" : "border-border/70",
      )}
    >
      <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-start xl:justify-between">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={props.onToggleExpand}
          aria-expanded={props.expanded}
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {props.expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{title}</span>
              {props.entry.id.trim() ? (
                <Badge variant="outline" className="rounded-sm px-2 py-0 font-mono text-[10px]">
                  {props.entry.id.trim()}
                </Badge>
              ) : (
                <Badge variant="secondary" className="rounded-sm px-2 py-0 text-[10px]">
                  draft id
                </Badge>
              )}
              <Badge variant="secondary" className="rounded-sm px-2 py-0 font-normal">
                {targetLabel(props.entry.target, props.targetOptions)}
              </Badge>
              {props.kind === "service" && props.entry.orbitEnabled ? (
                <Badge variant="secondary" className="rounded-sm px-2 py-0">
                  Orbit
                </Badge>
              ) : null}
              {!props.entry.enabled ? (
                <Badge variant="secondary" className="rounded-sm px-2 py-0">
                  Disabled
                </Badge>
              ) : null}
              {hasIssues ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                  <AlertCircle className="size-3" />
                  Needs attention
                </span>
              ) : null}
            </div>
            {props.entry.description.trim() ? (
              <p className="text-xs text-muted-foreground">{props.entry.description.trim()}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                One command per line. JSON stays normalized behind the form.
              </p>
            )}
            {props.triggers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Hooks
                </span>
                {props.triggers.map((trigger) => (
                  <Badge
                    key={trigger}
                    variant="outline"
                    className="rounded-full px-2 py-0 text-[10px]"
                  >
                    {SCRIPT_TRIGGER_METADATA[trigger].label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          {props.run.available ? (
            <Button
              variant={isRunning ? "outline" : "default"}
              size="sm"
              className="gap-1.5"
              disabled={!isRunning && Boolean(props.run.disabledReason)}
              title={!isRunning ? props.run.disabledReason ?? undefined : undefined}
              onClick={isRunning ? props.run.onStop : props.run.onRun}
            >
              {isRunning ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              {isRunning ? "Stop" : "Run"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={moveUpDisabled}
            onClick={props.onMove.bind(null, -1)}
            aria-label="Move up"
            title="Move up"
          >
            <ChevronDown className="size-3.5 rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={moveDownDisabled}
            onClick={props.onMove.bind(null, 1)}
            aria-label="Move down"
            title="Move down"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={props.onDuplicate}
            aria-label="Duplicate"
            title="Duplicate"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={props.onToggleExpand}
          >
            {props.expanded ? "Done" : "Edit"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={props.onRemove}
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {props.run.available && !isRunning && props.run.disabledReason ? (
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">{props.run.disabledReason}</p>
      ) : null}
      {!props.run.available && props.run.hint ? (
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">{props.run.hint}</p>
      ) : null}

      {props.run.available ? (
        <div className="px-3 pb-1">
          <ScriptLogView
            log={runState?.log ?? ""}
            running={isRunning}
            error={runState?.error}
            exitCode={runState?.exitCode}
            startedAt={runState?.startedAt}
            endedAt={runState?.endedAt}
            onClear={props.run.onClearLog}
          />
        </div>
      ) : null}

      {props.expanded ? (
        <div className="border-t border-border/60 p-3">
          <ScriptEntryFormFields
            entry={props.entry}
            kind={props.kind}
            targetOptions={props.targetOptions}
            issues={props.issues}
            onFieldChange={props.onFieldChange}
          />
        </div>
      ) : null}
    </div>
  );
}
