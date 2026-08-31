import { Badge } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

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
  const [cursorMode, modelCursor, cursorBinaryPath] = useAppStore(
    useShallow((state) => [
      state.settings.cursorMode,
      state.settings.modelCursor,
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
          title="Default Model"
          description="Use Auto unless the connected runtime advertises another model identifier. Unsupported values fall back to the runtime default."
        >
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
            value={modelCursor}
            placeholder="auto"
            onCommit={(value) =>
              updateSettings({
                patch: { modelCursor: value.trim() || "auto" },
              })
            }
          />
        </LabeledField>
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
            className="h-10 rounded-md border-border/80 bg-background"
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
