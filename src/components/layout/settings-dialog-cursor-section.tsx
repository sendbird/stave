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
    label: "Agent",
    description: "Work through the task with the normal interactive tool flow.",
  },
  {
    value: "plan",
    label: "Plan",
    description: "Prepare a plan and pause for review before implementation.",
  },
  {
    value: "ask",
    label: "Ask",
    description: "Focus the session on questions and read-oriented exploration.",
  },
] as const;

export function SettingsCursorSection() {
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
        title="Cursor Runtime Controls"
        description="Session mode and model preferences passed to interactive Cursor Agent turns."
        titleAccessory={<Badge variant="secondary">ACP</Badge>}
      >
        <LabeledField
          title="Mode"
          description="Sets the starting mode for each new or resumed session."
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
          title="Approval Preset"
          description="How much Cursor may run without asking. Delivered as Cursor Agent process flags, so it applies for the whole session rather than per tool call."
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
            Guided uses Cursor's own Auto-review classifier, so which calls it
            runs unattended is decided by Cursor, not Stave. Worker runs always
            stay on Manual.
          </p>
        </LabeledField>
        <LabeledField
          title="Default Model"
          description="Use Auto unless the connected runtime advertises another model identifier. Unsupported values fall back to the runtime default."
        >
          <DraftInput
            xstyle={cursorSectionStyles.field}
            value={modelCursor}
            placeholder="auto"
            onCommit={(value) =>
              updateSettings({
                patch: { modelCursor: value.trim() || "auto" },
              })
            }
          />
        </LabeledField>
        <LabeledField
          title="Default Effort"
          description="Used when the connected Cursor session advertises a separate effort option. Individual model choices are remembered from the composer."
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
              aria-label="Cursor default effort"
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
          title="Fast Mode"
          description="Uses the Cursor Fast session option when the connected runtime advertises it. Individual model choices are remembered from the composer."
          checked={cursorFastMode}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { cursorFastMode: checked } })
          }
        />
      </SettingsCard>
      <SettingsCard
        title="Cursor Agent CLI"
        description="Stave resolves the Agent CLI from this path first, then checks supported environment overrides and standard executable locations."
      >
        <LabeledField
          title="Agent Path"
          description="Leave blank to use automatic discovery. The configured executable must support ACP and be signed in."
        >
          <DraftInput
            xstyle={cursorSectionStyles.field}
            value={cursorBinaryPath}
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
