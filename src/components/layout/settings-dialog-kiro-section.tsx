import { Badge } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIRO_EFFORT_OPTIONS } from "@/lib/providers/runtime-option-contract";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

export function SettingsKiroSection() {
  const [modelKiro, kiroBinaryPath, kiroEffort] = useAppStore(
    useShallow((state) => [
      state.settings.modelKiro,
      state.settings.kiroBinaryPath,
      state.settings.kiroEffort,
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
          title="Default Model"
          description="Use Auto unless the connected CLI reports another model identifier. The composer shows a warning if a saved model disappears from the runtime catalog."
        >
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
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
            <SelectTrigger aria-label="Kiro default effort" className="h-10">
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
            className="h-10 rounded-md border-border/80 bg-background"
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
