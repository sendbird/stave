import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useMemo, type ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLAUDE_EFFORT_OPTIONS,
  CURSOR_EFFORT_OPTIONS,
  KIRO_EFFORT_OPTIONS,
  listCodexEffortOptionsForModel,
} from "@/lib/providers/runtime-option-contract";
import {
  ScopedFieldStatus,
  useScopedSetting,
  useScopedSettingsWriter,
} from "../settings-scope";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  DraftInput,
  LabeledField,
  SettingsFieldGuide,
} from "../settings-dialog.shared";
import {
  buildGuideExamples,
  buildGuideItems,
  CLAUDE_EFFORT_HELP,
  CODEX_REASONING_EFFORT_HELP,
} from "../settings-dialog-effort-help";

/**
 * Default model + effort controls owned by Settings > Models. Each provider
 * gets one row: model on the left, effort on the right. Providers links here
 * instead of repeating them; task composers and presets still override the
 * defaults for their own scope.
 */

export function ModelEffortRow(args: { model: ReactNode; effort: ReactNode }) {
  return (
    <div className={sx(styles.modelEffortRow)}>
      <div className={sx(styles.modelEffortModel)}>{args.model}</div>
      <div className={sx(styles.modelEffortEffort)}>{args.effort}</div>
    </div>
  );
}

function EffortSelect<T extends string>(args: {
  value: T;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  return (
    <Select value={args.value} onValueChange={(value) => args.onChange(value as T)}>
      <SelectTrigger className={sx(styles.selectTrigger)} aria-label={args.ariaLabel}>
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
  );
}

export function ClaudeEffortGuide() {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <SettingsFieldGuide
      title={t("settingsProviders:providersSection.claudeRuntime.effort.guide.title")}
      summary={t("settingsProviders:providersSection.claudeRuntime.effort.guide.summary")}
      items={buildGuideItems(CLAUDE_EFFORT_HELP)}
      examples={buildGuideExamples(CLAUDE_EFFORT_HELP)}
      tooltip={t("settingsProviders:providersSection.claudeRuntime.effort.guide.tooltip")}
    />
  );
}

export function ClaudeEffortSelect() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const claudeEffort = useScopedSetting("claudeEffort").value;
  const { write } = useScopedSettingsWriter();
  return (
    <EffortSelect
      value={claudeEffort}
      options={CLAUDE_EFFORT_OPTIONS}
      ariaLabel={t("settings:modelsSection.routing.claudeEffort.title")}
      onChange={(value) => write({ claudeEffort: value })}
    />
  );
}

/**
 * Effort values the default Codex model accepts. A saved legacy value outside
 * that scale (e.g. "minimal", which Stave still maps to "low" at runtime)
 * stays listed instead of rendering an empty trigger.
 */
function useCodexEffortOptions() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const modelCodex = useScopedSetting("modelCodex").value;
  const codexReasoningEffort = useScopedSetting("codexReasoningEffort").value;
  const options = useMemo(() => {
    const supported = listCodexEffortOptionsForModel({ model: modelCodex });
    if (supported.some((option) => option.value === codexReasoningEffort)) {
      return supported;
    }
    return [
      {
        value: codexReasoningEffort,
        label: t(`settingsProviders:providersSection.effortLevels.${codexReasoningEffort}`, {
          defaultValue: codexReasoningEffort,
        }),
      },
      ...supported,
    ];
  }, [codexReasoningEffort, modelCodex, t]);
  return { value: codexReasoningEffort, options };
}

export function CodexEffortGuide() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { options } = useCodexEffortOptions();
  const help = useMemo(
    () =>
      CODEX_REASONING_EFFORT_HELP.filter((option) =>
        options.some((entry) => entry.value === option.value),
      ),
    [options],
  );
  return (
    <SettingsFieldGuide
      title={t("settingsProviders:providersSection.codexRuntime.reasoning.guide.title")}
      summary={t("settingsProviders:providersSection.codexRuntime.reasoning.guide.summary")}
      items={buildGuideItems(help)}
      examples={buildGuideExamples(help)}
      tooltip={t("settingsProviders:providersSection.codexRuntime.reasoning.guide.tooltip")}
    />
  );
}

export function CodexEffortSelect() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { value, options } = useCodexEffortOptions();
  const { write } = useScopedSettingsWriter();
  return (
    <EffortSelect
      value={value}
      options={options}
      ariaLabel={t("settings:modelsSection.routing.codexEffort.title")}
      onChange={(next) => write({ codexReasoningEffort: next })}
    />
  );
}

/**
 * Cursor and Kiro (ACP runtimes) report their model catalog only once a
 * session connects, so their default model is a free-form identifier.
 */
const CURSOR_DEFAULT_KEYS = ["modelCursor", "cursorEffort"] as const;
const KIRO_DEFAULT_KEYS = ["modelKiro", "kiroEffort"] as const;

export function AcpDefaultModelRows() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const modelCursor = useScopedSetting("modelCursor").value;
  const cursorEffort = useScopedSetting("cursorEffort").value;
  const modelKiro = useScopedSetting("modelKiro").value;
  const kiroEffort = useScopedSetting("kiroEffort").value;
  const { write } = useScopedSettingsWriter();

  return (
    <>
      <LabeledField
        title="Cursor"
        description={t("settingsProviders:cursorSection.defaultModel.description")}
        guide={<ScopedFieldStatus keys={CURSOR_DEFAULT_KEYS} label="Cursor" />}
      >
        <ModelEffortRow
          model={
            <DraftInput
              xstyle={styles.modelIdInput}
              value={modelCursor}
              aria-label={t("settings:modelsSection.routing.cursorModel.ariaLabel")}
              // i18n-ignore: literal runtime model identifier
              placeholder="auto"
              onCommit={(value) =>
                write({ modelCursor: value.trim() || "auto" })
              }
            />
          }
          effort={
            <EffortSelect
              value={cursorEffort}
              options={CURSOR_EFFORT_OPTIONS}
              ariaLabel={t("settingsProviders:cursorSection.defaultEffort.ariaLabel")}
              onChange={(value) => write({ cursorEffort: value })}
            />
          }
        />
      </LabeledField>
      <LabeledField
        title="Kiro"
        description={t("settingsProviders:kiroSection.defaultModel.description")}
        guide={<ScopedFieldStatus keys={KIRO_DEFAULT_KEYS} label="Kiro" />}
      >
        <ModelEffortRow
          model={
            <DraftInput
              xstyle={styles.modelIdInput}
              value={modelKiro}
              aria-label={t("settings:modelsSection.routing.kiroModel.ariaLabel")}
              // i18n-ignore: literal runtime model identifier
              placeholder="auto"
              onCommit={(value) =>
                write({ modelKiro: value.trim() || "auto" })
              }
            />
          }
          effort={
            <EffortSelect
              value={kiroEffort}
              options={KIRO_EFFORT_OPTIONS}
              ariaLabel={t("settingsProviders:kiroSection.defaultEffort.ariaLabel")}
              onChange={(value) => write({ kiroEffort: value })}
            />
          }
        />
      </LabeledField>
    </>
  );
}
