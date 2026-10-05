import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Badge } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KIRO_PROVIDER_MODE_PRESETS,
  buildKiroProviderModeSettingsPatch,
} from "@/lib/providers/provider-mode-presets";
import { KIRO_EFFORT_OPTIONS } from "@/lib/providers/runtime-option-contract";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";
import { kiroSectionStyles } from "./settings-dialog-kiro-section.styles";

export function SettingsKiroSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [modelKiro, kiroBinaryPath, kiroEffort, kiroApprovalMode] = useAppStore(
    useShallow((state) => [
      state.settings.modelKiro,
      state.settings.kiroBinaryPath,
      state.settings.kiroEffort,
      state.settings.kiroApprovalMode,
    ]),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SectionStack>
      <SettingsCard
        title={t("settingsProviders:kiroSection.runtime.title")}
        description={t("settingsProviders:kiroSection.runtime.description")}
        titleAccessory={<Badge variant="secondary">{/* i18n-ignore: provider protocol acronym */}ACP</Badge>}
      >
        <LabeledField
          title={t("settingsProviders:kiroSection.approvalPreset.title")}
          description={t("settingsProviders:kiroSection.approvalPreset.description")}
        >
          <ChoiceButtons
            columns={2}
            value={kiroApprovalMode}
            options={KIRO_PROVIDER_MODE_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
              description: preset.description,
            }))}
            onChange={(presetId) =>
              updateSettings({
                patch: buildKiroProviderModeSettingsPatch({ presetId }),
              })
            }
          />
          <p className={sx(kiroSectionStyles.note)}>
            {t("settingsProviders:kiroSection.approvalPreset.note")}</p>
        </LabeledField>
        <LabeledField
          title={t("settingsProviders:kiroSection.defaultModel.title")}
          description={t("settingsProviders:kiroSection.defaultModel.description")}
        >
          <DraftInput
            xstyle={kiroSectionStyles.field}
            value={modelKiro}
            placeholder={/* i18n-ignore: runtime model identifier */ "auto"}
            onCommit={(value) =>
              updateSettings({
                patch: { modelKiro: value.trim() || "auto" },
              })
            }
          />
        </LabeledField>
        <LabeledField
          title={t("settingsProviders:kiroSection.defaultEffort.title")}
          description={t("settingsProviders:kiroSection.defaultEffort.description")}
        >
          <Select
            value={kiroEffort}
            onValueChange={(value) =>
              updateSettings({
                patch: {
                  kiroEffort: value as typeof kiroEffort,
                },
              })
            }
          >
            <SelectTrigger
              aria-label={t("settingsProviders:kiroSection.defaultEffort.ariaLabel")}
              className={sx(kiroSectionStyles.field)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIRO_EFFORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
      </SettingsCard>
      <SettingsCard
        title={t("settingsProviders:kiroSection.cli.title")}
        description={t("settingsProviders:kiroSection.cli.description")}
      >
        <LabeledField
          title={t("settingsProviders:kiroSection.cliPath.title")}
          description={t("settingsProviders:kiroSection.cliPath.description")}
        >
          <DraftInput
            xstyle={kiroSectionStyles.field}
            value={kiroBinaryPath}
            placeholder="kiro-cli"
            onCommit={(value) =>
              updateSettings({ patch: { kiroBinaryPath: value.trim() } })
            }
          />
        </LabeledField>
      </SettingsCard>
    </SectionStack>
  );
}
