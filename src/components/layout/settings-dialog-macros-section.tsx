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
      ? "Append"
      : macro.insertMode === "prepend"
        ? "Prepend"
        : "Replace";
  const parts = [insertLabel];
  if (isMacroInstantRun(macro)) {
    parts.push("runs immediately");
  }
  if (!macro.runtime) {
    parts.push("keeps the current model");
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
        title="Macros"
        description="Save reusable prompts and insert them from the composer with !. Optionally pin a model, or send the prompt as soon as the macro is applied."
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
            Add macro
          </Button>
        }
      >
        {isAddingNew ? (
          <div className={sx(styles.editorWrap)}>
            <MacroEditor
              initialMacro={newMacroDraft}
              submitLabel="Add macro"
              error={editorError}
              onSave={handleSaveMacro}
              onCancel={closeEditor}
            />
          </div>
        ) : null}

        {macros.length === 0 && !isAddingNew ? (
          <div className={sx(styles.empty)}>
            No macros yet. Add one to insert a saved prompt from the composer
            toolbar or by typing !.
          </div>
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
                            Instant
                          </Badge>
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
                        aria-label={`Move ${macro.label} up`}
                        onClick={() => handleMoveMacro(macro.id, -1)}
                      >
                        <ChevronUp className={sx(styles.actionIcon)} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === macros.length - 1}
                        aria-label={`Move ${macro.label} down`}
                        onClick={() => handleMoveMacro(macro.id, 1)}
                      >
                        <ChevronDown className={sx(styles.actionIcon)} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Edit ${macro.label}`}
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
                        aria-label={`Delete ${macro.label}`}
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
                        submitLabel="Save macro"
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
        title="Delete saved macro?"
        description={
          deletingMacro
            ? `!${deletingMacro.slug} will be removed from Settings and the composer.`
            : "This macro will be removed from Settings and the composer."
        }
        confirmLabel="Delete macro"
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
