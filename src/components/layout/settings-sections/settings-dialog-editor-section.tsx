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

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Typography"
          description="Base editor type and spacing defaults."
        >
          <LabeledField title="Font Size">
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
          <LabeledField title="Font Family">
            <DraftInput
              xstyle={styles.input40MonoPlain}
              value={editorFontFamily}
              onCommit={(nextValue) =>
                updateSettings({ patch: { editorFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField title="Tab Size">
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
          title="Display"
          description="Toggle editor line wrapping and chrome."
        >
          <SwitchField
            title="Word Wrap"
            checked={editorWordWrap}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorWordWrap: checked } })
            }
          />
          <LabeledField title="Line Numbers">
            <ChoiceButtons
              value={editorLineNumbers}
              columns={3}
              onChange={(value) =>
                updateSettings({ patch: { editorLineNumbers: value } })
              }
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
                { value: "relative", label: "Relative" },
              ]}
            />
          </LabeledField>
          <SwitchField
            title="Minimap"
            checked={editorMinimap}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorMinimap: checked } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="AI Inline Completions"
          description="Ghost-text code suggestions powered by Claude. Uses the Claude SDK with your local Claude auth when available, or falls back to the Anthropic API (requires ANTHROPIC_API_KEY)."
        >
          <SwitchField
            title="Enable AI Completions"
            description="Shows AI-generated inline suggestions as you type. Press Tab to accept. Uses Claude Haiku for fast, low-cost completions."
            checked={editorAiCompletions}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorAiCompletions: checked } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Project Language Servers"
          description="LSP-backed intelligence for TypeScript/JavaScript and Python. Uses Electron-managed stdio language-server sessions per active workspace."
        >
          <SwitchField
            title="Enable LSP Runtime"
            description="Uses Electron-managed stdio language-server sessions per active workspace. Keep this off if you only want Monaco's built-in syntax support."
            checked={editorLspEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorLspEnabled: checked } })
            }
          />
          <LabeledField
            title="TypeScript LSP Command"
            description="Leave empty to auto-discover `typescript-language-server` from PATH. Install via `npm i -g typescript-language-server typescript`. Handles .ts, .tsx, .js, and .jsx files."
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
            title="Python LSP Command"
            description="Leave empty to auto-discover `pyright-langserver` or `basedpyright-langserver` from PATH. You can also point this at an absolute executable path."
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
            title="Enable ESLint"
            description="Reads ESLint config from the opened project and shows diagnostics in the editor. Requires ESLint installed in the project's node_modules."
            checked={editorEslintEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorEslintEnabled: checked } })
            }
          />
          <SwitchField
            title="Format on Save"
            description="Automatically apply ESLint auto-fix when saving a file."
            checked={editorFormatOnSave}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorFormatOnSave: checked } })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
