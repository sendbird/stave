import type { ModelSelectorOption } from "./model-selector.utils";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import {
  CURSOR_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import type { AppSettings } from "@/store/app-settings";

export function readCursorComposerSettings(args: {
  settings: AppSettings;
  model: string;
}) {
  const settings = applyModelRuntimePreference({
    settings: args.settings,
    providerId: "cursor",
    model: args.model,
  });
  return {
    effort: settings.cursorEffort,
    fastMode: settings.cursorFastMode,
  };
}

export function resolveCursorComposerControls(args: {
  selectedModel: ModelSelectorOption;
  effortValue?: string;
  effortLabel?: string;
  fastMode?: boolean;
  storeEffort: string;
  storeFastMode: boolean;
}) {
  if (args.selectedModel.isAuto || args.selectedModel.providerId !== "cursor") {
    return {
      effortValue: args.effortValue,
      effortLabel: args.effortLabel,
      fastMode: args.fastMode,
    };
  }
  const effortValue = args.effortValue ?? args.storeEffort;
  return {
    effortValue,
    effortLabel:
      args.effortLabel ?? findOptionLabel(CURSOR_EFFORT_OPTIONS, effortValue),
    fastMode: args.fastMode ?? args.storeFastMode,
  };
}

export function shouldPersistCursorComposerSelection(args: {
  providerId: ModelSelectorOption["providerId"];
  effort?: string;
  fastMode?: boolean;
}) {
  return (
    args.providerId === "cursor" &&
    Boolean(args.effort || args.fastMode !== undefined)
  );
}
