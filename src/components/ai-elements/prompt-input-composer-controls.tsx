import type { ReactNode } from "react";
import { i18n } from "@/i18n";
import { Brain } from "lucide-react";
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
  PopoverTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import type { ComposerControlId } from "@/lib/composer-controls";
import { sx, cx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import { PromptInputRunAccountPoolControl } from "./prompt-input-run-account-pool";
import { PromptInputProviderModePill } from "./prompt-input-provider-mode";
import {
  PromptInputRuntimeBar,
  type PromptInputRuntimeProfile,
} from "./prompt-input-runtime-bar";
import { LocalChangeReviewDialog } from "./local-change-review-dialog";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "./composer-control-density";
import {
  PROMPT_TOOLBAR_ICON_BUTTON,
  PromptInputRuntimeTriggerIcon,
  getPromptToolbarAccentStyle,
  getRuntimeProfileToneStyle,
  tooltipTriggerButtonClassName,
} from "./prompt-input-toolbar-parts";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * The node each placeable composer control renders this frame, or `null` when
 * the session cannot offer it. A plain function rather than a component: the
 * same nodes are routed to the toolbar, the wings, the status tray and the
 * overflow menu by the caller.
 */
export function renderComposerControlNodes(args: {
  runAccountPool: PromptInputProps["runAccountPool"];
  providerModeStatus: PromptInputProps["providerModeStatus"];
  providerModePresets: PromptInputProps["providerModePresets"];
  activeProviderModePresetId: PromptInputProps["activeProviderModePresetId"];
  onProviderModeSelect: PromptInputProps["onProviderModeSelect"];
  interactionsDisabled: boolean;
  thinkingMode: PromptInputProps["thinkingMode"];
  onThinkingModeChange: PromptInputProps["onThinkingModeChange"];
  hasReviewControl: boolean;
  workspaceCwd: PromptInputProps["workspaceCwd"];
  reviewModelOptions: PromptInputProps["reviewModelOptions"];
  preferredReviewModelKey: PromptInputProps["preferredReviewModelKey"];
  onLocalChangeReview: PromptInputProps["onLocalChangeReview"];
  secretsControl: ReactNode;
  macroControl: ReactNode;
  compareControl: ReactNode;
  hasRuntimeContent: boolean;
  isMobile: boolean;
  composerIconButtonSize: "icon-sm" | "icon";
  runtimeProfile: PromptInputRuntimeProfile;
  runtimeStatusItems: PromptInputProps["runtimeStatusItems"];
}): Partial<Record<ComposerControlId, ReactNode>> {
  const {
    runAccountPool,
    providerModeStatus,
    providerModePresets,
    activeProviderModePresetId,
    onProviderModeSelect,
    interactionsDisabled,
    thinkingMode,
    onThinkingModeChange,
    hasReviewControl,
    workspaceCwd,
    reviewModelOptions,
    preferredReviewModelKey,
    onLocalChangeReview,
    secretsControl,
    macroControl,
    compareControl,
    hasRuntimeContent,
    isMobile,
    composerIconButtonSize,
    runtimeProfile,
    runtimeStatusItems,
  } = args;
  return {
    runAccountPool: runAccountPool ? <PromptInputRunAccountPoolControl pool={runAccountPool} /> : null,
    providerMode: providerModeStatus ? (
      <PromptInputProviderModePill
        status={providerModeStatus}
        presets={providerModePresets ?? []}
        activePresetId={activeProviderModePresetId ?? null}
        onSelect={onProviderModeSelect}
        disabled={interactionsDisabled}
      />
    ) : null,
    thinking: onThinkingModeChange ? (
      <Tooltip>
        <TooltipTrigger
          type="button"
          disabled={interactionsDisabled}
          aria-label={i18n.t("composer:promptInput.ariaLabel7", { value1: thinkingMode ?? "adaptive" })}
          onClick={() => {
            const cycle = {
              adaptive: "enabled",
              enabled: "disabled",
              disabled: "adaptive",
            } as const;
            onThinkingModeChange(cycle[thinkingMode ?? "adaptive"]);
          }}
          {...composerControlAttributes}
          className={tooltipTriggerButtonClassName({
            className: cx(
              COMPOSER_CONTROL_BUTTON,
              sx(
                thinkingMode === "enabled"
                  ? getPromptToolbarAccentStyle("thinking")
                  : thinkingMode === "disabled"
                    ? promptInputStyles.toneMutedHalf
                    : undefined,
                interactionsDisabled && promptInputStyles.cursorDisabled,
              ),
            ),
          })}
        >
          <Brain
            className={sx(
              promptInputStyles.icon4,
              thinkingMode === "adaptive" && promptInputStyles.iconThinking,
            )}
          />
          <ComposerControlLabel>
            <span>{i18n.t("composer:promptInput.thinking")}</span>
          </ComposerControlLabel>
        </TooltipTrigger>
        <TooltipContent side="top">{i18n.t("composer:promptInput.thinking2", { value1: thinkingMode ?? "adaptive" })}</TooltipContent>
      </Tooltip>
    ) : null,
    review: hasReviewControl ? (
      <LocalChangeReviewDialog
        workspaceCwd={workspaceCwd}
        reviewerOptions={reviewModelOptions ?? []}
        preferredReviewerKey={preferredReviewModelKey}
        disabled={interactionsDisabled}
        onSubmit={onLocalChangeReview!}
      />
    ) : null,
    secrets: secretsControl,
    macro: macroControl,
    compare: compareControl,
    runtime: hasRuntimeContent ? (
      isMobile ? (
        <Drawer swipeDirection="down" showSwipeHandle>
          <DrawerTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size={composerIconButtonSize}
                disabled={interactionsDisabled}
                {...composerControlAttributes}
                className={PROMPT_TOOLBAR_ICON_BUTTON}
                aria-label={i18n.t("composer:promptInput.ariaLabel8", { value1: runtimeProfile.label })}
                title={i18n.t("composer:promptInput.title")}
              />
            }
          >
            <PromptInputRuntimeTriggerIcon profile={runtimeProfile} />
            <ComposerControlLabel wingOnly>{i18n.t("composer:promptInput.runtime")}</ComposerControlLabel>
          </DrawerTrigger>
          <DrawerContent className={sx(promptInputStyles.drawerContent)}>
            <DrawerHeader className={sx(promptInputStyles.drawerHeader)}>
              <div className={sx(promptInputStyles.rowBaseline)}>
                <DrawerTitle className={sx(promptInputStyles.titleBase)}>
                  {i18n.t("composer:promptInput.runtime2")}</DrawerTitle>
                <span
                  className={sx(
                    promptInputStyles.toneLabel,
                    getRuntimeProfileToneStyle(runtimeProfile.tone),
                  )}
                >
                  {runtimeProfile.label}
                </span>
              </div>
              <DrawerDescription>{i18n.t("composer:promptInput.sentence30", { value1: runtimeProfile.description })}</DrawerDescription>
            </DrawerHeader>
            <div className={sx(promptInputStyles.drawerScroll)}>
              <PromptInputRuntimeBar statusItems={runtimeStatusItems} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size={composerIconButtonSize}
                disabled={interactionsDisabled}
                {...composerControlAttributes}
                className={PROMPT_TOOLBAR_ICON_BUTTON}
                aria-label={i18n.t("composer:promptInput.ariaLabel9", { value1: runtimeProfile.label })}
                title={i18n.t("composer:promptInput.title2")}
              />
            }
          >
            <PromptInputRuntimeTriggerIcon profile={runtimeProfile} />
            <ComposerControlLabel wingOnly>{i18n.t("composer:promptInput.runtime4")}</ComposerControlLabel>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={10}
            // The panel is edge to edge by request, not by fighting the
            // surface's padding from the outside: the header and every runtime
            // section draw their own `space16` gutter and their rules run to
            // the border. `xstyle`, not `className`, because only `xstyle`
            // merges into the popover's own `stylex.props` call.
            density="flush"
            xstyle={promptInputStyles.runtimePopover}
          >
            <div className={sx(promptInputStyles.runtimePopoverHeader)}>
              <div className={sx(promptInputStyles.rowBaseline)}>
                <PopoverTitle className={sx(promptInputStyles.titleBase)}>
                  {i18n.t("composer:promptInput.runtime5")}</PopoverTitle>
                <span
                  className={sx(
                    promptInputStyles.toneLabel,
                    getRuntimeProfileToneStyle(runtimeProfile.tone),
                  )}
                >
                  {runtimeProfile.label}
                </span>
              </div>
              <PopoverDescription className={sx(promptInputStyles.mt1)}>{i18n.t("composer:promptInput.sentence31", { value1: runtimeProfile.description })}</PopoverDescription>
            </div>
            <PromptInputRuntimeBar statusItems={runtimeStatusItems} />
          </PopoverContent>
        </Popover>
      )
    ) : null,
  };
}
