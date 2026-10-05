import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { Badge } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CURSOR_PROVIDER_MODE_PRESETS,
  buildCursorProviderModeSettingsPatch,
} from "@/lib/providers/provider-mode-presets";
import { CURSOR_EFFORT_OPTIONS } from "@/lib/providers/runtime-option-contract";
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
import { cursorSectionStyles } from "./settings-dialog-cursor-section.styles";

const CURSOR_MODE_OPTIONS = [
  {
    value: "agent",
    get label() { return i18n.t("settingsProviders:cursorSection.modes.agent.label"); },
    get description() { return i18n.t("settingsProviders:cursorSection.modes.agent.description"); },
  },
  {
    value: "plan",
    get label() { return i18n.t("settingsProviders:cursorSection.modes.plan.label"); },
    get description() { return i18n.t("settingsProviders:cursorSection.modes.plan.description"); },
  },
  {
    value: "ask",
    get label() { return i18n.t("settingsProviders:cursorSection.modes.ask.label"); },
    get description() { return i18n.t("settingsProviders:cursorSection.modes.ask.description"); },
  },
] as const;

export function SettingsCursorSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    cursorMode,
    cursorApprovalMode,
    modelCursor,
    cursorEffort,
    cursorFastMode,
    cursorBinaryPath,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.cursorMode,
      state.settings.cursorApprovalMode,
      state.settings.modelCursor,
      state.settings.cursorEffort,
      state.settings.cursorFastMode,
      state.settings.cursorBinaryPath,
    ]),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SectionStack>
      <SettingsCard
        title={t("settingsProviders:cursorSection.runtime.title")}
        description={t("settingsProviders:cursorSection.runtime.description")}
        titleAccessory={<Badge variant="secondary">{/* i18n-ignore: provider protocol acronym */}ACP</Badge>}
      >
        <LabeledField
          title={t("settingsProviders:cursorSection.mode.title")}
          description={t("settingsProviders:cursorSection.mode.description")}
        >
          <ChoiceButtons
            columns={3}
            value={cursorMode}
            options={[...CURSOR_MODE_OPTIONS]}
            onChange={(value) =>
              updateSettings({ patch: { cursorMode: value } })
            }
          />
        </LabeledField>
        <LabeledField
          title={t("settingsProviders:kiroSection.approvalPreset.title")}
          description={t("settingsProviders:cursorSection.approvalPreset.description")}
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
              updateSettings({
                patch: buildCursorProviderModeSettingsPatch({ presetId }),
              })
            }
          />
          <p className={sx(cursorSectionStyles.note)}>
            {t("settingsProviders:cursorSection.approvalPreset.note")}</p>
        </LabeledField>
        <LabeledField
          title={t("settingsProviders:kiroSection.defaultModel.title")}
          description={t("settingsProviders:cursorSection.defaultModel.description")}
        >
          <DraftInput
            xstyle={cursorSectionStyles.field}
            value={modelCursor}
            // i18n-ignore: literal runtime model identifier
            placeholder="auto"
            onCommit={(value) =>
              updateSettings({
                patch: { modelCursor: value.trim() || "auto" },
              })
            }
          />
        </LabeledField>
        <LabeledField
          title={t("settingsProviders:kiroSection.defaultEffort.title")}
          description={t("settingsProviders:cursorSection.defaultEffort.description")}
        >
          <Select
            value={cursorEffort}
            onValueChange={(value) =>
              updateSettings({
                patch: {
                  cursorEffort: value as typeof cursorEffort,
                },
              })
            }
          >
            <SelectTrigger
              aria-label={t("settingsProviders:cursorSection.defaultEffort.ariaLabel")}
              className={sx(cursorSectionStyles.field)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURSOR_EFFORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
        <SwitchField
          title={t("settingsProviders:cursorSection.fastMode.title")}
          description={t("settingsProviders:cursorSection.fastMode.description")}
          checked={cursorFastMode}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { cursorFastMode: checked } })
          }
        />
      </SettingsCard>
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
    </SectionStack>
  );
}
