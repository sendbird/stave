import type { I18nKey } from "@/i18n";
import type { AuxLane } from "@/lib/providers/auxiliary-inference-policy";

/** Copy for each Background AI lane, shared by its switch card and its override. */
export const AUX_LANE_COPY_KEYS = {
  intentGuard: {
    title: "settingsProviders:auxiliaryInference.lanes.intentGuard.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.intentGuard.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.intentGuard.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.intentGuard.modelDescription",
  },
  turnSummary: {
    title: "settingsProviders:auxiliaryInference.lanes.turnSummary.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.turnSummary.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.turnSummary.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.turnSummary.modelDescription",
  },
  taskName: {
    title: "settingsProviders:auxiliaryInference.lanes.taskName.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.taskName.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.taskName.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.taskName.modelDescription",
  },
  utility: {
    title: "settingsProviders:auxiliaryInference.lanes.utility.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.utility.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.utility.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.utility.modelDescription",
  },
  prDescription: {
    title: "settingsProviders:auxiliaryInference.lanes.prDescription.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.prDescription.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.prDescription.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.prDescription.modelDescription",
  },
  prePrReview: {
    title: "settingsProviders:auxiliaryInference.lanes.prePrReview.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.prePrReview.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.prePrReview.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.prePrReview.modelDescription",
  },
  inlineCompletion: {
    title: "settingsProviders:auxiliaryInference.lanes.inlineCompletion.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.inlineCompletion.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.inlineCompletion.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.inlineCompletion.modelDescription",
  },
} as const satisfies Record<
  AuxLane,
  {
    title: I18nKey;
    switchTitle: I18nKey;
    description: I18nKey;
    modelDescription: I18nKey;
  }
>;
