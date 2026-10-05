import { I18N_NAMESPACES, useTranslation } from "@/i18n";
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
  const { t } = useTranslation(I18N_NAMESPACES);
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
        title={t("settings:turnActivityFields.placement.title")}
        description={t("settings:turnActivityFields.placement.description")}
      >
        <ChoiceButtons<TurnActivityPlacement>
          value={normalizeTurnActivityPlacement(placement)}
          onChange={(value) =>
            updateSettings({ patch: { turnActivityPlacement: value } })
          }
          options={[
            { value: "docked", label: t("settings:turnActivityFields.placement.docked") },
            { value: "floating", label: t("settings:turnActivityFields.placement.floating") },
            { value: "panel", label: t("settings:turnActivityFields.placement.panel") },
          ]}
        />
      </LabeledField>
      <SwitchField
        title={t("settings:turnActivityFields.expanded.title")}
        description={t("settings:turnActivityFields.expanded.description")}
        checked={expandedByDefault}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { turnActivityExpandedByDefault: checked } })
        }
      />
    </>
  );
}
