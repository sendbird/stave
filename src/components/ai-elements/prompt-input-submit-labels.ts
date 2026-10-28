import { i18n } from "@/i18n";
import type { SteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
import type { PromptInputProps } from "./prompt-input.types";

type PromptInputSubmitMode = NonNullable<PromptInputProps["submitMode"]>;

/** The send button's accessible name and the tooltip line beside its ↵ key. */
export function resolvePromptInputSendLabels(args: {
  submitMode: PromptInputSubmitMode;
  steerQueueEnterAction: SteerQueueEnterAction;
  assignOnSend?: boolean;
}): { ariaLabel: string; tooltip: string } {
  switch (args.submitMode) {
    case "redirect-steer":
      return {
        ariaLabel: i18n.t("composer:promptInput.approvalRedirectSteer"),
        tooltip: i18n.t("composer:promptInput.approvalRedirectSteer"),
      };
    case "redirect-queue":
      return {
        ariaLabel: i18n.t("composer:promptInput.approvalRedirectQueue"),
        tooltip: i18n.t("composer:promptInput.approvalRedirectQueue"),
      };
    case "steer-or-queue":
      return args.steerQueueEnterAction === "steer"
        ? {
            ariaLabel: i18n.t("composer:promptInput.ariaLabel22"),
            tooltip: i18n.t("composer:promptInput.composerCard28"),
          }
        : {
            ariaLabel: i18n.t("composer:promptInput.ariaLabel23"),
            tooltip: i18n.t("composer:promptInput.composerCard29"),
          };
    case "queue-next":
      return {
        ariaLabel: i18n.t("composer:promptInput.ariaLabel24"),
        tooltip: i18n.t("composer:promptInput.composerCard30"),
      };
    case "send":
      return args.assignOnSend
        ? {
            ariaLabel: i18n.t("composer:promptInput.ariaLabel25"),
            tooltip: i18n.t("composer:promptInput.composerCard31"),
          }
        : {
            ariaLabel: i18n.t("composer:promptInput.ariaLabel26"),
            tooltip: i18n.t("composer:promptInput.composerCard32"),
          };
  }
}
