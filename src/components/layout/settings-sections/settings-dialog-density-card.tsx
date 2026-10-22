import { useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import type { UiDensity } from "@/store/app-settings";
import { ChoiceButtons, SettingsCard } from "../settings-dialog.shared";

/** The card settings search scrolls to for density. */
export const DENSITY_SETTING_FIELD_ID = "settings-field-density";

/**
 * Regular or Compact for the whole app. Compact moves the design system's
 * control-height ramp down a step and tightens its spacing ramp; text sizes do
 * not change.
 */
export function DensitySettingsCard() {
  const { t } = useTranslation("settings");
  const density = useAppStore((state) => state.settings.uiDensity);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      id={DENSITY_SETTING_FIELD_ID}
      // Settings search focuses the card it opens; without a tabindex the
      // section ignores focus() and a keyboard user stays on the result.
      tabIndex={-1}
      title={t("themeSection.density.title")}
      description={t("themeSection.density.description")}
    >
      <ChoiceButtons<UiDensity>
        value={density}
        aria-label={t("themeSection.density.title")}
        options={[
          {
            value: "regular",
            label: t("themeSection.density.regular"),
            description: t("themeSection.density.regularDescription"),
          },
          {
            value: "compact",
            label: t("themeSection.density.compact"),
            description: t("themeSection.density.compactDescription"),
          },
        ]}
        onChange={(next) => updateSettings({ patch: { uiDensity: next } })}
      />
    </SettingsCard>
  );
}
