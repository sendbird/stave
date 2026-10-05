import { i18n } from "@/i18n/runtime";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { PromptDraftQueuedTurn } from "@/types/chat";
import type { ModelSelectorOption } from "./model-selector.utils";

type QueuedTurnTarget = Pick<
  PromptDraftQueuedTurn,
  "providerId" | "model" | "autoRouting"
>;
type ComposerSelection = Pick<
  ModelSelectorOption,
  "providerId" | "model" | "label" | "isAuto"
>;

function normalizeModelId(model?: string) {
  return model?.trim().toLowerCase() ?? "";
}

function findModelOptionLabel(args: {
  providerId: ProviderId;
  model: string;
  modelOptions?: readonly Pick<
    ModelSelectorOption,
    "providerId" | "model" | "label"
  >[];
}) {
  const model = normalizeModelId(args.model);
  return (
    args.modelOptions?.find(
      (option) =>
        option.providerId === args.providerId &&
        normalizeModelId(option.model) === model,
    )?.label ??
    (model === "" || model === "auto"
      ? i18n.t("composer:promptInputQueuedTurn.findModelOptionLabel")
      : toHumanModelName({ model: args.model }))
  );
}

export function formatQueuedTurnTargetLabel(args: {
  queuedTurn: QueuedTurnTarget;
  modelOptions?: readonly Pick<
    ModelSelectorOption,
    "providerId" | "model" | "label"
  >[];
}) {
  if (args.queuedTurn.autoRouting) {
    return "Stave Auto";
  }
  if (!args.queuedTurn.providerId) {
    return null;
  }
  const providerLabel = getProviderLabel({
    providerId: args.queuedTurn.providerId,
  });
  const modelLabel = findModelOptionLabel({
    providerId: args.queuedTurn.providerId,
    model: args.queuedTurn.model ?? "",
    modelOptions: args.modelOptions,
  });
  return `${providerLabel} ${modelLabel}`;
}

export function formatComposerSelectionLabel(args: {
  selection: ComposerSelection;
}) {
  if (args.selection.isAuto) {
    return "Stave Auto";
  }
  const providerLabel = getProviderLabel({
    providerId: args.selection.providerId,
  });
  return `${providerLabel} ${args.selection.label}`;
}

export function queuedTurnMismatchesComposer(args: {
  queuedTurn: QueuedTurnTarget;
  selection: ComposerSelection;
}) {
  if (args.queuedTurn.autoRouting) {
    return args.selection.isAuto !== true;
  }
  if (!args.queuedTurn.providerId) {
    return false;
  }
  if (args.selection.isAuto) {
    return true;
  }
  return (
    args.queuedTurn.providerId !== args.selection.providerId ||
    normalizeModelId(args.queuedTurn.model) !==
      normalizeModelId(args.selection.model)
  );
}

export function describeQueuedTurnDispatch(args: {
  queuedTurn: QueuedTurnTarget;
  selection: ComposerSelection;
  modelOptions?: readonly Pick<
    ModelSelectorOption,
    "providerId" | "model" | "label"
  >[];
}) {
  const targetLabel = formatQueuedTurnTargetLabel({
    queuedTurn: args.queuedTurn,
    modelOptions: args.modelOptions,
  });
  const composerLabel = formatComposerSelectionLabel({
    selection: args.selection,
  });
  const mismatchesComposer = queuedTurnMismatchesComposer({
    queuedTurn: args.queuedTurn,
    selection: args.selection,
  });
  const caption = targetLabel
    ? mismatchesComposer
      ? i18n.t("composer:promptInputQueuedTurn.caption", { value1: targetLabel, value2: composerLabel })
      : i18n.t("composer:promptInputQueuedTurn.caption2", { value1: targetLabel })
    : i18n.t("composer:promptInputQueuedTurn.caption3");
  return {
    targetLabel,
    composerLabel,
    mismatchesComposer,
    caption,
  };
}
