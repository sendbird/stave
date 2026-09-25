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

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Typography"
          description="Tune readability for the integrated terminal."
        >
          <LabeledField title="Font Size">
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
          <LabeledField title="Font Family">
            <DraftInput
              xstyle={styles.input40}
              value={terminalFontFamily}
              onCommit={(nextValue) =>
                updateSettings({ patch: { terminalFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField title="Line Height">
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
          title="Cursor"
          description="Choose the terminal cursor shape."
        >
          <ChoiceButtons
            value={terminalCursorStyle}
            columns={3}
            onChange={(value) =>
              updateSettings({ patch: { terminalCursorStyle: value } })
            }
            options={[
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Underline" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
