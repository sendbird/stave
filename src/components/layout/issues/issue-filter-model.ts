import { i18n } from "@/i18n/runtime";
import type { SearchablePickerOption } from "@/components/layout/searchable-picker-option";
import { createTrackerIssueFilter, type TrackerIssueFilter } from "@/lib/tracker-issues/filter";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
} from "@/lib/tracker-issues/presentation";
import {
  TRACKER_PRIORITY_LEVELS,
  TRACKER_SOURCE_IDS,
  TRACKER_STATUS_CATEGORIES,
} from "@/lib/tracker-issues/types";
import { TRACKER_SOURCE_LABELS } from "./tracker-issue-ui";

export interface TrackerIssueFilterOption {
  value: string;
  label: string;
  /** Rows currently matching this option, shown so a dead option is visible. */
  count?: number;
}

/** The facet fields the Filter list picks values for, in menu order. */
export const ISSUE_FILTER_FIELDS = [
  "sources",
  "statusCategories",
  "priorities",
  "projectKeys",
  "labels",
] as const;
export type IssueFilterField = (typeof ISSUE_FILTER_FIELDS)[number];

const FIELD_LABEL_KEYS = {
  sources: "issues:issuesToolbar.source",
  statusCategories: "issues:issuesToolbar.status",
  priorities: "issues:issuesToolbar.priority",
  projectKeys: "issues:issuesToolbar.project",
  labels: "issues:issuesToolbar.label",
} as const satisfies Record<IssueFilterField, string>;

export function issueFilterFieldLabel(field: IssueFilterField) {
  return i18n.t(FIELD_LABEL_KEYS[field]);
}

const SEPARATOR = "\u0000";
const encode = (field: IssueFilterField, value: string) => `${field}${SEPARATOR}${value}`;
const decode = (encoded: string): [IssueFilterField, string] | null => {
  const index = encoded.indexOf(SEPARATOR);
  if (index < 0) return null;
  const field = encoded.slice(0, index) as IssueFilterField;
  return ISSUE_FILTER_FIELDS.includes(field) ? [field, encoded.slice(index + 1)] : null;
};

/** The fixed option lists; projects and labels come from the loaded rows. */
export function fixedIssueFilterOptions(): Record<"sources" | "statusCategories" | "priorities", TrackerIssueFilterOption[]> {
  return {
    sources: TRACKER_SOURCE_IDS.map((source) => ({ value: source, label: TRACKER_SOURCE_LABELS[source] })),
    statusCategories: TRACKER_STATUS_CATEGORIES.map((category) => ({
      value: category,
      label: TRACKER_STATUS_PRESENTATION[category].label,
    })),
    // Urgent first, so the list reads in the same order as the sorted list.
    priorities: [...TRACKER_PRIORITY_LEVELS].reverse().map((level) => ({
      value: level,
      label: TRACKER_PRIORITY_PRESENTATION[level].label,
    })),
  };
}

function optionsByField(args: {
  projectOptions: readonly TrackerIssueFilterOption[];
  labelOptions: readonly TrackerIssueFilterOption[];
}): Record<IssueFilterField, readonly TrackerIssueFilterOption[]> {
  return { ...fixedIssueFilterOptions(), projectKeys: args.projectOptions, labels: args.labelOptions };
}

/**
 * Every value of every facet as one grouped, searchable list: the group
 * heading is the property, so "status" finds the status values and a project
 * key finds its project.
 */
export function issueFilterPickerOptions(args: {
  projectOptions: readonly TrackerIssueFilterOption[];
  labelOptions: readonly TrackerIssueFilterOption[];
}): SearchablePickerOption[] {
  const byField = optionsByField(args);
  return ISSUE_FILTER_FIELDS.flatMap((field) => {
    const group = issueFilterFieldLabel(field);
    return byField[field].map((option) => ({
      value: encode(field, option.value),
      label: option.label,
      keywords: [option.value],
      group,
      meta: option.count === undefined ? undefined : String(option.count),
    }));
  });
}

export function selectedIssueFilterValues(filter: TrackerIssueFilter): string[] {
  return ISSUE_FILTER_FIELDS.flatMap((field) => filter[field].map((value) => encode(field, value)));
}

/** The filter with its facet fields replaced by the picked values; view, the quick filters and search are kept. */
export function applyIssueFilterValues(filter: TrackerIssueFilter, values: readonly string[]): TrackerIssueFilter {
  const next: Record<IssueFilterField, string[]> = {
    sources: [], statusCategories: [], priorities: [], projectKeys: [], labels: [],
  };
  for (const encoded of values) {
    const decoded = decode(encoded);
    if (decoded) next[decoded[0]].push(decoded[1]);
  }
  return { ...filter, ...(next as Pick<TrackerIssueFilter, IssueFilterField>) };
}

export type IssueAppliedFilter = {
  id: IssueFilterField | "linked" | "updated" | "query";
  property: string;
  operator: string;
  value: string;
};

/**
 * One removable chip per narrowed property: "Status is any of In progress,
 * To do". The Stave-runs and Updated quick filters and the search text get a
 * chip too, so every narrowing has a visible way back.
 */
export function issueAppliedFilters(args: {
  filter: TrackerIssueFilter;
  projectOptions: readonly TrackerIssueFilterOption[];
  labelOptions: readonly TrackerIssueFilterOption[];
  linkedLabel: (linked: TrackerIssueFilter["linked"]) => string;
  updatedLabel: (updated: TrackerIssueFilter["updated"]) => string;
}): IssueAppliedFilter[] {
  const byField = optionsByField(args);
  const chips: IssueAppliedFilter[] = [];
  for (const field of ISSUE_FILTER_FIELDS) {
    const values = args.filter[field] as readonly string[];
    if (values.length === 0) continue;
    const labels = values.map(
      (value) => byField[field].find((option) => option.value === value)?.label ?? value,
    );
    chips.push({
      id: field,
      property: issueFilterFieldLabel(field),
      operator: values.length === 1
        ? i18n.t("issues:issuesToolbar.operatorIs")
        : i18n.t("issues:issuesToolbar.operatorIsAnyOf"),
      value: labels.join(", "),
    });
  }
  if (args.filter.linked !== "any") {
    chips.push({
      id: "linked",
      property: i18n.t("issues:issuesToolbar.staveRuns"),
      operator: i18n.t("issues:issuesToolbar.operatorIs"),
      value: args.linkedLabel(args.filter.linked),
    });
  }
  if (args.filter.updated !== "any") {
    chips.push({
      id: "updated",
      property: i18n.t("issues:issuesToolbar.updated"),
      operator: i18n.t("issues:issuesToolbar.operatorWithin"),
      value: args.updatedLabel(args.filter.updated),
    });
  }
  const query = args.filter.query.trim();
  if (query) {
    chips.push({
      id: "query",
      property: i18n.t("issues:issuesToolbar.searchChip"),
      operator: i18n.t("issues:issuesToolbar.operatorContains"),
      value: query,
    });
  }
  return chips;
}

export function removeIssueAppliedFilter(filter: TrackerIssueFilter, id: IssueAppliedFilter["id"]): TrackerIssueFilter {
  if (id === "linked") return { ...filter, linked: "any" };
  if (id === "updated") return { ...filter, updated: "any" };
  if (id === "query") return { ...filter, query: "" };
  return { ...filter, [id]: [] };
}

/** Clear all keeps the view: it clears the filters, it does not move the reader to another list. */
export function clearIssueFilters(filter: TrackerIssueFilter): TrackerIssueFilter {
  return createTrackerIssueFilter(filter.view);
}
