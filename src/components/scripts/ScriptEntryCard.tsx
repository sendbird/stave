import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ScriptEntryFormFields } from "./ScriptEntryFormFields";
import { targetLabel } from "./scripts-manager-state";
import type {
  ScriptEditorEntry,
  ScriptEntryFieldIssues,
} from "@/lib/workspace-scripts/editor";
import { SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts/constants";
import type { ScriptKind, ScriptTrigger } from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";

export function ScriptEntryCard(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  index: number;
  totalCount: number;
  triggers: ScriptTrigger[];
  targetOptions: Array<{ id: string; label: string }>;
  issues: ScriptEntryFieldIssues;
  expanded: boolean;
  isRunning: boolean;
  onToggleExpand: () => void;
  onFieldChange: (
    field: keyof ScriptEditorEntry,
    value: string | boolean,
  ) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onOpenInRail: () => void;
}) {
  const title =
    props.entry.label.trim() ||
    props.entry.id.trim() ||
    `${props.kind === "service" ? "Process" : "Command"} ${props.index + 1}`;
  const kindLabel = props.kind === "service" ? "process" : "command";
  const moveUpDisabled = props.index === 0;
  const moveDownDisabled = props.index === props.totalCount - 1;
  const hasIssues = Object.keys(props.issues).length > 0;
  const metaParts = [
    targetLabel(props.entry.target, props.targetOptions),
    props.kind === "service" && props.entry.orbitEnabled ? "Orbit" : null,
    props.entry.enabled ? null : "Disabled",
  ].filter((part): part is string => Boolean(part));

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/60",
        hasIssues && !props.expanded
          ? "border-destructive/50"
          : "border-border/70",
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
            {props.expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {title}
              </span>
              {props.isRunning ? (
                <Badge
                  variant="secondary"
                  className="rounded-sm px-2 py-0 font-medium text-primary"
                >
                  Running
                </Badge>
              ) : null}
              {hasIssues ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                  <AlertCircle className="size-3" />
                  Needs attention
                </span>
              ) : null}
            </div>
            {metaParts.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {metaParts.join(" · ")}
              </p>
            ) : null}
            {props.entry.description.trim() ? (
              <p className="text-xs text-muted-foreground">
                {props.entry.description.trim()}
              </p>
            ) : null}
            {props.triggers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Triggers
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={props.onOpenInRail}
          >
            Open in rail
          </Button>
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
            aria-label={`Duplicate ${kindLabel}`}
            title={`Duplicate ${kindLabel}`}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={props.onToggleExpand}>
            {props.expanded ? "Done" : "Edit"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={props.onRemove}
            aria-label={`Delete ${kindLabel}`}
            title={`Delete ${kindLabel}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

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
