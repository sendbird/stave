import { Button as AdsButton } from "@/components/ads/components/Button";
import { useCallback, useState } from "react";
import { Cog, Ellipsis, SquareTerminal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { type TaskPreset } from "@/lib/task-presets";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { TaskPresetEditor } from "@/components/layout/task-preset-editor";
import { sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { presetBarStyles as styles } from "./preset-bar.styles";

type PresetEditorTarget = { kind: "edit"; presetId: string } | null;

/**
 * Horizontal quick-launch bar between the task tab strip and the chat panel.
 *
 * Each chip is a user-configurable `TaskPreset` that either creates a new
 * task seeded with a provider + model, or opens a native CLI session tab.
 * Presets are persisted in `AppSettings.taskPresets` so they survive across
 * sessions.
 */
export function PresetBar() {
  const [
    presets,
    applyTaskPreset,
    upsertTaskPreset,
    removeTaskPreset,
    resetTaskPresetsToDefault,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.taskPresets,
          state.applyTaskPreset,
          state.upsertTaskPreset,
          state.removeTaskPreset,
          state.resetTaskPresetsToDefault,
        ] as const,
    ),
  );

  const [editorTarget, setEditorTarget] = useState<PresetEditorTarget>(null);

  const handleApply = useCallback(
    (preset: TaskPreset) => {
      applyTaskPreset({ presetId: preset.id });
    },
    [applyTaskPreset],
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

  const handleOpenPresetSettings = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
        detail: { section: "presets" },
      }),
    );
  }, []);

  return (
    <div className={sx(styles.root)} data-testid="preset-bar">
      <div className={sx(styles.chips)}>
        {presets.map((preset) => (
          <PresetChip
            key={preset.id}
            preset={preset}
            isEditing={
              editorTarget?.kind === "edit" &&
              editorTarget.presetId === preset.id
            }
            onApply={handleApply}
            onRequestEdit={() =>
              setEditorTarget({ kind: "edit", presetId: preset.id })
            }
            onCloseEditor={() => setEditorTarget(null)}
            onSave={handleSavePreset}
            onDelete={() => handleDeletePreset(preset.id)}
          />
        ))}

        {presets.length === 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            xstyle={styles.restore}
            onClick={() => resetTaskPresetsToDefault()}
          >
            Restore default presets
          </Button>
        ) : null}
      </div>

      <div className={sx(styles.trailing)}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          xstyle={styles.manage}
          aria-label="Manage presets"
          onClick={handleOpenPresetSettings}
        >
          <Cog className={sx(styles.chipIcon)} />
        </Button>
      </div>
    </div>
  );
}

interface PresetChipProps {
  preset: TaskPreset;
  isEditing: boolean;
  onApply: (preset: TaskPreset) => void;
  onRequestEdit: () => void;
  onCloseEditor: () => void;
  onSave: (preset: TaskPreset) => void;
  onDelete: () => void;
}

function PresetChip(props: PresetChipProps) {
  const {
    preset,
    isEditing,
    onApply,
    onRequestEdit,
    onCloseEditor,
    onSave,
    onDelete,
  } = props;

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) {
          onCloseEditor();
        }
      }}
    >
      <PopoverAnchor
        render={
          <div
            className={sx(styles.chip, transition.colors, focusRing.ringWithin)}
            data-preset-id={preset.id}
          />
        }
      >
        <AdsButton
          layout="host"
          type="button"
          onClick={() => onApply(preset)}
          xstyle={styles.chipApply}
          title={buildChipTitle(preset)}
        >
          <ModelIcon
            providerId={preset.provider}
            model={preset.model}
            className={sx(styles.chipIcon)}
          />
          <span className={sx(styles.chipLabel)}>{preset.label}</span>
          {preset.kind === "cli-session" ? (
            <SquareTerminal
              className={sx(styles.chipCliMark)}
              aria-label="CLI session"
            />
          ) : null}
        </AdsButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                xstyle={[styles.chipActions, transition.fade]}
                aria-label="Preset actions"
              />
            }
          >
            <Ellipsis className={sx(styles.chipActionsIcon)} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={sx(styles.chipMenu)}
            // Keep focus where it is when the menu closes after "Edit…".
            // The default focus return lands outside the freshly opened
            // preset editor Popover and immediately dismisses it.
            finalFocus={false}
          >
            <DropdownMenuItem onSelect={() => onRequestEdit()}>
              Edit…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete()}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PopoverAnchor>
      <PopoverContent align="start" xstyle={styles.chipEditor}>
        <TaskPresetEditor
          initialPreset={preset}
          submitLabel="Save"
          onSave={onSave}
          onCancel={onCloseEditor}
        />
      </PopoverContent>
    </Popover>
  );
}

function buildChipTitle(preset: TaskPreset) {
  if (preset.kind === "cli-session") {
    return `${preset.label} — CLI session`;
  }
  if (preset.model) {
    return `${preset.label} — ${toHumanModelName({ model: preset.model })}`;
  }
  return preset.label;
}
