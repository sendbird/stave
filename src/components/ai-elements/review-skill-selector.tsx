import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import {
  SearchablePicker,
  type SearchablePickerOption,
} from "@/components/layout/settings-searchable-picker";

export interface ReviewSkillOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
}

/** Copy for a selector that picks something other than a review skill. */
export interface ReviewOptionSelectorCopy {
  trigger: string;
  triggerAria: string;
  search: string;
  searchAria: string;
  empty: string;
}

/**
 * Picks a review skill (or another review option) from a searchable list:
 * name, description and keywords match, and the "no skill" choice stays an
 * ordinary row.
 */
export function ReviewSkillSelector(args: {
  "aria-labelledby"?: string;
  value: string;
  options: readonly ReviewSkillOption[];
  onValueChange: (value: string) => void;
  /** Replaces the review-skill copy; translated by the caller. */
  copy?: ReviewOptionSelectorCopy;
}) {
  useTranslation();
  const options = useMemo<SearchablePickerOption[]>(
    () =>
      args.options.map((option) => ({
        value: option.value,
        label: option.label,
        detail: option.description,
        keywords: option.keywords,
      })),
    [args.options],
  );
  return (
    <SearchablePicker
      labelledBy={args["aria-labelledby"]}
      aria-label={args.copy?.triggerAria ?? i18n.t("ui:reviewSkillSelector.reviewSkill")}
      value={args.value}
      placeholder={args.copy?.trigger ?? i18n.t("ui:reviewSkillSelector.noSkill")}
      options={options}
      onSelect={args.onValueChange}
      searchPlaceholder={args.copy?.search ?? i18n.t("ui:reviewSkillSelector.searchSkills")}
      searchLabel={args.copy?.searchAria ?? i18n.t("ui:reviewSkillSelector.searchReviewSkills")}
      emptyText={args.copy?.empty ?? i18n.t("ui:reviewSkillSelector.noSkillsFound")}
    />
  );
}
