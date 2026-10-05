import { useMemo } from "react";
import { Button } from "@/components/ads/components/Button";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { ReviewPromptPicker } from "@/components/ai-elements/review-prompt-picker";
import { sx } from "@/components/ads/utils/stylex";
import { LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS } from "@/lib/local-change-review";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { useProviderModelCatalogs } from "@/lib/providers/use-provider-model-catalogs";
import {
  DEFAULT_REVIEW_FOLLOW_UP_PROMPT,
  REVIEW_FOLLOW_UP_PROMPT_MAX_CHARS,
  REVIEW_TASK_INSTRUCTIONS_MAX_CHARS,
  REVIEW_TASK_SETTING_FIELD_ID,
  type ReviewTaskProviderId,
  type ReviewTaskSettings,
  type ReviewerPreference,
} from "@/lib/reviews/review-task";
import type { PrePrReviewProviderId } from "@/lib/source-control-review";
import { useAppStore } from "@/store/app.store";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  ChoiceButtons,
  DraftTextarea,
  LabeledField,
  SelectField,
  SettingsCard,
  SwitchField,
  ToggleChipGroup,
} from "../settings-dialog.shared";

const FOLLOW_DEFAULT = "__default__";

function providerIcon(providerId: ReviewTaskProviderId) {
  return <ModelIcon providerId={providerId} className={sx(styles.iconSm)} />;
}

/** Review settings: the composer's review tasks and the pre-PR review. */
export function ReviewSettingsCards() {
  return (
    <>
      <ReviewTasksCard />
      <PrePrReviewCard />
    </>
  );
}

function ReviewModelField(props: {
  providerId: ReviewTaskProviderId;
  title: string;
  value: string;
  defaultModel: string;
  models: readonly string[];
  onChange: (model: string) => void;
}) {
  const options = useMemo(
    () => [
      {
        value: FOLLOW_DEFAULT,
        label: `Default model (${toHumanModelName({ model: props.defaultModel })})`,
      },
      ...[...new Set([props.value, ...props.models])]
        .filter(Boolean)
        .map((model) => ({ value: model, label: toHumanModelName({ model }) })),
    ],
    [props.defaultModel, props.models, props.value],
  );
  return (
    <SelectField<string>
      title={props.title}
      description="Used when this provider reviews. The default follows the provider's model setting."
      value={props.value || FOLLOW_DEFAULT}
      options={options}
      onChange={(model) => props.onChange(model === FOLLOW_DEFAULT ? "" : model)}
    />
  );
}

function ReviewTasksCard() {
  const [reviewTask, modelClaude, modelCodex, skills] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.reviewTask,
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.skillCatalog.skills,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { catalogs } = useProviderModelCatalogs({ enabled: true });
  const patch = (next: Partial<ReviewTaskSettings>) =>
    updateSettings({ patch: { reviewTask: { ...reviewTask, ...next } } });
  const skillOptions = useMemo(() => {
    const slugs = [...new Set(skills.map((skill) => skill.slug))].sort();
    return [
      { value: "", label: "Choose a skill" },
      ...(reviewTask.skillSlug && !slugs.includes(reviewTask.skillSlug)
        ? [{ value: reviewTask.skillSlug, label: `$${reviewTask.skillSlug} (not in this workspace)` }]
        : []),
      ...slugs.map((slug) => ({
        value: slug,
        label: `$${slug}`,
        keywords: skills
          .filter((skill) => skill.slug === slug)
          .flatMap((skill) => [skill.name, skill.description]),
      })),
    ];
  }, [reviewTask.skillSlug, skills]);

  return (
    <SettingsCard
      id={REVIEW_TASK_SETTING_FIELD_ID}
      tabIndex={-1}
      title="Review Tasks"
      description="The composer's Review button runs a read-only review in its own task, beside the task you are working in. When it finishes, attach its findings to your next message."
    >
      <LabeledField
        title="Default Reviewer"
        description="The reviewer the dialog suggests. Other provider cross-checks the latest reply with the provider that did not write it. You can still pick any model when you start a review."
      >
        <ChoiceButtons<ReviewerPreference>
          value={reviewTask.reviewer}
          columns={3}
          onChange={(reviewer) => patch({ reviewer })}
          options={[
            {
              value: "other",
              label: "Other provider",
            },
            {
              value: "claude-code",
              label: "Claude",
              icon: providerIcon("claude-code"),
            },
            {
              value: "codex",
              label: "Codex",
              icon: providerIcon("codex"),
            },
          ]}
        />
      </LabeledField>
      <SwitchField
        title="Cross-check With Both Providers"
        description="Start a second, independent review on the other provider with each review. You can still turn it off in the dialog."
        checked={reviewTask.crossCheck}
        onCheckedChange={(crossCheck) => patch({ crossCheck })}
      />
      <ReviewModelField
        providerId="claude-code"
        title="Claude Review Model"
        value={reviewTask.modelClaude}
        defaultModel={modelClaude}
        models={catalogs["claude-code"].models}
        onChange={(model) => patch({ modelClaude: model })}
      />
      <ReviewModelField
        providerId="codex"
        title="Codex Review Model"
        value={reviewTask.modelCodex}
        defaultModel={modelCodex}
        models={catalogs.codex.models}
        onChange={(model) => patch({ modelCodex: model })}
      />
      <LabeledField
        title="Default Focus"
        description="Focus areas selected when the dialog opens. Each adds an explicit instruction to the review."
      >
        <ToggleChipGroup
          aria-label="Default review focus"
          options={LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS}
          selected={reviewTask.focuses}
          onToggle={(focus) =>
            patch({
              focuses: reviewTask.focuses.includes(focus)
                ? reviewTask.focuses.filter((item) => item !== focus)
                : [...reviewTask.focuses, focus],
            })
          }
        />
      </LabeledField>
      <ReviewPromptPicker selection={reviewTask} skillSlug={reviewTask.skillSlug}
        skillOptions={skillOptions}
        skillInstructions={skills.find((skill) => skill.slug === reviewTask.skillSlug)?.instructions}
        skillPreviewNote="Skill precedence depends on the reviewer and workspace. Confirm the resolved instructions in the Review dialog."
        onChange={patch} />
      <LabeledField
        title="Review Instructions"
        description={`Added to every review prompt, for example risk areas your team always checks. Up to ${REVIEW_TASK_INSTRUCTIONS_MAX_CHARS.toLocaleString()} characters.`}
      >
        <DraftTextarea
          xstyle={styles.promptTextarea}
          value={reviewTask.instructions}
          maxLength={REVIEW_TASK_INSTRUCTIONS_MAX_CHARS}
          placeholder="For example: check that new settings are persisted and covered by a test."
          onCommit={(instructions) => patch({ instructions })}
        />
      </LabeledField>
      <LabeledField
        title="Follow-up Prompt"
        description="Filled into an empty message when you attach a finished review, so asking the task to act on it is one send away. Empty turns it off."
      >
        <DraftTextarea
          xstyle={styles.promptTextarea}
          value={reviewTask.followUpPrompt}
          maxLength={REVIEW_FOLLOW_UP_PROMPT_MAX_CHARS}
          placeholder="(empty = attach only)"
          onCommit={(followUpPrompt) => patch({ followUpPrompt })}
        />
        {reviewTask.followUpPrompt !== DEFAULT_REVIEW_FOLLOW_UP_PROMPT ? (
          <div className={sx(styles.promptFooter)}>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              xstyle={styles.resetButton}
              onClick={() => patch({ followUpPrompt: DEFAULT_REVIEW_FOLLOW_UP_PROMPT })}
            >
              Reset to default
            </Button>
          </div>
        ) : null}
      </LabeledField>
    </SettingsCard>
  );
}

function PrePrReviewCard() {
  const [prePrReviewEnabled, prePrReviewProvider] = useAppStore(
    useShallow(
      (state) =>
        [state.settings.prePrReviewEnabled, state.settings.prePrReviewProvider] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
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
              icon: providerIcon("claude-code"),
            },
            {
              value: "codex",
              label: "Codex",
              description: "Uses the configured Codex model.",
              icon: providerIcon("codex"),
            },
          ]}
        />
      </LabeledField>
    </SettingsCard>
  );
}
