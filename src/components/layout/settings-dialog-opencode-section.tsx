import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Badge } from "@/components/ui";
import {
  OPENCODE_PROVIDER_MODE_PRESETS,
  buildOpenCodeProviderModeSettingsPatch,
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
import { kiroSectionStyles as sectionStyles } from "./settings-dialog-kiro-section.styles";
import {
  ScopedFieldStatus,
  ScopeLocked,
  useScopedSetting,
  useScopedSettingsWriter,
} from "./settings-scope";

export function SettingsOpenCodeSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const opencodeBinaryPath = useAppStore(
    (state) => state.settings.opencodeBinaryPath,
  );
  // Settings scope: the approval preset may differ per project.
  const opencodeApprovalMode = useScopedSetting("opencodeApprovalMode").value;
  const { write } = useScopedSettingsWriter();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const approvalTitle = t("settingsProviders:opencodeSection.approvalPreset.title");

  return (
    <SectionStack>
      <SettingsCard
        title={t("settingsProviders:opencodeSection.runtime.title")}
        description={t("settingsProviders:opencodeSection.runtime.description")}
        titleAccessory={<Badge variant="secondary">{/* i18n-ignore: provider protocol acronym */}ACP</Badge>}
      >
        <LabeledField
          title={approvalTitle}
          description={t("settingsProviders:opencodeSection.approvalPreset.description")}
          guide={<ScopedFieldStatus keys={["opencodeApprovalMode"]} label={approvalTitle} />}
        >
          <ChoiceButtons
            columns={2}
            value={opencodeApprovalMode}
            options={OPENCODE_PROVIDER_MODE_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
              description: preset.description,
            }))}
            onChange={(presetId) =>
              write(buildOpenCodeProviderModeSettingsPatch({ presetId }))
            }
          />
          <p className={sx(sectionStyles.note)}>
            {t("settingsProviders:opencodeSection.approvalPreset.note")}</p>
        </LabeledField>
        <p className={sx(sectionStyles.note)}>
          {t("settingsProviders:opencodeSection.runtime.authentication")}</p>
      </SettingsCard>
      <ScopeLocked>
      <SettingsCard
        title={t("settingsProviders:opencodeSection.cli.title")}
        description={t("settingsProviders:opencodeSection.cli.description")}
      >
        <LabeledField
          title={t("settingsProviders:kiroSection.cliPath.title")}
          description={t("settingsProviders:opencodeSection.cliPath.description")}
        >
          <DraftInput
            xstyle={sectionStyles.field}
            value={opencodeBinaryPath}
            // i18n-ignore: executable name
            placeholder="opencode"
            onCommit={(value) =>
              updateSettings({ patch: { opencodeBinaryPath: value.trim() } })
            }
          />
        </LabeledField>
      </SettingsCard>
      </ScopeLocked>
    </SectionStack>
  );
}
