import { I18N_NAMESPACES, useTranslation, type I18nKey } from "@/i18n";
import {
  isFeatureSwitchedAuxLane,
  type AuxLane,
  type FeatureSwitchedAuxLane,
} from "@/lib/providers/auxiliary-inference-policy";
import type { AppSettings } from "@/store/app-settings";
import type { SectionId } from "./settings-dialog.schema";
import { SettingsSectionLink } from "./settings-dialog-section-link";

type LaneSwitchSettings = Pick<
  AppSettings,
  "auxiliaryInferencePolicy" | "editorAiCompletions"
>;

/**
 * Each lane has exactly one switch. Most lanes use their own `enabled` in
 * `auxiliaryInferencePolicy`; a feature-switched lane uses the feature setting
 * named here and its lane config has no `enabled`.
 */
const FEATURE_SWITCH_KEY = {
  inlineCompletion: "editorAiCompletions",
} as const satisfies Record<FeatureSwitchedAuxLane, keyof LaneSwitchSettings>;

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

/** On/off for a lane, as the runtime evaluates it. Returns a primitive. */
export function selectAuxLaneEnabled(settings: LaneSwitchSettings, lane: AuxLane): boolean {
  if (isFeatureSwitchedAuxLane(lane)) {
    return settings[FEATURE_SWITCH_KEY[lane]] === true;
  }
  return settings.auxiliaryInferencePolicy[lane]?.enabled ?? false;
}

/** Settings patch that turns a lane on or off through its one switch. */
export function buildAuxLaneEnablementPatch(args: {
  settings: LaneSwitchSettings;
  lane: AuxLane;
  enabled: boolean;
}): Partial<AppSettings> {
  if (isFeatureSwitchedAuxLane(args.lane)) {
    return { [FEATURE_SWITCH_KEY[args.lane]]: args.enabled };
  }
  const policy = args.settings.auxiliaryInferencePolicy;
  return {
    auxiliaryInferencePolicy: {
      ...policy,
      [args.lane]: { ...policy[args.lane], enabled: args.enabled },
    },
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
