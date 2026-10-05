import { i18n, useTranslation } from "@/i18n";
import { FilePenLine, Plus } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
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
import { entriesTabStyles } from "./script-entries-tab.styles";

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
  const { t: tI18n } = useTranslation(["scripts"]);
  const kindLabel = props.kind === "service" ? tI18n("scripts:scriptEntriesTab.processes") : tI18n("scripts:scriptEntriesTab.commands");
  const kindDescription =
    props.kind === "service"
      ? tI18n("scripts:scriptEntriesTab.devServersWatchersAndOtherLongRunning")
      : tI18n("scripts:scriptEntriesTab.oneShotCommandsYouRunOnDemand");
  const addLabel = props.kind === "service" ? tI18n("scripts:scriptEntriesTab.addProcess") : tI18n("scripts:scriptEntriesTab.addCommand");

  const duplicates = findDuplicateEntryIds(props.entries);

  return (
    <div className={sx(entriesTabStyles.root)}>
      <div className={sx(entriesTabStyles.header)}>
        <div className={sx(entriesTabStyles.headerText)}>
          <p className={sx(entriesTabStyles.title)}>{kindLabel}</p>
          <p className={sx(entriesTabStyles.description)}>{kindDescription}</p>
        </div>
        <Button
          type="button"
          size="sm"
          xstyle={entriesTabStyles.addButton}
          onClick={props.onAdd}
        >
          <Plus className={sx(entriesTabStyles.buttonIcon)} />
          {addLabel}
        </Button>
      </div>

      {props.entries.length === 0 ? (
        <Empty xstyle={entriesTabStyles.emptyState}>
          <EmptyHeader>
            <EmptyMedia>
              <FilePenLine className={sx(entriesTabStyles.emptyIcon)} />
            </EmptyMedia>
            <EmptyTitle>
          {tI18n("scripts:scriptEntriesTab.emptyTitle", { kind: props.kind === "service" ? tI18n("scripts:scriptEntriesTab.processes2") : tI18n("scripts:scriptEntriesTab.commands2") })}
        </EmptyTitle>
            <EmptyDescription>
              {props.kind === "service"
                ? tI18n("scripts:scriptEntriesTab.clickValueToDefineAServerOr", { addLabel: addLabel })
                : tI18n("scripts:scriptEntriesTab.clickValueToCreateTheFirstEntry", { addLabel: addLabel })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={sx(entriesTabStyles.list)}>
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
