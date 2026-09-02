import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { getModelEffortLabel } from "@/lib/providers/model-effort";
import type { Macro } from "@/lib/macros/types";
import { useAppStore } from "@/store/app.store";
import { createEmptyMacroDraft, MacroEditor } from "./macro-editor";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";

type MacroEditorTarget =
  | { kind: "edit"; macroId: string }
  | { kind: "new" }
  | null;

function describeMacro(macro: Macro) {
  const insertLabel =
    macro.insertMode === "append"
      ? "Append"
      : macro.insertMode === "prepend"
        ? "Prepend"
        : "Replace";
  if (!macro.runtime) {
    return `${insertLabel} · keeps the current model`;
  }
  const effortLabel = getModelEffortLabel({
    providerId: macro.runtime.providerId,
    model: macro.runtime.model,
    effort: macro.runtime.effort,
  });
  return [
    insertLabel,
    getProviderLabel({ providerId: macro.runtime.providerId, variant: "full" }),
    toHumanModelName({ model: macro.runtime.model }),
    effortLabel,
  ]
    .filter(Boolean)
    .join(" · ");
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

  const isAddingNew = editorTarget?.kind === "new";
  const newMacroDraft = useMemo(() => createEmptyMacroDraft(), [isAddingNew]);

  const handleSaveMacro = useCallback(
    (macro: Macro) => {
      const result = upsertMacro({ macro });
      if (!result.ok) {
        setEditorError(result.error);
        return result;
      }
      setEditorError(undefined);
      setEditorTarget(null);
      return result;
    },
    [upsertMacro],
  );

  const handleDeleteMacro = useCallback(
    (macroId: string) => {
      removeMacro({ macroId });
      setEditorTarget((current) =>
        current?.kind === "edit" && current.macroId === macroId
          ? null
          : current,
      );
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
        description="Save reusable prompts and insert them from the composer with !. Optionally pin a model and effort for that turn."
        titleAccessory={
          <Popover
            open={editorTarget?.kind === "new"}
            onOpenChange={(open) => {
              setEditorError(undefined);
              setEditorTarget(open ? { kind: "new" } : null);
            }}
          >
            <PopoverTrigger render={<Button size="sm" className="gap-1.5" />}>
              <Plus className="size-3.5" />
              Add macro
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[22rem]">
              <MacroEditor
                initialMacro={newMacroDraft}
                submitLabel="Add macro"
                error={editorError}
                onSave={handleSaveMacro}
                onCancel={() => {
                  setEditorError(undefined);
                  setEditorTarget(null);
                }}
              />
            </PopoverContent>
          </Popover>
        }
      >
        {macros.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            No macros yet. Add one to insert a saved prompt from the composer
            toolbar or by typing !.
          </div>
        ) : (
          <div className="space-y-2.5">
            {macros.map((macro, index) => {
              const isEditing =
                editorTarget?.kind === "edit" &&
                editorTarget.macroId === macro.id;
              return (
                <Popover
                  key={macro.id}
                  open={isEditing}
                  onOpenChange={(open) => {
                    if (!open) {
                      setEditorError(undefined);
                      setEditorTarget((current) =>
                        current?.kind === "edit" &&
                        current.macroId === macro.id
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
                          {macro.runtime ? (
                            <ModelIcon
                              providerId={macro.runtime.providerId}
                              model={macro.runtime.model}
                              className="size-4 text-muted-foreground"
                            />
                          ) : (
                            <Zap className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {macro.label}
                            </p>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              !{macro.slug}
                            </code>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {describeMacro(macro)}
                          </p>
                          {macro.description ? (
                            <p className="text-xs text-muted-foreground">
                              {macro.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={index === 0}
                          onClick={() => handleMoveMacro(macro.id, -1)}
                        >
                          <ChevronUp className="size-3.5" />
                          Move up
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={index === macros.length - 1}
                          onClick={() => handleMoveMacro(macro.id, 1)}
                        >
                          <ChevronDown className="size-3.5" />
                          Move down
                        </Button>
                        <PopoverTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditorError(undefined);
                                setEditorTarget({
                                  kind: "edit",
                                  macroId: macro.id,
                                });
                              }}
                            />
                          }
                        >
                          Edit
                        </PopoverTrigger>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteMacro(macro.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                  <PopoverContent align="end" className="w-[22rem]">
                    <MacroEditor
                      initialMacro={macro}
                      submitLabel="Save macro"
                      error={editorError}
                      onSave={handleSaveMacro}
                      onCancel={() => {
                        setEditorError(undefined);
                        setEditorTarget(null);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        )}
      </SettingsCard>
    </SectionStack>
  );
}
