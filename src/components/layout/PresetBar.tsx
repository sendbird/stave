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
import { cn } from "@/lib/utils";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { TaskPresetEditor } from "@/components/layout/task-preset-editor";

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
    <div
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-2",
        "border-b border-border/70 bg-muted/20 px-2 py-1",
      )}
      data-testid="preset-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
            className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => resetTaskPresetsToDefault()}
          >
            Restore default presets
          </Button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Manage presets"
          onClick={handleOpenPresetSettings}
        >
          <Cog className="size-3.5" />
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
      <PopoverAnchor asChild>
        <div
          className={cn(
            "group relative flex h-7 shrink-0 items-stretch rounded-md border border-border/60",
            "bg-card/70 text-foreground shadow-sm transition-colors hover:bg-card",
            "focus-within:ring-1 focus-within:ring-primary/40",
          )}
          data-preset-id={preset.id}
        >
          <button
            type="button"
            onClick={() => onApply(preset)}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-l-md px-2 text-xs",
              "outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
            )}
            title={buildChipTitle(preset)}
          >
            <ModelIcon
              providerId={preset.provider}
              model={preset.model}
              className="size-3.5 shrink-0"
            />
            <span className="truncate max-w-[140px]">{preset.label}</span>
            {preset.kind === "cli-session" ? (
              <SquareTerminal
                className="size-3 shrink-0 text-muted-foreground"
                aria-label="CLI session"
              />
            ) : null}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-full w-5 shrink-0 rounded-l-none rounded-r-md px-0 text-muted-foreground",
                  "opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100",
                  "data-[state=open]:opacity-100",
                )}
                aria-label="Preset actions"
              >
                <Ellipsis className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => onRequestEdit()}>
                Edit…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onDelete()}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-72">
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
