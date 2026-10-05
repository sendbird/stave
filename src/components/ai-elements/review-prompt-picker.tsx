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
  const id = useId();
  const [showPreview, setShowPreview] = useState(false);
  const { promptSource, presetId, customPrompt } = args.selection;
  const preset = getReviewPromptPreset(presetId);
  const skillMissing = promptSource === "skill" && !args.skillInstructions?.trim();
  const skillOptions = args.skillSlug && !args.skillOptions.some((entry) => entry.value === args.skillSlug)
    ? [...args.skillOptions, { value: args.skillSlug, label: `$${args.skillSlug} (unavailable)` }]
    : args.skillOptions;
  const rubric = promptSource === "preset" ? preset.instructions
    : promptSource === "custom" ? customPrompt : args.skillInstructions ?? "";

  return (
    <div className={sx(styles.stack)}>
      <div className={sx(styles.field)}>
        <label id={`${id}-source`} className={sx(styles.label)}>Review prompt</label>
        <p className={sx(styles.help)}>Choose a built-in rubric, an installed skill, or your own prompt. Every choice uses evidence checks and a read-only review.</p>
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
          <label id={`${id}-preset`} className={sx(styles.label)}>Review preset</label>
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
          <label id={`${id}-skill`} className={sx(styles.label)}>Review skill</label>
          <ReviewSkillSelector
            aria-labelledby={`${id}-skill`}
            value={args.skillSlug}
            options={skillOptions}
            onValueChange={(value) => args.onChange({ skillSlug: value })}
          />
          <p className={sx(styles.help)} role={skillMissing ? "status" : undefined}>
            {skillMissing ? "Choose a skill available to this reviewer. An unavailable skill cannot start a review."
              : "The skill supplies the rubric. Its instructions cannot permit file changes or publishing a review."}
          </p>
        </div>
      ) : (
        <div className={sx(styles.field)}>
          <label htmlFor={`${id}-custom`} className={sx(styles.label)}>Custom review prompt</label>
          <Textarea
            id={`${id}-custom`}
            xstyle={styles.prompt}
            value={customPrompt}
            maxLength={REVIEW_CUSTOM_PROMPT_MAX_CHARS}
            placeholder="Describe what to check, the evidence required, and the relevant repository or domain rules."
            onChange={(event) => args.onChange({ customPrompt: event.target.value })}
          />
          <p className={sx(styles.help)}>Replaces the preset rubric. Scope, evidence checks and the findings format still apply. Up to {REVIEW_CUSTOM_PROMPT_MAX_CHARS.toLocaleString()} characters.</p>
        </div>
      )}
      <Button type="button" size="sm" variant="quiet" xstyle={styles.previewButton}
        aria-expanded={showPreview} aria-controls={`${id}-preview`}
        onClick={() => setShowPreview((shown) => !shown)}>
        {showPreview ? "Hide prompt preview" : "Preview prompt"}
      </Button>
      {showPreview ? (
        <div id={`${id}-preview`} className={sx(styles.field)}>
          <p className={sx(styles.help)}>Selected rubric and shared evidence checks. The review also receives its scope, focus, additional instructions and required findings format.</p>
          {promptSource === "skill" && args.skillPreviewNote ? <p className={sx(styles.help)}>{args.skillPreviewNote}</p> : null}
          <Textarea aria-label="Review prompt preview" readOnly xstyle={styles.preview}
            value={`${rubric || "(Choose a skill or enter a custom prompt.)"}\n\n${REVIEW_EVIDENCE_INSTRUCTIONS}`} />
        </div>
      ) : null}
    </div>
  );
}
