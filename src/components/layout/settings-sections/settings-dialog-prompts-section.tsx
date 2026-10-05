import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
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
import { ReviewSettingsCards } from "./settings-dialog-review-cards";
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
  const { t } = useTranslation(I18N_NAMESPACES);
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
        placeholder={t("settings:promptsSection.field.placeholder")}
      />
      <div className={sx(styles.promptFooter)}>
        <p
          className={sx(
            isDefault ? styles.promptState : styles.promptStateCustom,
          )}
        >
          {isDefault ? t("settings:promptsSection.field.usingDefault") : t("settings:promptsSection.field.customised")}
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
            {t("settings:reviewCards.tasks.followUp.resetToDefault")}</Button>
        )}
      </div>
    </LabeledField>
  );
}

export function PromptsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    promptResponseStyle,
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
    <SectionStack>
      <ReviewSettingsCards />

      <SettingsCard
        title={t("settings:promptsSection.responseStyle.title")}
        description={t("settings:promptsSection.responseStyle.description")}
      >
        <PromptField
          title={t("settings:promptsSection.responseStyle.field.title")}
          description={t("settings:promptsSection.responseStyle.field.description")}
          value={promptResponseStyle}
          defaultValue={DEFAULT_PROMPT_RESPONSE_STYLE}
          onCommit={(v) =>
            updateSettings({ patch: { promptResponseStyle: v } })
          }
        />
      </SettingsCard>

      <SettingsCard
        title={t("settings:promptsSection.prDescription.title")}
        description={t("settings:promptsSection.prDescription.description")}
      >
        <PromptField
          title={t("settings:promptsSection.prDescription.field.title")}
          description={t("settings:promptsSection.prDescription.field.description")}
          value={promptPrDescription}
          defaultValue={DEFAULT_PROMPT_PR_DESCRIPTION}
          onCommit={(v) =>
            updateSettings({ patch: { promptPrDescription: v } })
          }
        />
      </SettingsCard>

      <SettingsCard
        title={t("settings:promptsSection.prCompletion.title")}
        description={t("settings:promptsSection.prCompletion.description")}
      >
        <SwitchField
          title={t("settings:promptsSection.prCompletion.autoMerge.title")}
          description={t("settings:promptsSection.prCompletion.autoMerge.description")}
          checked={createPrAutoMergeEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { createPrAutoMergeEnabled: checked } })
          }
        />
        <LabeledField
          title={t("settings:promptsSection.prCompletion.mergeMethod.title")}
          description={t("settings:promptsSection.prCompletion.mergeMethod.description")}
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
                label: t("settings:promptsSection.prCompletion.mergeMethod.default.label"),
                description:
                  t("settings:promptsSection.prCompletion.mergeMethod.default.description"),
              },
              {
                value: "merge",
                label: t("settings:promptsSection.prCompletion.mergeMethod.merge.label"),
                description: t("settings:promptsSection.prCompletion.mergeMethod.merge.description"),
              },
              {
                value: "squash",
                label: t("settings:promptsSection.prCompletion.mergeMethod.squash.label"),
                description: t("settings:promptsSection.prCompletion.mergeMethod.squash.description"),
              },
              {
                value: "rebase",
                label: t("settings:promptsSection.prCompletion.mergeMethod.rebase.label"),
                description: t("settings:promptsSection.prCompletion.mergeMethod.rebase.description"),
              },
            ]}
          />
        </LabeledField>
      </SettingsCard>
      <SettingsCard
        title={t("settings:promptsSection.inlineCompletion.title")}
        description={t("settings:promptsSection.inlineCompletion.description")}
      >
        <PromptField
          title={t("settings:promptsSection.inlineCompletion.field.title")}
          description={t("settings:promptsSection.inlineCompletion.field.description")}
          value={promptInlineCompletion}
          defaultValue={DEFAULT_PROMPT_INLINE_COMPLETION}
          onCommit={(v) =>
            updateSettings({ patch: { promptInlineCompletion: v } })
          }
        />
      </SettingsCard>

      <SettingsCard
        title={t("settings:promptsSection.turnSummary.title")}
        description={t("settings:promptsSection.turnSummary.description")}
      >
        <PromptField
          title={t("settings:promptsSection.turnSummary.field.title")}
          description={t("settings:promptsSection.turnSummary.field.description")}
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
  );
}
