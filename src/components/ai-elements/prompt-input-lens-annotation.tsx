import { i18n, useTranslation } from "@/i18n";
import { Tooltip as AdsTooltip } from "@/components/ads/components/Tooltip";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
  PopoverTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import type {
  LensAnnotationFeedback,
  LensAnnotation,
} from "@/lib/lens/lens.types";
import {
  LENS_FEEDBACK_INTENTS,
  LENS_FEEDBACK_PRIORITIES,
} from "@/lib/lens/lens.types";
import { resolveLensAnnotationReview } from "@/lib/lens/lens-element-message";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";

const LENS_ANNOTATION_STYLE_FIELDS = [
  "fontSize",
  "fontWeight",
  "color",
  "backgroundColor",
  "padding",
  "margin",
] as const;

function resolveLensAnnotationStyleValue(
  annotation: LensAnnotation,
  field: (typeof LENS_ANNOTATION_STYLE_FIELDS)[number],
): string {
  const edit = annotation.styleEdits
    ?.slice()
    .reverse()
    .find((candidate) => candidate.property === field);
  return edit?.after ?? annotation.computedStyles?.[field] ?? "";
}

export function LensAnnotationStylePopover(args: {
  annotation: LensAnnotation;
  disabled: boolean;
  onApply: (
    annotation: LensAnnotation,
    patch: Record<string, string>,
  ) => Promise<void>;
}) {
  useTranslation();
  const { annotation, disabled, onApply } = args;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of LENS_ANNOTATION_STYLE_FIELDS) {
      next[field] = resolveLensAnnotationStyleValue(annotation, field);
    }
    setDraft(next);
  }, [annotation]);

  const patch = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(draft).filter(([field, value]) => {
          const trimmed = value.trim();
          return (
            trimmed !== "" &&
            trimmed !==
              resolveLensAnnotationStyleValue(
                annotation,
                field as (typeof LENS_ANNOTATION_STYLE_FIELDS)[number],
              )
          );
        }),
      ),
    [annotation, draft],
  );

  return (
    <Popover>
      <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel", { value1: annotation.pin })}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled || !annotation.selector}
              aria-label={i18n.t("composer:promptInput.ariaLabel", { value1: annotation.pin })}
            />
          }
        >
          <SlidersHorizontal className={sx(promptInputStyles.icon3)} />
        </PopoverTrigger>
      </AdsTooltip>
      <PopoverContent align="end" xstyle={promptInputStyles.lensPopover72}>
        <div>
          <PopoverTitle>{i18n.t("composer:promptInput.lensAnnotationStylePopover")}</PopoverTitle>
          <PopoverDescription>
            {i18n.t("composer:promptInput.lensAnnotationStylePopover2")}</PopoverDescription>
        </div>
        <div className={sx(promptInputStyles.fieldGrid)}>
          {LENS_ANNOTATION_STYLE_FIELDS.map((field) => (
            <label key={field} className={sx(promptInputStyles.fieldLabel)}>
              <span className={sx(promptInputStyles.fieldLabelText)}>{field}</span>
              <Input
                value={draft[field] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className={sx(promptInputStyles.inputField)}
              />
            </label>
          ))}
        </div>
        <Button
          type="button"
          size="xs"
          className={sx(promptInputStyles.fullWidth)}
          disabled={saving || Object.keys(patch).length === 0}
          onClick={() => {
            setSaving(true);
            void onApply(annotation, patch).finally(() => setSaving(false));
          }}
        >
          {i18n.t("composer:promptInput.lensAnnotationStylePopover3")}</Button>
      </PopoverContent>
    </Popover>
  );
}

export function formatLensFeedbackOption(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function LensAnnotationFeedbackPopover(args: {
  annotation: LensAnnotation;
  disabled: boolean;
  onApply: (
    annotation: LensAnnotation,
    feedback: LensAnnotationFeedback,
  ) => void;
}) {
  useTranslation();
  const { annotation, disabled, onApply } = args;
  const feedback = resolveLensAnnotationReview(annotation).feedback;
  const [intent, setIntent] = useState(feedback.intent);
  const [priority, setPriority] = useState(feedback.priority);

  useEffect(() => {
    setIntent(feedback.intent);
    setPriority(feedback.priority);
  }, [feedback.intent, feedback.priority]);

  const changed = intent !== feedback.intent || priority !== feedback.priority;

  return (
    <Popover>
      <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel2", { value1: annotation.pin })}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled}
              aria-label={i18n.t("composer:promptInput.ariaLabel2", { value1: annotation.pin })}
            />
          }
        >
          <Pencil className={sx(promptInputStyles.icon3)} />
        </PopoverTrigger>
      </AdsTooltip>
      <PopoverContent align="end" xstyle={promptInputStyles.lensPopover64}>
        <div>
          <PopoverTitle>{i18n.t("composer:promptInput.lensAnnotationFeedbackPopover")}</PopoverTitle>
          <PopoverDescription>
            {i18n.t("composer:promptInput.lensAnnotationFeedbackPopover2")}</PopoverDescription>
        </div>
        <div className={sx(promptInputStyles.fieldGridCols2)}>
          <label className={sx(promptInputStyles.fieldLabel)}>
            <span className={sx(promptInputStyles.fieldLabelText)}>{i18n.t("composer:promptInput.lensAnnotationFeedbackPopover3")}</span>
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger
                size="sm"
                className={sx(promptInputStyles.fullWidth)}
                aria-label={i18n.t("composer:promptInput.ariaLabel3", { value1: annotation.pin })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {LENS_FEEDBACK_INTENTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatLensFeedbackOption(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className={sx(promptInputStyles.fieldLabel)}>
            <span className={sx(promptInputStyles.fieldLabelText)}>{i18n.t("composer:promptInput.lensAnnotationFeedbackPopover4")}</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger
                size="sm"
                className={sx(promptInputStyles.fullWidth)}
                aria-label={i18n.t("composer:promptInput.ariaLabel4", { value1: annotation.pin })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {LENS_FEEDBACK_PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatLensFeedbackOption(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <Button
          type="button"
          size="xs"
          className={sx(promptInputStyles.fullWidth)}
          disabled={!changed}
          onClick={() =>
            onApply(annotation, {
              ...feedback,
              intent,
              priority,
            })
          }
        >
          {i18n.t("composer:promptInput.lensAnnotationFeedbackPopover5")}</Button>
      </PopoverContent>
    </Popover>
  );
}
