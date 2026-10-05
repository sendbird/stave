import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useShallow } from "zustand/react/shallow";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readInt,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

export function EditorSection() {
  const [
    editorFontSize,
    editorFontFamily,
    editorWordWrap,
    editorMinimap,
    editorLineNumbers,
    editorTabSize,
    editorLspEnabled,
    editorAiCompletions,
    editorEslintEnabled,
    editorFormatOnSave,
    pythonLspCommand,
    typescriptLspCommand,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.editorFontSize,
          state.settings.editorFontFamily,
          state.settings.editorWordWrap,
          state.settings.editorMinimap,
          state.settings.editorLineNumbers,
          state.settings.editorTabSize,
          state.settings.editorLspEnabled,
          state.settings.editorAiCompletions,
          state.settings.editorEslintEnabled,
          state.settings.editorFormatOnSave,
          state.settings.pythonLspCommand,
          state.settings.typescriptLspCommand,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);

  return (
    <SectionStack>
      <SettingsCard
        title={t("settings:editorSection.typography.title")}
        description={t("settings:editorSection.typography.description")}
      >
        <LabeledField title={t("settings:editorSection.typography.fontSize")}>
          <DraftInput
            xstyle={styles.input40}
            type="number"
            min={10}
            max={32}
            value={String(editorFontSize)}
            onCommit={(nextValue) =>
              updateSettings({
                patch: { editorFontSize: readInt(nextValue, editorFontSize) },
              })
            }
          />
        </LabeledField>
        <LabeledField title={t("settings:editorSection.typography.fontFamily")}>
          <DraftInput
            xstyle={styles.input40MonoPlain}
            value={editorFontFamily}
            onCommit={(nextValue) =>
              updateSettings({ patch: { editorFontFamily: nextValue } })
            }
          />
        </LabeledField>
        <LabeledField title={t("settings:editorSection.typography.tabSize")}>
          <DraftInput
            xstyle={styles.input40}
            type="number"
            min={1}
            max={8}
            value={String(editorTabSize)}
            onCommit={(nextValue) =>
              updateSettings({
                patch: { editorTabSize: readInt(nextValue, editorTabSize) },
              })
            }
          />
        </LabeledField>
      </SettingsCard>

      <SettingsCard
        title={t("settings:editorSection.display.title")}
        description={t("settings:editorSection.display.description")}
      >
        <SwitchField
          title={t("settings:editorSection.display.wordWrap")}
          checked={editorWordWrap}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { editorWordWrap: checked } })
          }
        />
        <LabeledField title={t("settings:editorSection.display.lineNumbers")}>
          <ChoiceButtons
            value={editorLineNumbers}
            columns={3}
            onChange={(value) =>
              updateSettings({ patch: { editorLineNumbers: value } })
            }
            options={[
              { value: "on", label: t("common:status.on") },
              { value: "off", label: t("common:status.off") },
              { value: "relative", label: t("settings:editorSection.display.relative") },
            ]}
          />
        </LabeledField>
        <SwitchField
          title={t("settings:editorSection.display.minimap")}
          checked={editorMinimap}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { editorMinimap: checked } })
          }
        />
      </SettingsCard>

      <SettingsCard
        title={t("settings:editorSection.aiCompletions.title")}
        description={t("settings:editorSection.aiCompletions.description")}
      >
        <SwitchField
          title={t("settings:editorSection.aiCompletions.enable.title")}
          description={t("settings:editorSection.aiCompletions.enable.description")}
          checked={editorAiCompletions}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { editorAiCompletions: checked } })
          }
        />
      </SettingsCard>

      <SettingsCard
        title={t("settings:editorSection.languageServers.title")}
        description={t("settings:editorSection.languageServers.description")}
      >
        <SwitchField
          title={t("settings:editorSection.languageServers.enable.title")}
          description={t("settings:editorSection.languageServers.enable.description")}
          checked={editorLspEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { editorLspEnabled: checked } })
          }
        />
        <LabeledField
          title={t("settings:editorSection.languageServers.typescript.title")}
          description={t("settings:editorSection.languageServers.typescript.description")}
        >
          <DraftInput
            xstyle={styles.input40Mono}
            placeholder="typescript-language-server"
            value={typescriptLspCommand}
            onCommit={(nextValue) =>
              updateSettings({ patch: { typescriptLspCommand: nextValue } })
            }
          />
        </LabeledField>
        <LabeledField
          title={t("settings:editorSection.languageServers.python.title")}
          description={t("settings:editorSection.languageServers.python.description")}
        >
          <DraftInput
            xstyle={styles.input40Mono}
            placeholder="pyright-langserver"
            value={pythonLspCommand}
            onCommit={(nextValue) =>
              updateSettings({ patch: { pythonLspCommand: nextValue } })
            }
          />
        </LabeledField>
      </SettingsCard>
      <SettingsCard title="ESLint">
        <SwitchField
          title={t("settings:editorSection.eslint.enable.title")}
          description={t("settings:editorSection.eslint.enable.description")}
          checked={editorEslintEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { editorEslintEnabled: checked } })
          }
        />
        <SwitchField
          title={t("settings:editorSection.eslint.formatOnSave.title")}
          description={t("settings:editorSection.eslint.formatOnSave.description")}
          checked={editorFormatOnSave}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { editorFormatOnSave: checked } })
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
