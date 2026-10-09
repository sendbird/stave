import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { Badge } from "@/components/ui";
import {
  CURSOR_PROVIDER_MODE_PRESETS,
  buildCursorProviderModeSettingsPatch,
} from "@/lib/providers/provider-mode-presets";
import { useAppStore } from "@/store/app.store";
import { sx } from "@/components/ads/utils/stylex";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";
import type { SectionId } from "./settings-dialog.schema";
import { ProviderDefaultsLink } from "./settings-dialog-provider-defaults-link";
import { cursorSectionStyles } from "./settings-dialog-cursor-section.styles";
import {
  ScopedFieldStatus,
  ScopeLocked,
  useScopedSetting,
  useScopedSettingsWriter,
} from "./settings-scope";

const CURSOR_MODE_OPTIONS = [
  {
    value: "agent",
    get label() { return i18n.t("settingsProviders:cursorSection.modes.agent.label"); },
    get description() { return i18n.t("settingsProviders:cursorSection.modes.agent.description"); },
  },
  {
    value: "ask",
    get label() { return i18n.t("settingsProviders:cursorSection.modes.ask.label"); },
    get description() { return i18n.t("settingsProviders:cursorSection.modes.ask.description"); },
  },
] as const;

export function SettingsCursorSection(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [cursorMode, cursorFastMode, cursorBinaryPath] = useAppStore(
    useShallow((state) => [
      state.settings.cursorMode,
      state.settings.cursorFastMode,
      state.settings.cursorBinaryPath,
    ]),
  );
  // Settings scope: the approval preset is the one Cursor key a project may
  // override; the rest of this tab stays global.
  const cursorApprovalMode = useScopedSetting("cursorApprovalMode").value;
  const { write } = useScopedSettingsWriter();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const approvalTitle = t("settingsProviders:kiroSection.approvalPreset.title");

  return (
    <SectionStack>
      <SettingsCard
        title={t("settingsProviders:cursorSection.runtime.title")}
        description={t("settingsProviders:cursorSection.runtime.description")}
        titleAccessory={<Badge variant="secondary">{/* i18n-ignore: provider protocol acronym */}ACP</Badge>}
      >
        <ScopeLocked>
        <LabeledField
          title={t("settingsProviders:cursorSection.mode.title")}
          description={t("settingsProviders:cursorSection.mode.description")}
        >
          <ChoiceButtons
            columns={2}
            value={cursorMode}
            options={[...CURSOR_MODE_OPTIONS]}
            onChange={(value) =>
              updateSettings({ patch: { cursorMode: value } })
            }
          />
        </LabeledField>
        </ScopeLocked>
        <LabeledField
          title={approvalTitle}
          description={t("settingsProviders:cursorSection.approvalPreset.description")}
          guide={<ScopedFieldStatus keys={["cursorApprovalMode"]} label={approvalTitle} />}
        >
          <ChoiceButtons
            columns={3}
            value={cursorApprovalMode}
            options={CURSOR_PROVIDER_MODE_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
              description: preset.description,
            }))}
            onChange={(presetId) =>
              write(buildCursorProviderModeSettingsPatch({ presetId }))
            }
          />
          <p className={sx(cursorSectionStyles.note)}>
            {t("settingsProviders:cursorSection.approvalPreset.note")}</p>
        </LabeledField>
        <ProviderDefaultsLink onNavigateSection={args.onNavigateSection} />
        <ScopeLocked>
        <SwitchField
          title={t("settingsProviders:cursorSection.fastMode.title")}
          description={t("settingsProviders:cursorSection.fastMode.description")}
          checked={cursorFastMode}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { cursorFastMode: checked } })
          }
        />
        </ScopeLocked>
      </SettingsCard>
      <ScopeLocked>
      <SettingsCard
        title={t("settingsProviders:cursorSection.cli.title")}
        description={t("settingsProviders:cursorSection.cli.description")}
      >
        <LabeledField
          title={t("settingsProviders:cursorSection.agentPath.title")}
          description={t("settingsProviders:kiroSection.cliPath.description")}
        >
          <DraftInput
            xstyle={cursorSectionStyles.field}
            value={cursorBinaryPath}
            // i18n-ignore: literal CLI executable name
            placeholder="agent"
            onCommit={(value) =>
              updateSettings({ patch: { cursorBinaryPath: value.trim() } })
            }
          />
        </LabeledField>
      </SettingsCard>
      </ScopeLocked>
    </SectionStack>
  );
}
