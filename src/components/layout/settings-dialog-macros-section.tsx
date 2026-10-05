import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Badge, Button } from "@/components/ui";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { getModelEffortLabel } from "@/lib/providers/model-effort";
import { isMacroInstantRun, type Macro } from "@/lib/macros/types";
import { useAppStore } from "@/store/app.store";
import { ConfirmDialog } from "./ConfirmDialog";
import { createEmptyMacroDraft, MacroEditor } from "./macro-editor";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";
import { sx } from "@/components/ads/utils/stylex";
import { macrosSectionStyles as styles } from "./settings-dialog-macros-section.styles";

type MacroEditorTarget =
  { kind: "edit"; macroId: string } | { kind: "new" } | null;

function describeMacro(macro: Macro) {
  const insertLabel =
    macro.insertMode === "append"
      ? i18n.t("settings:macroEditor.append")
      : macro.insertMode === "prepend"
        ? i18n.t("settings:macroEditor.prepend")
        : i18n.t("settings:general.soundControls.replace");
  const parts = [insertLabel];
  if (isMacroInstantRun(macro)) {
    parts.push(i18n.t("settings:settingsDialogMacrosSection.runsImmediately"));
  }
  if (!macro.runtime) {
    parts.push(i18n.t("settings:settingsDialogMacrosSection.keepsTheCurrentModel"));
    return parts.join(" · ");
  }
  const effortLabel = getModelEffortLabel({
    providerId: macro.runtime.providerId,
    model: macro.runtime.model,
    effort: macro.runtime.effort,
  });
  parts.push(
    getProviderLabel({ providerId: macro.runtime.providerId, variant: "full" }),
    toHumanModelName({ model: macro.runtime.model }),
  );
  if (effortLabel) {
    parts.push(effortLabel);
  }
  return parts.filter(Boolean).join(" · ");
}

export function MacrosSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [macros, upsertMacro, removeMacro, reorderMacros] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.macros,
          state.upsertMacro,
          state.removeMacro,
          state.reorderMacros,
        ] as const,
    ),
  );
  const [editorTarget, setEditorTarget] = useState<MacroEditorTarget>(null);
  const [editorError, setEditorError] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAddingNew = editorTarget?.kind === "new";
  const newMacroDraft = useMemo(() => createEmptyMacroDraft(), [isAddingNew]);
  const deletingMacro = macros.find((macro) => macro.id === deletingId) ?? null;

  const closeEditor = useCallback(() => {
    setEditorError(undefined);
    setEditorTarget(null);
  }, []);

  const handleSaveMacro = useCallback(
    (macro: Macro) => {
      const result = upsertMacro({ macro });
      if (!result.ok) {
        setEditorError(result.error);
        return result;
      }
      closeEditor();
      return result;
    },
    [closeEditor, upsertMacro],
  );

  const handleDeleteMacro = useCallback(
    (macroId: string) => {
      removeMacro({ macroId });
      setEditorTarget((current) =>
        current?.kind === "edit" && current.macroId === macroId
          ? null
          : current,
      );
      setDeletingId(null);
    },
    [removeMacro],
  );

  const handleMoveMacro = useCallback(
    (macroId: string, direction: -1 | 1) => {
      const currentIndex = macros.findIndex((macro) => macro.id === macroId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= macros.length) {
        return;
      }
      const orderedIds = macros.map((macro) => macro.id);
      const [moved] = orderedIds.splice(currentIndex, 1);
      if (!moved) {
        return;
      }
      orderedIds.splice(targetIndex, 0, moved);
      reorderMacros({ orderedIds });
    },
    [macros, reorderMacros],
  );

  return (
    <SectionStack>
      <SettingsCard
        title={t("settings:sections.macros.label")}
        description={t("settings:settingsDialogMacrosSection.saveReusablePromptsAndInsertThem")}
        titleAccessory={
          <Button
            type="button"
            size="sm"
            xstyle={styles.addButton}
            onClick={() => {
              setEditorError(undefined);
              setEditorTarget({ kind: "new" });
            }}
          >
            <Plus className={sx(styles.addIcon)} />
            {t("settings:settingsDialogMacrosSection.addMacro")}</Button>
        }
      >
        {isAddingNew ? (
          <div className={sx(styles.editorWrap)}>
            <MacroEditor
              initialMacro={newMacroDraft}
              submitLabel={t("settings:settingsDialogMacrosSection.addMacro")}
              error={editorError}
              onSave={handleSaveMacro}
              onCancel={closeEditor}
            />
          </div>
        ) : null}

        {macros.length === 0 && !isAddingNew ? (
          <div className={sx(styles.empty)}>
            {t("settings:settingsDialogMacrosSection.noMacrosYetAddOneTo")}</div>
        ) : macros.length === 0 ? null : (
          <div className={sx(styles.list)}>
            {macros.map((macro, index) => {
              const isEditing =
                editorTarget?.kind === "edit" &&
                editorTarget.macroId === macro.id;
              return (
                <div key={macro.id} className={sx(styles.row)}>
                  <div className={sx(styles.rowMain)}>
                    <div className={sx(styles.mark)}>
                      {macro.runtime ? (
                        <ModelIcon
                          providerId={macro.runtime.providerId}
                          model={macro.runtime.model}
                          className={sx(styles.markIcon)}
                        />
                      ) : (
                        <Zap className={sx(styles.markIcon)} />
                      )}
                    </div>
                    <div className={sx(styles.rowBody)}>
                      <div className={sx(styles.rowHead)}>
                        <p className={sx(styles.rowLabel)}>{macro.label}</p>
                        <code className={sx(styles.slugCode)}>
                          !{macro.slug}
                        </code>
                        {isMacroInstantRun(macro) ? (
                          <Badge
                            variant="secondary"
                            className={sx(styles.instantBadge)}
                          >
                            {i18n.t("settings:settingsDialogMacrosSection.instant")}</Badge>
                        ) : null}
                      </div>
                      <p className={sx(styles.rowMeta)}>
                        {describeMacro(macro)}
                      </p>
                      {macro.description ? (
                        <p className={sx(styles.rowMeta)}>
                          {macro.description}
                        </p>
                      ) : null}
                    </div>
                    <div className={sx(styles.rowActions)}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === 0}
                        aria-label={i18n.t("settings:settingsDialogMacrosSection.moveUp", { value1: macro.label })}
                        onClick={() => handleMoveMacro(macro.id, -1)}
                      >
                        <ChevronUp className={sx(styles.actionIcon)} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === macros.length - 1}
                        aria-label={i18n.t("settings:settingsDialogMacrosSection.moveDown", { value1: macro.label })}
                        onClick={() => handleMoveMacro(macro.id, 1)}
                      >
                        <ChevronDown className={sx(styles.actionIcon)} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={i18n.t("settings:settingsDialogMacrosSection.edit", { value1: macro.label })}
                        onClick={() => {
                          setEditorError(undefined);
                          setEditorTarget({
                            kind: "edit",
                            macroId: macro.id,
                          });
                        }}
                      >
                        <Pencil className={sx(styles.actionIcon)} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        xstyle={styles.deleteButton}
                        aria-label={i18n.t("settings:settingsDialogMacrosSection.delete", { value1: macro.label })}
                        onClick={() => setDeletingId(macro.id)}
                      >
                        <Trash2 className={sx(styles.actionIcon)} />
                      </Button>
                    </div>
                  </div>
                  {isEditing ? (
                    <div className={sx(styles.editorWrapInline)}>
                      <MacroEditor
                        initialMacro={macro}
                        submitLabel={i18n.t("settings:settingsDialogMacrosSection.saveMacro")}
                        error={editorError}
                        onSave={handleSaveMacro}
                        onCancel={closeEditor}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={deletingId !== null}
        title={t("settings:settingsDialogMacrosSection.deleteSavedMacro")}
        description={
          deletingMacro
            ? t("settings:settingsDialogMacrosSection.willBeRemovedFromSettingsAnd", { value1: deletingMacro.slug })
            : t("settings:settingsDialogMacrosSection.thisMacroWillBeRemovedFrom")
        }
        confirmLabel={t("settings:settingsDialogMacrosSection.deleteMacro")}
        onConfirm={() => {
          if (deletingId) {
            handleDeleteMacro(deletingId);
          }
        }}
        onCancel={() => setDeletingId(null)}
      />
    </SectionStack>
  );
}
