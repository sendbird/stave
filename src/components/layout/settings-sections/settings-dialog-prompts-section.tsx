import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { useShallow } from "zustand/react/shallow";
import { Textarea } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { useAppStore } from "@/store/app.store";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  DEFAULT_PROMPT_PR_DESCRIPTION,
  DEFAULT_PROMPT_INLINE_COMPLETION,
  DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
} from "@/lib/providers/prompt-defaults";
import { PrePrReviewProviderId } from "@/lib/source-control-review";
import { PrMergeMethod } from "@/lib/pr-status";
import {
  ChoiceButtons,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

interface PromptFieldProps {
  title: string;
  description: string;
  value: string;
  defaultValue: string;
  onCommit: (value: string) => void;
}

function PromptField({
  title,
  description,
  value,
  defaultValue,
  onCommit,
}: PromptFieldProps) {
  const [draft, setDraft] = useState(value);
  const isDefault = draft === defaultValue;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleBlur() {
    if (draft !== value) {
      onCommit(draft);
    }
  }

  function handleReset() {
    setDraft(defaultValue);
    onCommit(defaultValue);
  }

  return (
    <LabeledField title={title} description={description}>
      <Textarea
        xstyle={styles.promptTextarea}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
        placeholder="(empty = disabled)"
      />
      <div className={sx(styles.promptFooter)}>
        <p
          className={sx(
            isDefault ? styles.promptState : styles.promptStateCustom,
          )}
        >
          {isDefault ? "Using default" : "Customised"}
        </p>
        {!isDefault && (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            xstyle={styles.resetButton}
            onClick={handleReset}
          >
            <RefreshCcw className={sx(styles.iconXs)} />
            Reset to default
          </Button>
        )}
      </div>
    </LabeledField>
  );
}

export function PromptsSection() {
  const [
    promptResponseStyle,
    prePrReviewEnabled,
    prePrReviewProvider,
    promptPrDescription,
    createPrAutoMergeEnabled,
    createPrMergeMethod,
    promptInlineCompletion,
    workspaceTurnSummaryPrompt,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.promptResponseStyle,
          state.settings.prePrReviewEnabled,
          state.settings.prePrReviewProvider,
          state.settings.promptPrDescription,
          state.settings.createPrAutoMergeEnabled,
          state.settings.createPrMergeMethod,
          state.settings.promptInlineCompletion,
          state.settings.workspaceTurnSummaryPrompt,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Pre-PR Review"
          description="Run a best-effort one-shot AI review before Stave pushes a branch and opens a pull request."
        >
          <SwitchField
            title="Review Before Opening PR"
            description="Shows concrete findings in the PR dialog with options to stop and fix or proceed anyway. Model failures never block PR creation."
            checked={prePrReviewEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { prePrReviewEnabled: checked } })
            }
          />
          <LabeledField
            title="Review Provider"
            description="Choose which provider runs the one-shot review. The provider uses its configured default model."
          >
            <ChoiceButtons<PrePrReviewProviderId>
              value={prePrReviewProvider}
              onChange={(providerId) =>
                updateSettings({
                  patch: { prePrReviewProvider: providerId },
                })
              }
              options={[
                {
                  value: "claude-code",
                  label: "Claude",
                  description: "Uses the configured Claude model.",
                  icon: (
                    <ModelIcon
                      providerId="claude-code"
                      className={sx(styles.iconSm)}
                    />
                  ),
                },
                {
                  value: "codex",
                  label: "Codex",
                  description: "Uses the configured Codex model.",
                  icon: (
                    <ModelIcon
                      providerId="codex"
                      className={sx(styles.iconSm)}
                    />
                  ),
                },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Response Style"
          description="Formatting guidance injected into every Claude and Codex turn. Controls how the model structures its answers — headings, bullet lists, conciseness, etc."
        >
          <PromptField
            title="Response Formatting Rules"
            description="Appended to the system prompt (Claude) or injected as hidden developer instructions (Codex). Empty disables the injection."
            value={promptResponseStyle}
            defaultValue={DEFAULT_PROMPT_RESPONSE_STYLE}
            onCommit={(v) =>
              updateSettings({ patch: { promptResponseStyle: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Pull Request Description"
          description="Template used when Stave auto-generates a PR title and body from the branch diff."
        >
          <PromptField
            title="PR Description Prompt"
            description="The instruction part of the prompt. Branch context (diff, commit log, file list) is appended automatically."
            value={promptPrDescription}
            defaultValue={DEFAULT_PROMPT_PR_DESCRIPTION}
            onCommit={(v) =>
              updateSettings({ patch: { promptPrDescription: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="PR Completion"
          description="Controls the final steps after Stave creates a ready pull request."
        >
          <SwitchField
            title="Queue Auto-Merge"
            description="After the ready PR is created, queue the selected merge strategy using GitHub's configured checks."
            checked={createPrAutoMergeEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { createPrAutoMergeEnabled: checked } })
            }
          />
          <LabeledField
            title="Merge Method"
            description="Choose the strategy passed to GitHub when auto-merge is queued."
          >
            <ChoiceButtons<PrMergeMethod>
              value={createPrMergeMethod}
              columns={3}
              onChange={(method) =>
                updateSettings({ patch: { createPrMergeMethod: method } })
              }
              options={[
                {
                  value: "default",
                  label: "Repository default",
                  description:
                    "Let GitHub choose the configured strategy or merge queue.",
                },
                {
                  value: "merge",
                  label: "Merge",
                  description: "Create a merge commit.",
                },
                {
                  value: "squash",
                  label: "Squash",
                  description: "Combine the branch into one commit.",
                },
                {
                  value: "rebase",
                  label: "Rebase",
                  description: "Rebase and merge without a merge commit.",
                },
              ]}
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Inline Code Completion"
          description="System prompt for the FIM (fill-in-the-middle) code completion engine in the editor."
        >
          <PromptField
            title="Completion System Prompt"
            description="Controls how the model generates code completions. Must instruct the model to output raw code only."
            value={promptInlineCompletion}
            defaultValue={DEFAULT_PROMPT_INLINE_COMPLETION}
            onCommit={(v) =>
              updateSettings({ patch: { promptInlineCompletion: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Workspace Latest Turn Summary"
          description="Automatically writes a short 'what the user asked / what the AI did' summary to the top of the Information panel after each completed turn. Its model lives in Settings → Background AI."
        >
          <PromptField
            title="Summary Prompt"
            description="Instruction template for the Information panel's automatic latest-turn summary. Task title, latest user request, and latest assistant response are appended automatically. Empty disables automatic summaries."
            value={workspaceTurnSummaryPrompt}
            defaultValue={DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY}
            onCommit={(v) =>
              updateSettings({
                patch: { workspaceTurnSummaryPrompt: v },
              })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
