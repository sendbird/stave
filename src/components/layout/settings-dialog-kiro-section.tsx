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
        title="Kiro Runtime Controls"
        description="Model preferences passed to interactive Kiro turns."
        titleAccessory={<Badge variant="secondary">ACP</Badge>}
      >
        <LabeledField
          title="Approval Preset"
          description="How much Kiro may run without asking. Delivered as a Kiro CLI process flag, so it applies for the whole session rather than per tool call."
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
            Kiro has no partial-trust tier: its CLI accepts unknown tool names
            for a partial grant without reporting an error, so Stave does not
            offer a middle setting it cannot verify. Worker runs always stay on
            Manual.
          </p>
        </LabeledField>
        <LabeledField
          title="Default Model"
          description="Use Auto unless the connected CLI reports another model identifier. The composer shows a warning if a saved model disappears from the runtime catalog."
        >
          <DraftInput
            xstyle={kiroSectionStyles.field}
            value={modelKiro}
            placeholder="auto"
            onCommit={(value) =>
              updateSettings({
                patch: { modelKiro: value.trim() || "auto" },
              })
            }
          />
        </LabeledField>
        <LabeledField
          title="Default Effort"
          description="Used for Kiro models without a task-specific effort choice. Individual model choices are remembered from the composer."
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
              aria-label="Kiro default effort"
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
        title="Kiro CLI"
        description="Stave resolves Kiro CLI from this path first, then checks supported environment overrides and standard executable locations."
      >
        <LabeledField
          title="CLI Path"
          description="Leave blank to use automatic discovery. The configured executable must support ACP and be signed in."
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
