import { I18N_NAMESPACES, useTranslation, type I18nKey } from "@/i18n";
import type { AuxLane } from "@/lib/providers/auxiliary-inference-policy";
import type { AppSettings } from "@/store/app-settings";
import type { SectionId } from "./settings-dialog.schema";
import { SettingsSectionLink } from "./settings-dialog-section-link";

type LaneGateSettings = Pick<
  AppSettings,
  "auxiliaryInferencePolicy" | "editorAiCompletions" | "prePrReviewEnabled"
>;

/**
 * Two lanes are gated at runtime by a second, older settings key as well as
 * the lane's own `enabled` flag: pre-PR review needs `prePrReviewEnabled`
 * (TopBarOpenPR) and inline completion needs `editorAiCompletions`
 * (editor-inline-completions). Both keys stay persisted; Settings shows one
 * switch per lane that reads the effective AND and writes both keys, so the
 * value the user sees is the value the runtime uses.
 */
const LANE_EXTERNAL_GATE_KEY = {
  prePrReview: "prePrReviewEnabled",
  inlineCompletion: "editorAiCompletions",
} as const satisfies Partial<Record<AuxLane, keyof LaneGateSettings>>;

const EDITOR_ENABLEMENT_OWNER = {
  section: "editor",
  titleKey: "settingsProviders:auxiliaryInference.enablementOwner.editor.title",
  onKey: "settingsProviders:auxiliaryInference.enablementOwner.editor.on",
  offKey: "settingsProviders:auxiliaryInference.enablementOwner.editor.off",
  actionKey: "settingsProviders:auxiliaryInference.enablementOwner.editor.action",
} as const satisfies {
  section: SectionId;
  titleKey: I18nKey;
  onKey: I18nKey;
  offKey: I18nKey;
  actionKey: I18nKey;
};

/** Lanes whose on/off switch lives in another section; Background AI links there. */
const AUX_LANE_ENABLEMENT_OWNER: Partial<
  Record<AuxLane, typeof EDITOR_ENABLEMENT_OWNER>
> = {
  inlineCompletion: EDITOR_ENABLEMENT_OWNER,
};

export function hasExternalAuxLaneEnablementOwner(lane: AuxLane): boolean {
  return AUX_LANE_ENABLEMENT_OWNER[lane] !== undefined;
}

function externalGateKey(lane: AuxLane) {
  return (LANE_EXTERNAL_GATE_KEY as Partial<Record<AuxLane, keyof LaneGateSettings>>)[lane];
}

/** Effective on/off for a lane, as the runtime evaluates it. Returns a primitive. */
export function selectAuxLaneEnabled(settings: LaneGateSettings, lane: AuxLane): boolean {
  const key = externalGateKey(lane);
  const laneEnabled = settings.auxiliaryInferencePolicy[lane]?.enabled ?? false;
  return key ? laneEnabled && settings[key] === true : laneEnabled;
}

/** Settings patch that turns a lane on or off through every key that gates it. */
export function buildAuxLaneEnablementPatch(args: {
  settings: LaneGateSettings;
  lane: AuxLane;
  enabled: boolean;
}): Partial<AppSettings> {
  const policy = args.settings.auxiliaryInferencePolicy;
  const key = externalGateKey(args.lane);
  return {
    auxiliaryInferencePolicy: {
      ...policy,
      [args.lane]: { ...policy[args.lane], enabled: args.enabled },
    },
    ...(key ? { [key]: args.enabled } : {}),
  };
}

/** Replaces the lane switch in Background AI when another section owns it. */
export function AuxLaneEnablementLink(args: {
  lane: AuxLane;
  enabled: boolean;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const owner = AUX_LANE_ENABLEMENT_OWNER[args.lane];
  if (!owner) {
    return null;
  }
  return (
    <SettingsSectionLink
      title={t(owner.titleKey)}
      description={args.enabled ? t(owner.onKey) : t(owner.offKey)}
      actionLabel={t(owner.actionKey)}
      target={owner.section}
      onNavigateSection={args.onNavigateSection}
    />
  );
}
