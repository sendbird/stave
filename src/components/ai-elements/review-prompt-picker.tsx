import { useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { ReviewSkillSelector, type ReviewSkillOption } from "@/components/ai-elements/review-skill-selector";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Textarea } from "@/components/ui";
import {
  REVIEW_CUSTOM_PROMPT_MAX_CHARS,
  REVIEW_EVIDENCE_INSTRUCTIONS,
  REVIEW_PROMPT_PRESETS,
  REVIEW_PROMPT_SOURCE_OPTIONS,
  getReviewPromptPreset,
  type ReviewPromptSelection,
  type ReviewPromptSource,
} from "@/lib/reviews/review-prompts";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"], minWidth: 0 },
  field: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  label: { fontSize: vars["--ads-font-size-body"], fontWeight: 500, color: vars["--ads-color-text"] },
  help: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"], margin: 0 },
  prompt: { minHeight: 144, resize: "vertical" },
  preview: { height: 240, resize: "vertical" },
  previewButton: { alignSelf: "flex-start" },
});

/** Shared per-review and Settings picker; inactive choices keep their drafts. */
export function ReviewPromptPicker(args: {
  selection: ReviewPromptSelection;
  skillSlug: string;
  skillOptions: readonly ReviewSkillOption[];
  skillInstructions?: string;
  skillPreviewNote?: string;
  onChange: (patch: Partial<ReviewPromptSelection> & { skillSlug?: string }) => void;
}) {
  const { t } = useTranslation("composer");
  const id = useId();
  const [showPreview, setShowPreview] = useState(false);
  const { promptSource, presetId, customPrompt } = args.selection;
  const preset = getReviewPromptPreset(presetId);
  const skillMissing = promptSource === "skill" && !args.skillInstructions?.trim();
  const skillOptions = args.skillSlug && !args.skillOptions.some((entry) => entry.value === args.skillSlug)
    ? [...args.skillOptions, { value: args.skillSlug, label: t("reviewPromptPicker.unavailableSkill", { skill: args.skillSlug }) }]
    : args.skillOptions;
  const rubric = promptSource === "preset" ? preset.instructions
    : promptSource === "custom" ? customPrompt : args.skillInstructions ?? "";

  return (
    <div className={sx(styles.stack)}>
      <div className={sx(styles.field)}>
        <label id={`${id}-source`} className={sx(styles.label)}>{t("reviewPromptPicker.title")}</label>
        <p className={sx(styles.help)}>{t("reviewPromptPicker.description")}</p>
        <Select
          size="sm"
          aria-labelledby={`${id}-source`}
          value={promptSource}
          options={REVIEW_PROMPT_SOURCE_OPTIONS}
          onValueChange={(value) => args.onChange({ promptSource: value as ReviewPromptSource })}
        />
      </div>
      {promptSource === "preset" ? (
        <div className={sx(styles.field)}>
          <label id={`${id}-preset`} className={sx(styles.label)}>{t("reviewPromptPicker.preset")}</label>
          <Select
            size="sm"
            aria-labelledby={`${id}-preset`}
            value={presetId}
            options={REVIEW_PROMPT_PRESETS.map((entry) => ({ value: entry.id, label: entry.label, description: entry.description }))}
            onValueChange={(value) => args.onChange({ presetId: getReviewPromptPreset(value).id })}
          />
          <p className={sx(styles.help)}>{preset.description}</p>
        </div>
      ) : promptSource === "skill" ? (
        <div className={sx(styles.field)}>
          <label id={`${id}-skill`} className={sx(styles.label)}>{t("reviewPromptPicker.skill")}</label>
          <ReviewSkillSelector
            aria-labelledby={`${id}-skill`}
            value={args.skillSlug}
            options={skillOptions}
            onValueChange={(value) => args.onChange({ skillSlug: value })}
          />
          <p className={sx(styles.help)} role={skillMissing ? "status" : undefined}>
            {skillMissing ? t("reviewPromptPicker.skillMissing")
              : t("reviewPromptPicker.skillDescription")}
          </p>
        </div>
      ) : (
        <div className={sx(styles.field)}>
          <label htmlFor={`${id}-custom`} className={sx(styles.label)}>{t("reviewPromptPicker.custom")}</label>
          <Textarea
            id={`${id}-custom`}
            xstyle={styles.prompt}
            value={customPrompt}
            maxLength={REVIEW_CUSTOM_PROMPT_MAX_CHARS}
            placeholder={t("reviewPromptPicker.placeholder")}
            onChange={(event) => args.onChange({ customPrompt: event.target.value })}
          />
          <p className={sx(styles.help)}>{t("reviewPromptPicker.customDescription", { limit: formatNumber(REVIEW_CUSTOM_PROMPT_MAX_CHARS) })}</p>
        </div>
      )}
      <Button type="button" size="sm" variant="quiet" xstyle={styles.previewButton}
        aria-expanded={showPreview} aria-controls={`${id}-preview`}
        onClick={() => setShowPreview((shown) => !shown)}>
        {showPreview ? t("reviewPromptPicker.hidePreview") : t("reviewPromptPicker.showPreview")}
      </Button>
      {showPreview ? (
        <div id={`${id}-preview`} className={sx(styles.field)}>
          <p className={sx(styles.help)}>{t("reviewPromptPicker.previewDescription")}</p>
          {promptSource === "skill" && args.skillPreviewNote ? <p className={sx(styles.help)}>{args.skillPreviewNote}</p> : null}
          <Textarea aria-label={t("reviewPromptPicker.previewLabel")} readOnly xstyle={styles.preview}
            value={`${rubric || t("reviewPromptPicker.emptyRubric")}\n\n${REVIEW_EVIDENCE_INSTRUCTIONS}`} />
        </div>
      ) : null}
    </div>
  );
}
