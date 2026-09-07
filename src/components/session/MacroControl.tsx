import { useState } from "react";
import { Plus, Zap } from "lucide-react";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { MacroEditor } from "@/components/layout/macro-editor";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui";
import { createEmptyMacroDraft } from "@/lib/macros/editor";
import { isMacroInstantRun, type Macro } from "@/lib/macros/types";
import { sx } from "@/components/ads/utils/stylex";
import { macroControlStyles as styles } from "./macro-control.styles";

interface MacroControlProps {
  macros: readonly Macro[];
  currentDraftText: string;
  modelOptions: readonly ModelSelectorOption[];
  disabled?: boolean;
  onSelect: (macro: Macro) => void;
  onSave: (macro: Macro) => { ok: boolean; error?: string };
}

export function MacroControl(args: MacroControlProps) {
  const [newMacroDraft, setNewMacroDraft] = useState<Macro | null>(null);
  const canSaveCurrentPrompt = args.currentDraftText.trim().length > 0;

  function handleSave(macro: Macro) {
    const result = args.onSave(macro);
    if (result.ok) {
      setNewMacroDraft(null);
    }
    return result;
  }

  return (
    <Popover
      open={newMacroDraft !== null}
      onOpenChange={(open) => {
        if (!open) {
          setNewMacroDraft(null);
        }
      }}
    >
      <PopoverAnchor
        render={
          <div className="flex h-full" />
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={COMPOSER_CONTROL_BUTTON}
                {...composerControlAttributes}
                data-macro-control="true"
                disabled={args.disabled}
                aria-label="Insert a saved macro"
                title="Insert a saved macro"
              />
            }
          >
            <Zap />
            <ComposerControlLabel>Macros</ComposerControlLabel>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className={sx(styles.content)}
            // Keep focus from returning outside the editor Popover opened by
            // the final menu item.
            finalFocus={false}
          >
            <DropdownMenuLabel className={sx(styles.label)}>
              <Zap className={sx(styles.labelIcon)} />
              Insert a macro
            </DropdownMenuLabel>
            {args.macros.length === 0 ? (
              <p className={sx(styles.empty)}>
                No macros yet. Save the current prompt or add one in Settings →
                Macros.
              </p>
            ) : (
              args.macros.map((macro) => (
                <DropdownMenuItem
                  key={macro.id}
                  onClick={() => args.onSelect(macro)}
                  className={sx(styles.item)}
                >
                  <span className={sx(styles.itemBody)}>
                    <span className={sx(styles.itemTitleRow)}>
                      <span className={sx(styles.itemTitle)}>{macro.label}</span>
                      <code className={sx(styles.itemSlug)}>!{macro.slug}</code>
                      {isMacroInstantRun(macro) ? (
                        <span className={sx(styles.itemInstant)}>Instant</span>
                      ) : null}
                    </span>
                    {macro.description ? (
                      <span className={sx(styles.itemDescription)}>
                        {macro.description}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canSaveCurrentPrompt}
              onSelect={() => {
                setNewMacroDraft(
                  createEmptyMacroDraft({ body: args.currentDraftText }),
                );
              }}
            >
              <Plus className="size-4" />
              Save current prompt as macro…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PopoverAnchor>
      {newMacroDraft ? (
        <PopoverContent
          align="start"
          sideOffset={6}
          className="max-h-(--available-height) w-[22rem] overflow-y-auto"
        >
          <PopoverHeader>
            <PopoverTitle>Save current prompt as macro</PopoverTitle>
            <PopoverDescription>
              Name this prompt so you can insert it again from the composer.
            </PopoverDescription>
          </PopoverHeader>
          <MacroEditor
            initialMacro={newMacroDraft}
            modelOptions={args.modelOptions}
            submitLabel="Save macro"
            onSave={handleSave}
            onCancel={() => setNewMacroDraft(null)}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
