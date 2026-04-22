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
  SectionHeading,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";
import { TaskPresetEditor } from "./task-preset-editor";
import { WorkspaceShortcutChip } from "./WorkspaceShortcutChip";

type PresetEditorTarget =
  | { kind: "edit"; presetId: string }
  | { kind: "new" }
  | null;

function describePreset(preset: TaskPreset) {
  if (preset.kind === "cli-session") {
    return `${getProviderLabel({ providerId: preset.provider, variant: "full" })} CLI session`;
  }

  if (preset.provider === "stave") {
    return "Create a new task with Stave Auto selected.";
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
      <SectionHeading
        title="Presets"
        description="Manage the quick-launch preset bar, its visibility, and the Ctrl+1..9 shortcut order."
      />
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
          <p className="text-sm text-muted-foreground">
            The first nine presets in the list below respond to{" "}
            <span className="font-medium text-foreground">Ctrl+1..9</span> from
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
              <PopoverTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-3.5" />
                  Add preset
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => resetTaskPresetsToDefault()}
              disabled={presets.length === 0}
            >
              Restore Default Presets
            </Button>
          </div>

          {presets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
              No presets yet. Add one to create task and CLI-session launch
              shortcuts.
            </div>
          ) : (
            <div className="space-y-2.5">
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
                    <div className="rounded-lg border border-border/70 bg-card/60 p-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                            <ModelIcon
                              providerId={preset.provider}
                              model={preset.model}
                              className="size-4 text-muted-foreground"
                            />
                            {preset.kind === "cli-session" ? (
                              <SquareTerminal className="absolute -bottom-1 -right-1 size-3 rounded-sm bg-background text-muted-foreground" />
                            ) : null}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {preset.label}
                              </p>
                              {shortcutLabel ? (
                                <WorkspaceShortcutChip
                                  modifier="Ctrl"
                                  label={shortcutLabel}
                                  className="h-5 px-1.5 text-[10px]"
                                />
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {describePreset(preset)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={moveUpDisabled}
                            onClick={() => handleMovePreset(preset.id, -1)}
                          >
                            <ChevronUp className="size-3.5" />
                            Move up
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={moveDownDisabled}
                            onClick={() => handleMovePreset(preset.id, 1)}
                          >
                            <ChevronDown className="size-3.5" />
                            Move down
                          </Button>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setEditorTarget({
                                  kind: "edit",
                                  presetId: preset.id,
                                })
                              }
                            >
                              Edit
                            </Button>
                          </PopoverTrigger>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => handleDeletePreset(preset.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                    <PopoverContent align="end" className="w-80">
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
