import { i18n } from "@/i18n";
import type * as React from "react";

const CREATE_INPUT_PREFIX = "__aui-create-option__:";

export type CreatablePickerProps = {
  /**
   * Called when the generated create row is activated. The caller owns adding
   * the returned entity to `options` and selecting it; AUI does not perform an
   * optimistic insertion.
   */
  onCreate?: (query: string) => void;
  /** Copy for the generated row. @default `Create “${query}”` */
  createLabel?: (query: string) => React.ReactNode;
};

export type CreateOption = {
  __auiCreate: true;
  label: string;
  query: string;
  value: string;
};

export type CreatableOption<Option> = Option | CreateOption;

export function defaultCreateLabel(query: string) {
  return i18n.t("ui:combobox.create", { query });
}

export function getCreateOption(
  query: string,
  optionLabels: readonly string[],
  enabled: boolean,
): CreateOption | null {
  if (!enabled) return null;

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;
  if (optionLabels.some((label) => normalize(label) === normalizedQuery)) {
    return null;
  }

  const trimmedQuery = query.trim();
  return {
    __auiCreate: true,
    label: trimmedQuery,
    query: trimmedQuery,
    value: `${CREATE_INPUT_PREFIX}${trimmedQuery}`,
  };
}

export function isCreateOption(value: unknown): value is CreateOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "__auiCreate" in value &&
    value.__auiCreate === true
  );
}

export function isCreateInputValue(value: string) {
  return value.startsWith(CREATE_INPUT_PREFIX);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}
