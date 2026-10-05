import { I18N_NAMESPACES, Trans, useTranslation, i18n } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
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
import { Button as AdsButton } from "@/components/ads/components/Button";
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
    return i18n.t("settings:settingsDialogPresetsSection.cliSession", { value1: getProviderLabel({ providerId: preset.provider, variant: "full" }) });
  }

  return `${getProviderLabel({ providerId: preset.provider, variant: "full" })} · ${toHumanModelName({ model: preset.model ?? "" })}`;
}

export function PresetsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
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
          title={t("settings:settingsDialogPresetsSection.presetBar")}
          description={t("settings:settingsDialogPresetsSection.showThePresetBarBetweenTask")}
        >
          <SwitchField
            title={t("settings:settingsDialogPresetsSection.showPresetBar")}
            description={t("settings:settingsDialogPresetsSection.hideTheRowWithoutDeletingIts")}
            checked={showPresetBar}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { showPresetBar: checked } })
            }
          />
          <p className={sx(styles.shortcutNote)}><Trans t={t} i18nKey="settings:whole.presetShortcuts" components={{ keys: <span className={sx(styles.emphasis)} /> }} /></p>
        </SettingsCard>

        <SettingsCard
          title={t("settings:settingsDialogPresetsSection.managePresets")}
          description={t("settings:settingsDialogPresetsSection.addEditDeleteAndReorderThe")}
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
                {t("settings:settingsDialogPresetsSection.addPreset")}</PopoverTrigger>
              <PopoverContent align="end" xstyle={styles.editorPopover}>
                <TaskPresetEditor
                  initialPreset={newPresetDraft}
                  submitLabel={t("settings:settingsDialogPresetsSection.addPreset")}
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
              {t("settings:settingsDialogPresetsSection.restoreDefaultPresets")}</Button>
          </div>

          {presets.length === 0 ? (
            <div className={sx(styles.empty)}>
              {t("settings:settingsDialogPresetsSection.noPresetsYetAddOneTo")}</div>
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
                        <AdsButton
                          variant="quiet"
                          size="xs"
                          iconOnly
                          aria-label={i18n.t("settings:settingsDialogMacrosSection.moveUp", { value1: preset.label })}
                          title={i18n.t("settings:settingsDialogPresetsSection.moveUp")}
                          disabled={moveUpDisabled}
                          onClick={() => handleMovePreset(preset.id, -1)}
                        >
                          <ChevronUp />
                        </AdsButton>
                        <AdsButton
                          variant="quiet"
                          size="xs"
                          iconOnly
                          aria-label={i18n.t("settings:settingsDialogMacrosSection.moveDown", { value1: preset.label })}
                          title={i18n.t("settings:settingsDialogPresetsSection.moveDown")}
                          disabled={moveDownDisabled}
                          onClick={() => handleMovePreset(preset.id, 1)}
                        >
                          <ChevronDown />
                        </AdsButton>
                        <PopoverTrigger
                          render={
                            <AdsButton
                              variant="quiet"
                              size="xs"
                              iconOnly
                              aria-label={i18n.t("settings:settingsDialogMacrosSection.edit", { value1: preset.label })}
                              title={i18n.t("settings:settingsDialogPresetsSection.editPreset")}
                              onClick={() =>
                                setEditorTarget({
                                  kind: "edit",
                                  presetId: preset.id,
                                })
                              }
                            />
                          }
                        >
                          <Pencil />
                        </PopoverTrigger>
                        <AdsButton
                          variant="quiet"
                          size="xs"
                          iconOnly
                          xstyle={styles.deleteButton}
                          aria-label={i18n.t("settings:settingsDialogMacrosSection.delete", { value1: preset.label })}
                          title={i18n.t("settings:settingsDialogPresetsSection.deletePreset")}
                          onClick={() => handleDeletePreset(preset.id)}
                        >
                          <Trash2 />
                        </AdsButton>
                      </div>
                    </div>
                    <PopoverContent
                      align="end"
                      xstyle={styles.editorPopover}
                    >
                      <TaskPresetEditor
                        initialPreset={preset}
                        submitLabel={i18n.t("settings:settingsDialogPresetsSection.savePreset")}
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
