import type { ReactNode } from "react";

export type SearchablePickerOption = {
  value: string;
  label: string;
  /** Secondary line, such as an ID. Searched together with the label. */
  detail?: string;
  /** Decorative leading mark, such as a provider logo. */
  icon?: ReactNode;
  /** More words the search matches, such as a full identifier or a description. */
  keywords?: readonly string[];
  /** Short marker after the label, such as "current". */
  badge?: string;
  /** Muted trailing value, such as a price or a row count; never searched. */
  meta?: string;
  /** Section heading shared by related options; options keep their given order. */
  group?: string;
};

/**
 * Whether an option matches a search: every word of the query must appear in
 * its label, value, detail, keywords or group heading (case-insensitive).
 */
export function matchesSearchablePickerOption(option: SearchablePickerOption, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [option.label, option.value, option.detail, option.group, ...(option.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
