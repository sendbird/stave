import { formatNumber } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
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
import { useAppStore } from "@/store/app.store";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import type { SectionId } from "../settings-dialog.schema";
import { SettingsSectionLink } from "../settings-dialog-section-link";
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

/** Review settings: the composer's review tasks and a pointer to pre-PR review. */
export function ReviewSettingsCards(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  return (
    <>
      <ReviewTasksCard />
      <PrePrReviewPointerCard onNavigateSection={args.onNavigateSection} />
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
  const { t } = useTranslation(I18N_NAMESPACES);
  const options = useMemo(
    () => [
      {
        value: FOLLOW_DEFAULT,
        label: i18n.t("settings:settingsDialogReviewCards.defaultModel", { value1: toHumanModelName({ model: props.defaultModel }) }),
      },
      ...[...new Set([props.value, ...props.models])]
        .filter(Boolean)
        .map((model) => ({ value: model, label: toHumanModelName({ model }) })),
    ],
    [props.defaultModel, props.models, props.value, i18n.language],
  );
  return (
    <SelectField<string>
      title={props.title}
      description={t("settings:reviewCards.tasks.modelField.description")}
      value={props.value || FOLLOW_DEFAULT}
      options={options}
      onChange={(model) => props.onChange(model === FOLLOW_DEFAULT ? "" : model)}
    />
  );
}

function ReviewTasksCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
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
      { value: "", label: i18n.t("composer:reviewPromptPicker.chooseSkill") },
      ...(reviewTask.skillSlug && !slugs.includes(reviewTask.skillSlug)
        ? [{ value: reviewTask.skillSlug, label: i18n.t("settings:settingsDialogReviewCards.notInThisWorkspace", { value1: reviewTask.skillSlug }) }]
        : []),
      ...slugs.map((slug) => ({
        value: slug,
        label: `$${slug}`,
        keywords: skills
          .filter((skill) => skill.slug === slug)
          .flatMap((skill) => [skill.name, skill.description]),
      })),
    ];
  }, [reviewTask.skillSlug, skills, i18n.language]);

  return (
    <SettingsCard
      id={REVIEW_TASK_SETTING_FIELD_ID}
      tabIndex={-1}
      title={t("settings:reviewCards.tasks.title")}
      description={t("settings:reviewCards.tasks.description")}
    >
      <LabeledField
        title={t("settings:reviewCards.tasks.defaultReviewer.title")}
        description={t("settings:reviewCards.tasks.defaultReviewer.description")}
      >
        <ChoiceButtons<ReviewerPreference>
          value={reviewTask.reviewer}
          columns={3}
          onChange={(reviewer) => patch({ reviewer })}
          options={[
            {
              value: "other",
              label: t("settings:reviewCards.tasks.defaultReviewer.otherProvider"),
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
        title={t("settings:reviewCards.tasks.crossCheck.title")}
        description={t("settings:reviewCards.tasks.crossCheck.description")}
        checked={reviewTask.crossCheck}
        onCheckedChange={(crossCheck) => patch({ crossCheck })}
      />
      <ReviewModelField
        providerId="claude-code"
        title={t("settings:reviewCards.tasks.claudeModel")}
        value={reviewTask.modelClaude}
        defaultModel={modelClaude}
        models={catalogs["claude-code"].models}
        onChange={(model) => patch({ modelClaude: model })}
      />
      <ReviewModelField
        providerId="codex"
        title={t("settings:reviewCards.tasks.codexModel")}
        value={reviewTask.modelCodex}
        defaultModel={modelCodex}
        models={catalogs.codex.models}
        onChange={(model) => patch({ modelCodex: model })}
      />
      <LabeledField
        title={t("settings:reviewCards.tasks.focus.title")}
        description={t("settings:reviewCards.tasks.focus.description")}
      >
        <ToggleChipGroup
          aria-label={t("settings:reviewCards.tasks.focus.ariaLabel")}
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
        skillPreviewNote={t("settings:reviewCards.tasks.skillPreviewNote")}
        onChange={patch} />
      <LabeledField
        title={t("settings:reviewCards.tasks.instructions.title")}
        description={t("settings:settingsDialogReviewCards.addedToEveryReviewPromptFor", { value1: formatNumber(REVIEW_TASK_INSTRUCTIONS_MAX_CHARS) })}
      >
        <DraftTextarea
          xstyle={styles.promptTextarea}
          value={reviewTask.instructions}
          maxLength={REVIEW_TASK_INSTRUCTIONS_MAX_CHARS}
          placeholder={t("settings:reviewCards.tasks.instructions.placeholder")}
          onCommit={(instructions) => patch({ instructions })}
        />
      </LabeledField>
      <LabeledField
        title={t("settings:reviewCards.tasks.followUp.title")}
        description={t("settings:reviewCards.tasks.followUp.description")}
      >
        <DraftTextarea
          xstyle={styles.promptTextarea}
          value={reviewTask.followUpPrompt}
          maxLength={REVIEW_FOLLOW_UP_PROMPT_MAX_CHARS}
          placeholder={t("settings:reviewCards.tasks.followUp.placeholder")}
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
              {t("settings:reviewCards.tasks.followUp.resetToDefault")}</Button>
          </div>
        ) : null}
      </LabeledField>
    </SettingsCard>
  );
}

/**
 * Pre-PR review's on/off, provider and model are owned by Background AI; this
 * card only says where they went.
 */
function PrePrReviewPointerCard(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <SettingsCard
      title={t("settings:reviewCards.prePr.title")}
      description={t("settings:reviewCards.prePr.description")}
    >
      <SettingsSectionLink
        title={t("settings:reviewCards.prePr.link.title")}
        description={t("settings:reviewCards.prePr.link.description")}
        actionLabel={t("settings:reviewCards.prePr.link.action")}
        target="auxiliaryInference"
        onNavigateSection={args.onNavigateSection}
      />
    </SettingsCard>
  );
}
