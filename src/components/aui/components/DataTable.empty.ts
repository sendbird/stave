import { isValidElement } from "react";
import type * as React from "react";

import { i18n } from "@/i18n";

import type { EmptyStateProps } from "./EmptyState";

export type DataTableEmptyState = Pick<
  EmptyStateProps,
  | "action"
  | "description"
  | "headingLevel"
  | "icon"
  | "title"
  | "tone"
  | "variant"
>;

/**
 * What `DataTable` shows in place of rows: an object configures the default
 * `EmptyState` (every field optional), any other node replaces it — drawn in
 * the same body cell, under the header row, held to the frame's visible width.
 */
export type DataTableEmptyStateSlot =
  | Partial<DataTableEmptyState>
  | React.ReactNode;

function isEmptyStateConfig(
  value: unknown,
): value is Partial<DataTableEmptyState> {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !isValidElement(value) &&
    !(Symbol.iterator in value)
  );
}

/**
 * Resolve `emptyState` into either a node to
 * draw as given or the default `EmptyState`'s props, with the copy that fits
 * a filtered table or an unfiltered one when the caller states none.
 */
export function resolveDataTableEmpty(
  slot: DataTableEmptyStateSlot,
  filtered: boolean,
): { content?: React.ReactNode; props: EmptyStateProps } {
  const defaults = filtered
    ? {
        description: i18n.t("ui:dataTable.empty.filteredDescription"),
        title: i18n.t("ui:dataTable.empty.filteredTitle"),
      }
    : {
        description: i18n.t("ui:dataTable.empty.description"),
        title: i18n.t("ui:dataTable.empty.title"),
      };
  const config = isEmptyStateConfig(slot) ? slot : undefined;
  const custom = slot != null && slot !== false && config === undefined;
  return {
    content: custom ? (slot as React.ReactNode) : undefined,
    props: {
      action: config?.action,
      description: config?.description ?? defaults.description,
      headingLevel: config?.headingLevel,
      icon: config?.icon,
      title: config?.title ?? defaults.title,
      tone: config?.tone,
      variant: config?.variant,
    },
  };
}
