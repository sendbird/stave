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
} from "./scripts-manager-state";
import {
  validateScriptEditorEntry,
  type ScriptEditorEntry,
  type ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import { scriptEntryKey } from "@/lib/workspace-scripts/runtime-state";
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
  runStateByKey: Record<string, ScriptUiState>;
  onOpenInRail: () => void;
}) {
  const kindLabel = props.kind === "service" ? "Processes" : "Commands";
  const kindDescription =
    props.kind === "service"
      ? "Dev servers, watchers, and other long-running processes. They stay up after you close Settings, and you control them from the right rail."
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
              {props.kind === "service"
                ? `Click "${addLabel}" to define a server or watcher you can leave running while you work.`
                : `Click "${addLabel}" to create the first entry.`}
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
                isRunning={Boolean(props.runStateByKey[runKey]?.running)}
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
                onOpenInRail={props.onOpenInRail}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
