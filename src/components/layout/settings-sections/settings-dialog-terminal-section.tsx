import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useShallow } from "zustand/react/shallow";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readFloat,
  readInt,
  SectionStack,
  SettingsCard,
} from "../settings-dialog.shared";

export function TerminalSection() {
  const [
    terminalFontSize,
    terminalFontFamily,
    terminalCursorStyle,
    terminalLineHeight,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.terminalFontSize,
          state.settings.terminalFontFamily,
          state.settings.terminalCursorStyle,
          state.settings.terminalLineHeight,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);

  return (
    <SectionStack>
      <SettingsCard
        title={t("settings:terminalSection.typography.title")}
        description={t("settings:terminalSection.typography.description")}
      >
        <LabeledField title={t("settings:terminalSection.typography.fontSize")}>
          <DraftInput
            xstyle={styles.input40}
            value={String(terminalFontSize)}
            onCommit={(nextValue) =>
              updateSettings({
                patch: {
                  terminalFontSize: readInt(nextValue, terminalFontSize),
                },
              })
            }
          />
        </LabeledField>
        <LabeledField title={t("settings:terminalSection.typography.fontFamily")}>
          <DraftInput
            xstyle={styles.input40}
            value={terminalFontFamily}
            onCommit={(nextValue) =>
              updateSettings({ patch: { terminalFontFamily: nextValue } })
            }
          />
        </LabeledField>
        <LabeledField title={t("settings:terminalSection.typography.lineHeight")}>
          <DraftInput
            xstyle={styles.input40}
            value={String(terminalLineHeight)}
            onCommit={(nextValue) =>
              updateSettings({
                patch: {
                  terminalLineHeight: readFloat(
                    nextValue,
                    terminalLineHeight,
                  ),
                },
              })
            }
          />
        </LabeledField>
      </SettingsCard>

      <SettingsCard
        title={t("settings:terminalSection.cursor.title")}
        description={t("settings:terminalSection.cursor.description")}
      >
        <ChoiceButtons
          value={terminalCursorStyle}
          columns={3}
          onChange={(value) =>
            updateSettings({ patch: { terminalCursorStyle: value } })
          }
          options={[
            { value: "block", label: t("settings:terminalSection.cursor.block") },
            { value: "bar", label: t("settings:terminalSection.cursor.bar") },
            { value: "underline", label: t("settings:terminalSection.cursor.underline") },
          ]}
        />
      </SettingsCard>
    </SectionStack>
  );
}
