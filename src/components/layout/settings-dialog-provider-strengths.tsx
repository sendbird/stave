import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useMemo } from "react";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sx } from "@/components/ads/utils/stylex";
import { TASK_CLASS_LABELS, type AutoRoutingProfile } from "@/lib/providers/auto-routing-profile";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import {
  DEFAULT_STRENGTH_PRESET_ID,
  getStrengthPreset,
  getStrengthSources,
  matchStrengthPreset,
  PROVIDER_STRENGTH_PRESETS,
  readProviderStrengths,
  STRENGTH_TASK_CLASSES,
  writeProviderStrengths,
  type ProviderStrengthMap,
  type StrengthConfidence,
  type StrengthEvidence,
  type StrengthProviderId,
  type StrengthTaskClass,
} from "@/lib/providers/provider-strength-presets";
import { SettingsCard, SwitchField } from "./settings-dialog.shared";
import { autoRoutingSectionStyles as styles } from "./settings-dialog-auto-routing-section.styles";

const KEEP_VALUE = "keep";
type StrengthChoice = StrengthProviderId | typeof KEEP_VALUE;
const CUSTOM_PRESET_VALUE = "__custom__";

function presetLabel(id: string) {
  switch (id) {
    case "confident": return i18n.t("providers:providerStrengths.presets.confident");
    case "evidence-2026-10": return i18n.t("providers:providerStrengths.presets.publicEvaluations");
    case "plan-build-review": return i18n.t("providers:providerStrengths.presets.planBuildReview");
    default: return id;
  }
}

const CONFIDENCE_LABELS: Readonly<Record<StrengthConfidence, string>> = {
  get low() { return i18n.t("providers:providerStrengths.confidence.low"); },
  get medium() { return i18n.t("providers:providerStrengths.confidence.medium"); },
  get high() { return i18n.t("providers:providerStrengths.confidence.high"); },
};

/**
 * Settings → Auto: which provider each kind of work starts on. A row is a
 * provider-only rule whose model follows the level; nothing is stored until
 * the user turns the table on or edits a row, and until then the table shows
 * the cautious preset as a suggestion.
 */
export function SettingsProviderStrengths(props: {
  profile: AutoRoutingProfile;
  edit: (mutate: (draft: AutoRoutingProfile) => AutoRoutingProfile) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const stored = useMemo(() => readProviderStrengths(props.profile), [props.profile]);
  const suggested = getStrengthPreset(DEFAULT_STRENGTH_PRESET_ID)!;
  const map: ProviderStrengthMap = stored.empty ? suggested.map : stored.map;
  const preset = matchStrengthPreset(map);
  const evidence = (preset ?? suggested).evidence;

  const write = (next: { map?: ProviderStrengthMap; enabled?: boolean }) =>
    props.edit((draft) =>
      writeProviderStrengths(draft, {
        map: next.map ?? map,
        enabled: next.enabled ?? stored.enabled,
      }),
    );

  const choiceOptions: ReadonlyArray<{ value: StrengthChoice; label: string }> = [
    { value: KEEP_VALUE, label: t("providers:providerStrengths.keep") },
    { value: "claude-code", label: getProviderLabel({ providerId: "claude-code" }) },
    { value: "codex", label: getProviderLabel({ providerId: "codex" }) },
  ];

  return (
    <SettingsCard
      title={t("providers:providerStrengths.title")}
      description={t("providers:providerStrengths.description")}
      titleAccessory={
        <Select
          value={preset?.id ?? CUSTOM_PRESET_VALUE}
          onValueChange={(value) => {
            const next = getStrengthPreset(value);
            if (next) write({ map: next.map });
          }}
        >
          <SelectTrigger className={sx(styles.ruleSelectTrigger)} aria-label={t("providers:providerStrengths.preset")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_STRENGTH_PRESETS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {presetLabel(entry.id)}
              </SelectItem>
            ))}
            {preset ? null : (
              <SelectItem value={CUSTOM_PRESET_VALUE} disabled>
                {t("providers:providerStrengths.custom")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      }
    >
      <SwitchField
        title={t("providers:providerStrengths.enable")}
        description={t("providers:providerStrengths.enableDescription")}
        checked={stored.enabled}
        onCheckedChange={(enabled) => write({ enabled })}
      />
      <table className={sx(styles.levelTable)} data-testid="provider-strengths">
        <thead>
          <tr>
            <th scope="col" className={sx(styles.levelHead)}>{t("providers:providerStrengths.work")}</th>
            <th scope="col" className={sx(styles.levelHead)}>{t("providers:providerStrengths.startsOn")}</th>
          </tr>
        </thead>
        <tbody>
          {STRENGTH_TASK_CLASSES.map((taskClass) => (
            <StrengthRow
              key={taskClass}
              taskClass={taskClass}
              value={map[taskClass] ?? KEEP_VALUE}
              evidence={evidence[taskClass]}
              options={choiceOptions}
              onChange={(value) => {
                const next = { ...map };
                if (value === KEEP_VALUE) delete next[taskClass];
                else next[taskClass] = value;
                write({ map: next });
              }}
            />
          ))}
        </tbody>
      </table>
      <p className={sx(styles.stanceNote)}>
        {t("providers:providerStrengths.hypothesisNote", { date: (preset ?? suggested).asOf })}
      </p>
    </SettingsCard>
  );
}

function StrengthRow(args: {
  taskClass: StrengthTaskClass;
  value: StrengthChoice;
  evidence?: StrengthEvidence;
  options: ReadonlyArray<{ value: StrengthChoice; label: string }>;
  onChange: (value: StrengthChoice) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const sources = args.evidence ? getStrengthSources(args.evidence.sourceIds) : [];
  return (
    <tr className={sx(styles.levelRow)}>
      <th scope="row" className={sx(styles.levelName)}>
        <span className={sx(styles.levelLabel)}>{TASK_CLASS_LABELS[args.taskClass]}</span>
        {args.evidence ? (
          <span className={sx(styles.levelDescription)}>
            {CONFIDENCE_LABELS[args.evidence.confidence]} · {args.evidence.rationale}{" "}
            {sources.map((source, index) => (
              <span key={source.id}>
                {index > 0 ? ", " : ""}
                <ExternalAnchor href={source.url} title={source.claim}>{source.publisher}</ExternalAnchor>
              </span>
            ))}
          </span>
        ) : null}
      </th>
      <td className={sx(styles.levelCell)}>
        <Select value={args.value} onValueChange={(value) => args.onChange(value as StrengthChoice)}>
          <SelectTrigger
            className={sx(styles.ruleSelectTrigger)}
            aria-label={t("providers:providerStrengths.rowLabel", { task: TASK_CLASS_LABELS[args.taskClass] })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {args.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}
