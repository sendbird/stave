import { FilePenLine, Plus } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { ScriptEntryCard } from "./ScriptEntryCard";
import {
  collectEntryTriggers,
  findDuplicateEntryIds,
  getScriptEditorRunDisabledReason,
  type ScriptEditorScopeId,
} from "./scripts-manager-state";
import {
  validateScriptEditorEntry,
  type ScriptEditorEntry,
  type ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import { scriptEntryKey } from "@/lib/workspace-scripts/runtime-state";
import type { ScriptEntryOrigin } from "@/lib/workspace-scripts/origins";
import type { ScriptUiState } from "@/lib/workspace-scripts/runtime-state";
import type { ScriptKind } from "@/lib/workspace-scripts/types";

export function ScriptEntriesTab(props: {
  kind: ScriptKind;
  entries: ScriptEditorEntry[];
  hooks: ScriptEditorState["hooks"];
  targetOptions: Array<{ id: string; label: string }>;
  expandedEntryKey: string | null;
  onExpandedChange: (key: string | null) => void;
  onFieldChange: (
    index: number,
    field: keyof ScriptEditorEntry,
    value: string | boolean,
  ) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (index: number) => void;
  // Run / logs
  runtimeAvailable: boolean;
  runtimeHint?: string;
  isDirty: boolean;
  selectedScopeId: ScriptEditorScopeId;
  entryOrigins: Record<string, ScriptEntryOrigin>;
  runStateByKey: Record<string, ScriptUiState>;
  onRunEntry: (id: string) => void;
  onStopEntry: (id: string) => void;
  onClearLog: (id: string) => void;
}) {
  const kindLabel = props.kind === "service" ? "Processes" : "Commands";
  const kindDescription =
    props.kind === "service"
      ? "Long-running processes that stay available until you stop them."
      : "One-shot commands you run on demand or from lifecycle triggers.";
  const addLabel = props.kind === "service" ? "Add process" : "Add command";

  const duplicates = findDuplicateEntryIds(props.entries);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">{kindLabel}</p>
          <p className="text-xs text-muted-foreground">{kindDescription}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={props.onAdd}
        >
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>

      {props.entries.length === 0 ? (
        <Empty className="border border-dashed border-border/70 bg-muted/15">
          <EmptyHeader>
            <EmptyMedia>
              <FilePenLine className="size-4" />
            </EmptyMedia>
            <EmptyTitle>
              No {props.kind === "service" ? "processes" : "commands"} yet
            </EmptyTitle>
            <EmptyDescription>
              Click "{addLabel}" to create the first entry.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2.5">
          {props.entries.map((entry, index) => {
            const stableKey = `${props.kind}:${index}`;
            const triggers = collectEntryTriggers({
              entryId: entry.id,
              kind: props.kind,
              hooks: props.hooks,
            });
            const issues = validateScriptEditorEntry({
              entry,
              kind: props.kind,
              duplicateId: duplicates.has(index),
            });
            const id = entry.id.trim();
            const runKey = scriptEntryKey(props.kind, id);
            const disabledReason = getScriptEditorRunDisabledReason({
              entryId: id,
              isDirty: props.isDirty,
              selectedScopeId: props.selectedScopeId,
              origin: props.entryOrigins[runKey],
            });
            return (
              <ScriptEntryCard
                key={stableKey}
                entry={entry}
                kind={props.kind}
                index={index}
                totalCount={props.entries.length}
                triggers={triggers}
                targetOptions={props.targetOptions}
                issues={issues}
                expanded={props.expandedEntryKey === stableKey}
                onToggleExpand={() =>
                  props.onExpandedChange(
                    props.expandedEntryKey === stableKey ? null : stableKey,
                  )
                }
                onFieldChange={(field, value) =>
                  props.onFieldChange(index, field, value)
                }
                onRemove={() => props.onRemove(index)}
                onMove={(direction) => props.onMove(index, direction)}
                onDuplicate={() => props.onDuplicate(index)}
                run={{
                  available: props.runtimeAvailable,
                  hint: props.runtimeHint,
                  state: props.runStateByKey[runKey],
                  disabledReason,
                  onRun: () => props.onRunEntry(id),
                  onStop: () => props.onStopEntry(id),
                  onClearLog: () => props.onClearLog(id),
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
