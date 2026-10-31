import { useShallow } from "zustand/react/shallow";
import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Slider } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { SettingsAdvancedDisclosure } from "../settings-dialog-advanced-disclosure";
import { DraftInput, LabeledField } from "../settings-dialog.shared";

/**
 * Settings → Chat → Typography → Advanced options: the mono and Korean font
 * families and the Information panel scale, rarely changed from their
 * defaults. Collapsed by default; saved values apply either way.
 */
export function ChatTypographyAdvancedFields() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [messageMonoFontFamily, messageKoreanFontFamily, infoPanelScale] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings.messageMonoFontFamily,
            state.settings.messageKoreanFontFamily,
            state.settings.infoPanelScale,
          ] as const,
      ),
    );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsAdvancedDisclosure
      compact
      title={t("settings:chatSection.typography.advanced.title")}
      description={t("settings:chatSection.typography.advanced.description")}
    >
      <LabeledField
        title={t("settings:chatSection.typography.monoFontFamily.title")}
        description={t("settings:chatSection.typography.monoFontFamily.description")}
      >
        <DraftInput
          value={messageMonoFontFamily}
          xstyle={styles.input9}
          onCommit={(nextValue) =>
            updateSettings({ patch: { messageMonoFontFamily: nextValue } })
          }
        />
      </LabeledField>
      <LabeledField
        title={t("settings:chatSection.typography.koreanFontFamily.title")}
        description={t("settings:chatSection.typography.koreanFontFamily.description")}
      >
        <DraftInput
          value={messageKoreanFontFamily}
          xstyle={styles.input9}
          onCommit={(nextValue) =>
            updateSettings({
              patch: { messageKoreanFontFamily: nextValue },
            })
          }
        />
      </LabeledField>
      <LabeledField
        title={t("settings:chatSection.typography.infoPanelScale.title")}
        description={t("settings:chatSection.typography.infoPanelScale.description")}
      >
        <div className={sx(styles.sliderRow)}>
          <Slider
            aria-label={t("settings:chatSection.typography.infoPanelScale.ariaLabel")}
            min={80}
            max={130}
            step={5}
            value={Math.round(infoPanelScale * 100)}
            onValueChange={(value) =>
              updateSettings({
                patch: { infoPanelScale: value / 100 },
              })
            }
            className={sx(styles.flex1)}
          />
          <span className={sx(styles.valueReadout)}>
            {Math.round(infoPanelScale * 100)}%
          </span>
        </div>
      </LabeledField>
    </SettingsAdvancedDisclosure>
  );
}
