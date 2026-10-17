import type { ReactNode } from "react";
import { i18n, useTranslation } from "@/i18n";
import { Paperclip, Send, Square } from "lucide-react";
import {
  Kbd,
  KbdGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import type { SteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
import { sx, cx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import { LocalChangeReviewDialog } from "./local-change-review-dialog";
import {
  PROMPT_SURFACE_PRIMARY_FOCUS,
  PROMPT_TOOLBAR_ICON_BUTTON,
  tooltipTriggerButtonClassName,
} from "./prompt-input-toolbar-parts";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * The trailing end of the toolbar row: the context meter, the minimal
 * composer's review, secrets and compare controls, Attach, and Stop or Send.
 */
export function PromptInputActions(args: {
  contextMeter: ReactNode;
  minimal: boolean;
  hasReviewControl: boolean;
  workspaceCwd: PromptInputProps["workspaceCwd"];
  reviewModelOptions: PromptInputProps["reviewModelOptions"];
  preferredReviewModelKey: PromptInputProps["preferredReviewModelKey"];
  onLocalChangeReview: PromptInputProps["onLocalChangeReview"];
  interactionsDisabled: boolean;
  secretsControl: ReactNode;
  compareControl: ReactNode;
  onOpenFileSelector: PromptInputProps["onOpenFileSelector"];
  isTurnActive?: boolean;
  hasDraftPayload: boolean;
  onAbort: PromptInputProps["onAbort"];
  primaryActionDisabled: boolean;
  isSteerOrQueueMode: boolean;
  isQueueNextMode: boolean;
  steerQueueEnterAction: SteerQueueEnterAction;
  assignOnSend?: boolean;
}) {
  useTranslation();
  const {
    contextMeter,
    minimal,
    hasReviewControl,
    workspaceCwd,
    reviewModelOptions,
    preferredReviewModelKey,
    onLocalChangeReview,
    interactionsDisabled,
    secretsControl,
    compareControl,
    onOpenFileSelector,
    isTurnActive,
    hasDraftPayload,
    onAbort,
    primaryActionDisabled,
    isSteerOrQueueMode,
    isQueueNextMode,
    steerQueueEnterAction,
    assignOnSend,
  } = args;
  return (
    <div className={sx(promptInputStyles.actionsRow)}>
      {contextMeter}
      {minimal && hasReviewControl && onLocalChangeReview ? (
        <LocalChangeReviewDialog
          workspaceCwd={workspaceCwd}
          reviewerOptions={reviewModelOptions ?? []}
          preferredReviewerKey={preferredReviewModelKey}
          disabled={interactionsDisabled}
          onSubmit={onLocalChangeReview}
        />
      ) : null}
      {minimal ? (
        <>
          {secretsControl}
          {compareControl}
        </>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          type="button"
          disabled={interactionsDisabled || !onOpenFileSelector}
          onClick={() => {
            void onOpenFileSelector?.();
          }}
          className={tooltipTriggerButtonClassName({
            size: "icon-sm",
            className: cx(
              PROMPT_TOOLBAR_ICON_BUTTON,
              minimal
                ? sx(promptInputStyles.attachButtonMinimal)
                : undefined,
            ),
          })}
          aria-label={i18n.t("composer:promptInput.ariaLabel20")}
        >
          <Paperclip className={sx(promptInputStyles.icon35)} />
        </TooltipTrigger>
        <TooltipContent side="top">{i18n.t("composer:promptInput.composerCard26")}</TooltipContent>
      </Tooltip>
      {isTurnActive && !hasDraftPayload ? (
        <Tooltip>
          <TooltipTrigger
            type="button"
            className={tooltipTriggerButtonClassName({
              size: "icon-sm",
              className: cx(
                PROMPT_TOOLBAR_ICON_BUTTON,
                sx(
                  promptInputStyles.stopButton,
                  minimal && promptInputStyles.stopButtonMinimal,
                ),
              ),
            })}
            aria-label={i18n.t("composer:promptInput.ariaLabel21")}
            onClick={() => onAbort?.()}
          >
            <Square className={sx(promptInputStyles.iconSquare)} />
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className={sx(promptInputStyles.inlineGap1)}>
              {i18n.t("composer:promptInput.composerCard27")}<KbdGroup>
                <Kbd>Esc</Kbd>
              </KbdGroup>
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            type="submit"
            className={tooltipTriggerButtonClassName({
              variant: "default",
              size: "icon-sm",
              className: cx(
                sx(promptInputStyles.roundedMd),
                PROMPT_SURFACE_PRIMARY_FOCUS,
                minimal
                  ? sx(promptInputStyles.sendButtonMinimal)
                  : undefined,
              ),
            })}
            disabled={primaryActionDisabled}
            aria-label={
              isSteerOrQueueMode
                ? steerQueueEnterAction === "steer"
                  ? i18n.t("composer:promptInput.ariaLabel22")
                  : i18n.t("composer:promptInput.ariaLabel23")
                : isQueueNextMode
                  ? i18n.t("composer:promptInput.ariaLabel24")
                  : assignOnSend
                    ? i18n.t("composer:promptInput.ariaLabel25")
                    : i18n.t("composer:promptInput.ariaLabel26")
            }
          >
            <Send className={sx(promptInputStyles.icon35)} />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className={
              isSteerOrQueueMode
                ? sx(promptInputStyles.tooltipColStart)
                : undefined
            }
          >
            <span className={sx(promptInputStyles.inlineGap1)}>
              {isSteerOrQueueMode
                ? steerQueueEnterAction === "steer"
                  ? i18n.t("composer:promptInput.composerCard28")
                  : i18n.t("composer:promptInput.composerCard29")
                : isQueueNextMode
                  ? i18n.t("composer:promptInput.composerCard30")
                  : assignOnSend
                    ? i18n.t("composer:promptInput.composerCard31")
                    : i18n.t("composer:promptInput.composerCard32")}
              <KbdGroup>
                <Kbd>↵</Kbd>
              </KbdGroup>
            </span>
            {isSteerOrQueueMode ? (
              <span className={sx(promptInputStyles.inlineGapBg70)}>
                {steerQueueEnterAction === "steer" ? i18n.t("composer:promptInput.composerCard33") : i18n.t("composer:promptInput.composerCard34")}
                <KbdGroup>
                  <Kbd>Tab</Kbd>
                </KbdGroup>
              </span>
            ) : null}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
