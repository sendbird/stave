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
import { sx, cx } from "../aui/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import { LocalChangeReviewDialog } from "./local-change-review-dialog";
import {
  PROMPT_SURFACE_PRIMARY_FOCUS,
  PROMPT_TOOLBAR_ICON_BUTTON,
  tooltipTriggerButtonClassName,
} from "./prompt-input-toolbar-parts";
import type { PromptInputProps } from "./prompt-input.types";
import { resolvePromptInputSendLabels } from "./prompt-input-submit-labels";
import { ComposerToolbarSlot } from "./use-composer-toolbar-fit";
import { COMPOSER_SIDE_QUESTION_SLOT } from "@/lib/composer-toolbar-fit";

/**
 * The trailing end of the toolbar row: the context meter, the minimal
 * composer's review, secrets and compare controls and its send accessory,
 * Attach, and Stop or Send.
 */
export function PromptInputActions(args: {
  /**
   * Side questions are always a direct toolbar action, independent of control
   * placement: an icon button beside Attach. `null` when the task offers none.
   */
  sideQuestionControl: ReactNode;
  contextMeter: ReactNode;
  minimal: boolean;
  attachmentsEnabled: boolean;
  hasReviewControl: boolean;
  workspaceCwd: PromptInputProps["workspaceCwd"];
  reviewModelOptions: PromptInputProps["reviewModelOptions"];
  preferredReviewModelKey: PromptInputProps["preferredReviewModelKey"];
  onLocalChangeReview: PromptInputProps["onLocalChangeReview"];
  interactionsDisabled: boolean;
  secretsControl: ReactNode;
  compareControl: ReactNode;
  /** The minimal composer's control just before Send. */
  sendAccessory?: ReactNode;
  onOpenFileSelector: PromptInputProps["onOpenFileSelector"];
  isTurnActive?: boolean;
  hasDraftPayload: boolean;
  onAbort: PromptInputProps["onAbort"];
  primaryActionDisabled: boolean;
  submitMode: NonNullable<PromptInputProps["submitMode"]>;
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
    submitMode,
    steerQueueEnterAction,
    assignOnSend,
  } = args;
  const isSteerOrQueueMode = submitMode === "steer-or-queue";
  const sendLabels = resolvePromptInputSendLabels({
    submitMode,
    steerQueueEnterAction,
    assignOnSend,
  });
  return (
    <div className={sx(promptInputStyles.actionsRow)} data-composer-toolbar-actions="">
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
          {args.sendAccessory}
        </>
      ) : null}
      {args.sideQuestionControl ? (
        <ComposerToolbarSlot id={COMPOSER_SIDE_QUESTION_SLOT}>{args.sideQuestionControl}</ComposerToolbarSlot>
      ) : null}
      {args.attachmentsEnabled ? <Tooltip>
        <TooltipTrigger
          type="button"
          disabled={interactionsDisabled || !onOpenFileSelector}
          onClick={() => {
            void onOpenFileSelector?.();
          }}
          className={tooltipTriggerButtonClassName({
            size: "icon-sm",
            // One borderless icon button in both composers, beside the minimal
            // composer's own accessory controls, which match it.
            className: PROMPT_TOOLBAR_ICON_BUTTON,
          })}
          aria-label={i18n.t("composer:promptInput.ariaLabel20")}
        >
          <Paperclip className={sx(promptInputStyles.icon35)} />
        </TooltipTrigger>
        <TooltipContent side="top">{i18n.t("composer:promptInput.composerCard26")}</TooltipContent>
      </Tooltip> : null}
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
              // The one filled control in either composer.
              className: cx(
                sx(promptInputStyles.roundedMd),
                PROMPT_SURFACE_PRIMARY_FOCUS,
              ),
            })}
            disabled={primaryActionDisabled}
            aria-label={sendLabels.ariaLabel}
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
              {sendLabels.tooltip}
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
