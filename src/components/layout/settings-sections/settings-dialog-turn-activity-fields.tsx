import { useShallow } from "zustand/react/shallow";
import {
  normalizeTurnActivityPlacement,
  type TurnActivityPlacement,
} from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  LabeledField,
  SwitchField,
} from "../settings-dialog.shared";

/**
 * Turn activity settings. The one-line run summary always sits on the
 * composer shelf; these decide where its details open and whether they start
 * open.
 */
export function TurnActivityFields() {
  const [placement, expandedByDefault, updateSettings] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.turnActivityPlacement,
          state.settings.turnActivityExpandedByDefault,
          state.updateSettings,
        ] as const,
    ),
  );
  return (
    <>
      <LabeledField
        title="Open Run Details In"
        description="Where the toggle on the run line above the prompt opens the turn's tools, agents and to-dos. The run line itself stays above the prompt either way, and its panel button always opens the Task panel."
      >
        <ChoiceButtons<TurnActivityPlacement>
          value={normalizeTurnActivityPlacement(placement)}
          onChange={(value) =>
            updateSettings({ patch: { turnActivityPlacement: value } })
          }
          options={[
            { value: "docked", label: "Above the prompt" },
            { value: "floating", label: "Floating card" },
            { value: "panel", label: "Task panel" },
          ]}
        />
      </LabeledField>
      <SwitchField
        title="Open Run Details"
        description="Open the details when a run starts instead of showing the run line alone. Your toggle during a run lasts until that run ends."
        checked={expandedByDefault}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { turnActivityExpandedByDefault: checked } })
        }
      />
    </>
  );
}
