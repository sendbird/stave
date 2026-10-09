import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Badge } from "@/components/ui";
import {
  KIRO_PROVIDER_MODE_PRESETS,
  buildKiroProviderModeSettingsPatch,
} from "@/lib/providers/provider-mode-presets";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";
import type { SectionId } from "./settings-dialog.schema";
import { ProviderDefaultsLink } from "./settings-dialog-provider-defaults-link";
import { kiroSectionStyles } from "./settings-dialog-kiro-section.styles";
import {
  ScopedFieldStatus,
  ScopeLocked,
  useScopedSetting,
  useScopedSettingsWriter,
} from "./settings-scope";

export function SettingsKiroSection(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const kiroBinaryPath = useAppStore((state) => state.settings.kiroBinaryPath);
  // Settings scope: the approval preset may differ per project.
  const kiroApprovalMode = useScopedSetting("kiroApprovalMode").value;
  const { write } = useScopedSettingsWriter();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const approvalTitle = t("settingsProviders:kiroSection.approvalPreset.title");

  return (
    <SectionStack>
      <SettingsCard
        title={t("settingsProviders:kiroSection.runtime.title")}
        description={t("settingsProviders:kiroSection.runtime.description")}
        titleAccessory={<Badge variant="secondary">{/* i18n-ignore: provider protocol acronym */}ACP</Badge>}
      >
        <LabeledField
          title={approvalTitle}
          description={t("settingsProviders:kiroSection.approvalPreset.description")}
          guide={<ScopedFieldStatus keys={["kiroApprovalMode"]} label={approvalTitle} />}
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
              write(buildKiroProviderModeSettingsPatch({ presetId }))
            }
          />
          <p className={sx(kiroSectionStyles.note)}>
            {t("settingsProviders:kiroSection.approvalPreset.note")}</p>
        </LabeledField>
        <ProviderDefaultsLink onNavigateSection={args.onNavigateSection} />
      </SettingsCard>
      <ScopeLocked>
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
      </ScopeLocked>
    </SectionStack>
  );
}
