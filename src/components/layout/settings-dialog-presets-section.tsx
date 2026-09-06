import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  generatePresetId,
  getTaskPresetShortcutLabel,
  type TaskPreset,
} from "@/lib/task-presets";
import { useAppStore } from "@/store/app.store";
import {
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";
import { TaskPresetEditor } from "./task-preset-editor";
import { WorkspaceShortcutChip } from "./WorkspaceShortcutChip";
import { sx } from "@/components/ads/utils/stylex";
import { presetsSectionStyles as styles } from "./settings-dialog-presets-section.styles";

type PresetEditorTarget =
  { kind: "edit"; presetId: string } | { kind: "new" } | null;

function describePreset(preset: TaskPreset) {
  if (preset.kind === "cli-session") {
    return `${getProviderLabel({ providerId: preset.provider, variant: "full" })} CLI session`;
  }

  return `${getProviderLabel({ providerId: preset.provider, variant: "full" })} · ${toHumanModelName({ model: preset.model ?? "" })}`;
}

export function PresetsSection() {
  const [
    showPresetBar,
    presets,
    updateSettings,
    upsertTaskPreset,
    removeTaskPreset,
    reorderTaskPresets,
    resetTaskPresetsToDefault,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.showPresetBar,
          state.settings.taskPresets,
          state.updateSettings,
          state.upsertTaskPreset,
          state.removeTaskPreset,
          state.reorderTaskPresets,
          state.resetTaskPresetsToDefault,
        ] as const,
    ),
  );
  const [editorTarget, setEditorTarget] = useState<PresetEditorTarget>(null);

  const isAddingNew = editorTarget?.kind === "new";
  const newPresetDraft = useMemo<TaskPreset>(
    () => ({
      id: generatePresetId(),
      label: "",
      kind: "task",
      provider: "claude-code",
      model: getDefaultModelForProvider({ providerId: "claude-code" }),
    }),
    [isAddingNew],
  );

  const handleSavePreset = useCallback(
    (preset: TaskPreset) => {
      upsertTaskPreset({ preset });
      setEditorTarget(null);
    },
    [upsertTaskPreset],
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      removeTaskPreset({ presetId });
      setEditorTarget((current) =>
        current?.kind === "edit" && current.presetId === presetId
          ? null
          : current,
      );
    },
    [removeTaskPreset],
  );

  const handleMovePreset = useCallback(
    (presetId: string, direction: -1 | 1) => {
      const currentIndex = presets.findIndex(
        (preset) => preset.id === presetId,
      );
      const targetIndex = currentIndex + direction;
      const targetPreset = presets[targetIndex];
      if (currentIndex < 0 || !targetPreset) {
        return;
      }
      reorderTaskPresets({
        fromPresetId: presetId,
        toPresetId: targetPreset.id,
      });
    },
    [presets, reorderTaskPresets],
  );

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Preset Bar"
          description="Show the preset bar between task tabs and the main chat surface."
        >
          <SwitchField
            title="Show Preset Bar"
            description="Hide the row without deleting its presets. The task-tab overflow menu can toggle this too."
            checked={showPresetBar}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { showPresetBar: checked } })
            }
          />
          <p className={sx(styles.shortcutNote)}>
            The first nine presets in the list below respond to{" "}
            <span className={sx(styles.emphasis)}>Ctrl+1..9</span> from
            top-to-bottom order.
          </p>
        </SettingsCard>

        <SettingsCard
          title="Manage Presets"
          description="Add, edit, delete, and reorder the quick-launch presets used by the bar and keyboard shortcuts."
          titleAccessory={
            <Popover
              open={editorTarget?.kind === "new"}
              onOpenChange={(open) =>
                setEditorTarget(open ? { kind: "new" } : null)
              }
            >
              <PopoverTrigger
                render={<Button size="sm" xstyle={styles.addButton} />}
              >
                <Plus className={sx(styles.addIcon)} />
                Add preset
              </PopoverTrigger>
              <PopoverContent align="end" className={sx(styles.editorPopover)}>
                <TaskPresetEditor
                  initialPreset={newPresetDraft}
                  submitLabel="Add preset"
                  onSave={handleSavePreset}
                  onCancel={() => setEditorTarget(null)}
                />
              </PopoverContent>
            </Popover>
          }
        >
          <div className={sx(styles.restoreRow)}>
            <Button
              variant="outline"
              onClick={() => resetTaskPresetsToDefault()}
              disabled={presets.length === 0}
            >
              Restore Default Presets
            </Button>
          </div>

          {presets.length === 0 ? (
            <div className={sx(styles.empty)}>
              No presets yet. Add one to create task and CLI-session launch
              shortcuts.
            </div>
          ) : (
            <div className={sx(styles.list)}>
              {presets.map((preset, index) => {
                const shortcutLabel = getTaskPresetShortcutLabel(index);
                const isEditing =
                  editorTarget?.kind === "edit" &&
                  editorTarget.presetId === preset.id;
                const moveUpDisabled = index === 0;
                const moveDownDisabled = index === presets.length - 1;

                return (
                  <Popover
                    key={preset.id}
                    open={isEditing}
                    onOpenChange={(open) => {
                      if (!open) {
                        setEditorTarget((current) =>
                          current?.kind === "edit" &&
                          current.presetId === preset.id
                            ? null
                            : current,
                        );
                      }
                    }}
                  >
                    <div className={sx(styles.row)}>
                      <div className={sx(styles.rowInner)}>
                        <div className={sx(styles.rowMain)}>
                          <div className={sx(styles.mark)}>
                            <ModelIcon
                              providerId={preset.provider}
                              model={preset.model}
                              className={sx(styles.markIcon)}
                            />
                            {preset.kind === "cli-session" ? (
                              <SquareTerminal className={sx(styles.cliBadge)} />
                            ) : null}
                          </div>
                          <div className={sx(styles.rowBody)}>
                            <div className={sx(styles.rowHead)}>
                              <p className={sx(styles.rowLabel)}>
                                {preset.label}
                              </p>
                              {shortcutLabel ? (
                                <WorkspaceShortcutChip
                                  modifier="Ctrl"
                                  label={shortcutLabel}
                                  className={sx(styles.shortcutChip)}
                                />
                              ) : null}
                            </div>
                            <p className={sx(styles.rowMeta)}>
                              {describePreset(preset)}
                            </p>
                          </div>
                        </div>

                        <div className={sx(styles.rowActions)}>
                          <Button
                            variant="outline"
                            size="sm"
                            xstyle={styles.actionButton}
                            disabled={moveUpDisabled}
                            onClick={() => handleMovePreset(preset.id, -1)}
                          >
                            <ChevronUp className={sx(styles.actionIcon)} />
                            Move up
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            xstyle={styles.actionButton}
                            disabled={moveDownDisabled}
                            onClick={() => handleMovePreset(preset.id, 1)}
                          >
                            <ChevronDown className={sx(styles.actionIcon)} />
                            Move down
                          </Button>
                          <PopoverTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setEditorTarget({
                                    kind: "edit",
                                    presetId: preset.id,
                                  })
                                }
                              />
                            }
                          >
                            Edit
                          </PopoverTrigger>
                          <Button
                            variant="outline"
                            size="sm"
                            xstyle={styles.deleteButton}
                            onClick={() => handleDeletePreset(preset.id)}
                          >
                            <Trash2 className={sx(styles.actionIcon)} />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                    <PopoverContent
                      align="end"
                      className={sx(styles.editorPopover)}
                    >
                      <TaskPresetEditor
                        initialPreset={preset}
                        submitLabel="Save preset"
                        onSave={handleSavePreset}
                        onCancel={() => setEditorTarget(null)}
                      />
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          )}
        </SettingsCard>
      </SectionStack>
    </>
  );
}
