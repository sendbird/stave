import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui";
import {
  DraftInput,
  LabeledField,
  SettingsCard,
} from "@/components/layout/settings-dialog.shared";
import { isAbsolutePosixOrWindowsPath } from "@/lib/path-utils";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { standaloneCliCardStyles as styles } from "./settings-dialog-standalone-cli-card.styles";

export const STANDALONE_CLI_SETTING_FIELD_ID = "settings-standalone-cli-folder";
export const STANDALONE_CLI_FOLDER_ERROR_ID = `${STANDALONE_CLI_SETTING_FIELD_ID}-error`;

/**
 * `role="alert"` announces the message once, but leaves the input itself
 * reading as valid and unrelated to it. Wiring these two attributes is what
 * makes a screen reader tie the message to the field the user is still in.
 */
export function buildStandaloneCliFolderFieldAria(error: string | null) {
  if (!error) {
    return {};
  }
  return {
    "aria-invalid": true,
    "aria-describedby": STANDALONE_CLI_FOLDER_ERROR_ID,
  } as const;
}

export function buildStandaloneCliFolderError(candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  return isAbsolutePosixOrWindowsPath(trimmed)
    ? null
    : "Enter an absolute folder path.";
}

export function StandaloneCliSettingsCard() {
  const standaloneCliFolderPath = useAppStore(
    (state) => state.settings.standaloneCliFolderPath,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [error, setError] = useState<string | null>(null);

  const commit = (nextValue: string) => {
    const nextError = buildStandaloneCliFolderError(nextValue);
    setError(nextError);
    if (nextError) {
      return;
    }
    updateSettings({ patch: { standaloneCliFolderPath: nextValue.trim() } });
  };

  const browse = async () => {
    const pickDirectory = window.api?.fs?.pickDirectory;
    if (!pickDirectory) {
      setError("Folder picker unavailable. Use bun run dev:desktop.");
      return;
    }
    const result = await pickDirectory();
    // Cancelling the dialog is not an error, so a previously shown validation
    // message must not survive the cancellation either.
    if (!result.ok || !result.directoryPath) {
      setError(null);
      return;
    }
    commit(result.directoryPath);
  };

  return (
    <SettingsCard
      id={STANDALONE_CLI_SETTING_FIELD_ID}
      tabIndex={-1}
      title="Standalone CLI"
      description="Run Claude Code and Codex against one folder without registering it as a project."
    >
      <LabeledField
        title="Standalone CLI Folder"
        description="Absolute path. Changing it restarts both CLI tabs in the new folder and discards their conversations."
      >
        <div className={sx(styles.row)}>
          <DraftInput
            xstyle={styles.input}
            placeholder="/Users/me/notes"
            value={standaloneCliFolderPath}
            onCommit={commit}
            {...buildStandaloneCliFolderFieldAria(error)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            xstyle={styles.browse}
            onClick={browse}
          >
            <FolderOpen className={sx(styles.browseIcon)} />
            Browse
          </Button>
        </div>
        {error ? (
          <p
            id={STANDALONE_CLI_FOLDER_ERROR_ID}
            role="alert"
            className={sx(styles.error)}
          >
            {error}
          </p>
        ) : null}
      </LabeledField>
    </SettingsCard>
  );
}
