import type * as React from "react";

export type ComboboxOption = {
  description?: string;
  disabled?: boolean;
  /** Non-selectable section heading for this option. */
  group?: string;
  /** Leading glyph for people, status, or color options. */
  icon?: React.ReactNode;
  /**
   * The row's content. A node, not a string, so a row can BE a status chip, a
   * score, or a glyph with a count. Pass `text` alongside whenever it is not a
   * plain string.
   */
  label: React.ReactNode;
  /**
   * Plain text for the machinery a node cannot serve: typeahead, the create
   * row's exact-match check, the value the field shows when the row is chosen,
   * the chip's remove label, and the accessible name.
   *
   * Optional only because a string `label` already answers all of them.
   * Omitting it on a node label leaves the row unsearchable and unnamed, which
   * is why `optionText` falls back to an empty string rather than to
   * `String(label)` — `[object Object]` in a field is worse than nothing.
   */
  text?: string;
  /**
   * Trailing status mark for the row — a `Badge` saying the option is already
   * in use, a shortcut hint. It sits at the row's end, opposite the leading
   * `icon`, and is the slot a row's *state* belongs in: `description` is the
   * option's second line and `label` is the value the input echoes, so a
   * status pushed into either one reads as part of the option's name.
   *
   * It is display only. A row that cannot be picked still says so through
   * `disabled`; a mark alone leaves the option selectable.
   */
  trailing?: React.ReactNode;
  value: string;
};

/**
 * The string behind an option: its own `text`, or its `label` when that is
 * already a string. Everything that needs words rather than a node goes
 * through here so the fallback is stated once.
 */
export const optionText = (option: {
  label: React.ReactNode;
  text?: string;
}): string =>
  option.text ?? (typeof option.label === "string" ? option.label : "");

export type OptionGroup<Option> = {
  items: Option[];
  value: string;
};

/** Groups options in source order and appends unlabelled trailing rows last. */
export function groupOptions<Option extends { group?: string }>(
  options: readonly Option[],
  trailing: readonly Option[] = [],
): OptionGroup<Option>[] {
  const sections: OptionGroup<Option>[] = [];
  const byLabel = new Map<string, OptionGroup<Option>>();

  for (const option of options) {
    const key = option.group ?? "";
    let section = byLabel.get(key);
    if (!section) {
      section = { items: [], value: key };
      byLabel.set(key, section);
      sections.push(section);
    }
    section.items.push(option);
  }

  return [
    ...sections.filter((section) => section.value === ""),
    ...sections.filter((section) => section.value !== ""),
    ...(trailing.length > 0
      ? [{ items: [...trailing], value: "__aui-trailing" }]
      : []),
  ];
}
