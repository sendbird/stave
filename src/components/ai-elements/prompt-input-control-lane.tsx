import { Fragment, type ReactNode } from "react";
import { i18n, useTranslation } from "@/i18n";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui";
import type {
  ComposerControlId,
  ComposerControlLayout,
} from "@/lib/composer-controls";
import type { ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import type { ModelVisibility } from "@/lib/providers/model-visibility";
import { ComposerControlPlacementList } from "@/components/ai-elements/prompt-input-control-menu";
import { sx, cx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import { ModelEffortSelector } from "./model-effort-selector";
import { COMPOSER_CONTROL_LANE } from "./composer-control-density";
import type { ModelSelectorOpenRequest } from "./model-selector-open-request";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * The classic composer's control lane: the Customize popover anchor, the model
 * selector, and the toolbar controls with the `⋯` tray in front of Runtime.
 * Right-clicking the lane opens Customize.
 */
export function PromptInputControlLane(args: {
  canCustomizeComposerControls: boolean;
  composerCustomizeOpen: boolean;
  setComposerCustomizeOpen: (open: boolean) => void;
  composerControlPlacements: PromptInputProps["composerControlPlacements"];
  onComposerControlPlacementsChange: PromptInputProps["onComposerControlPlacementsChange"];
  composerControlLayout: ComposerControlLayout;
  composerControlNodes: Partial<Record<ComposerControlId, ReactNode>>;
  toolbarControlIds: ComposerControlId[];
  toolbarTrayIndex: number;
  useComposerWings: boolean;
  composerOverflowTray: ReactNode;
  selectedModel: PromptInputProps["selectedModel"];
  modelOptions: PromptInputProps["modelOptions"];
  modelCatalogs: PromptInputProps["modelCatalogs"];
  modelVisibility: ModelVisibility;
  onRefreshModelCatalogs: PromptInputProps["onRefreshModelCatalogs"];
  modelPickerAgents: PromptInputProps["modelPickerAgents"];
  effortValue: PromptInputProps["effortValue"];
  effortLabel: PromptInputProps["effortLabel"];
  fastMode: PromptInputProps["fastMode"];
  onFastModeChange: PromptInputProps["onFastModeChange"];
  onModelSelect: PromptInputProps["onModelSelect"];
  interactionsDisabled: boolean;
  modelSelectorOpenNonce: number;
  modelSelectorOpenRequest: ModelSelectorOpenRequest | undefined;
  agentsOpenToken: number | undefined;
}) {
  useTranslation();
  const {
    canCustomizeComposerControls,
    composerCustomizeOpen,
    setComposerCustomizeOpen,
    composerControlPlacements,
    onComposerControlPlacementsChange,
    composerControlLayout,
    composerControlNodes,
    toolbarControlIds,
    toolbarTrayIndex,
    useComposerWings,
    composerOverflowTray,
    selectedModel,
    modelOptions,
    modelCatalogs,
    modelVisibility,
    onRefreshModelCatalogs,
    modelPickerAgents,
    effortValue,
    effortLabel,
    fastMode,
    onFastModeChange,
    onModelSelect,
    interactionsDisabled,
    modelSelectorOpenNonce,
    modelSelectorOpenRequest,
    agentsOpenToken,
  } = args;
  return (
    <div
      className={cx(
        sx(promptInputStyles.controlLane),
        COMPOSER_CONTROL_LANE.toolbar,
      )}
      data-composer-toolbar="true"
      onContextMenu={
        canCustomizeComposerControls
          ? (event) => {
              // Only claim the row's own background and the controls'
              // gaps; a right-click inside a text field keeps the
              // native menu.
              if (
                event.target instanceof HTMLElement &&
                event.target.closest("input, textarea")
              ) {
                return;
              }
              event.preventDefault();
              setComposerCustomizeOpen(true);
            }
          : undefined
      }
    >
      {canCustomizeComposerControls ? (
        <Popover
          open={composerCustomizeOpen}
          onOpenChange={setComposerCustomizeOpen}
        >
          <PopoverAnchor className={sx(promptInputStyles.customizeAnchor)} />
          <PopoverContent
            align="start"
            side="top"
            sideOffset={10}
            xstyle={promptInputStyles.customizePopover}
          >
            <PopoverTitle className={sx(promptInputStyles.customizeTitle)}>
              {i18n.t("composer:promptInput.composerCard25")}</PopoverTitle>
            <ComposerControlPlacementList
              placements={composerControlPlacements ?? {}}
              forcedIds={composerControlLayout.forced}
              onChange={(next) =>
                onComposerControlPlacementsChange?.(next)
              }
            />
          </PopoverContent>
        </Popover>
      ) : null}
      <ModelEffortSelector
        value={selectedModel}
        options={modelOptions}
        catalogs={modelCatalogs}
        modelVisibility={modelVisibility}
        onRefreshCatalogs={onRefreshModelCatalogs}
        {...(modelPickerAgents ? { agents: modelPickerAgents } : {})}
        effortValue={
          effortValue as Exclude<ModelShortcutEffort, ""> | undefined
        }
        effortLabel={effortLabel}
        fastMode={fastMode}
        showFastMode={composerControlLayout.toolbar.includes("fast")}
        disabled={interactionsDisabled}
        openToken={
          modelSelectorOpenNonce > 0
            ? modelSelectorOpenNonce
            : undefined
        }
        {...(modelSelectorOpenRequest ? { openRequest: modelSelectorOpenRequest } : {})}
        accountActions
        openAgentsToken={agentsOpenToken}
        onFastModeChange={onFastModeChange}
        onSelect={({ selection, effort, fastMode: nextFastMode }) => {
          onModelSelect({
            selection,
            effort,
            fastMode: nextFastMode,
          });
        }}
      />
      {toolbarControlIds.slice(0, toolbarTrayIndex).map((id) => (
        <Fragment key={id}>{composerControlNodes[id]}</Fragment>
      ))}
      {useComposerWings ? null : composerOverflowTray}
      {toolbarControlIds.slice(toolbarTrayIndex).map((id) => (
        <Fragment key={id}>{composerControlNodes[id]}</Fragment>
      ))}
    </div>
  );
}
