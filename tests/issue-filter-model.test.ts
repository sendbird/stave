import { afterEach, describe, expect, test } from "bun:test";

import { applyAppLocale } from "@/i18n";
import {
  applyIssueFilterValues,
  clearIssueFilters,
  issueAppliedFilters,
  issueFilterPickerOptions,
  removeIssueAppliedFilter,
  selectedIssueFilterValues,
} from "@/components/layout/issues/issue-filter-model";
import { matchesSearchablePickerOption } from "@/components/layout/searchable-picker-option";
import { createTrackerIssueFilter } from "@/lib/tracker-issues/filter";

const projectOptions = [{ value: "UX", label: "UX", count: 3 }];
const labelOptions = [{ value: "design", label: "design", count: 2 }];
const linkedLabel = (linked: string) => (linked === "linked" ? "In Stave" : "Not in Stave");
const updatedLabel = (updated: string) => (updated === "30" ? "Last 30 days" : updated);

describe("issue filter model", () => {
  afterEach(() => applyAppLocale("en"));

  test("one grouped list of every property's values; the heading and the value both search", () => {
    const options = issueFilterPickerOptions({ projectOptions, labelOptions });
    expect(new Set(options.map((option) => option.group))).toEqual(new Set(["Source", "Status", "Priority", "Project", "Label"]));
    const progress = options.filter((option) => matchesSearchablePickerOption(option, "progress"));
    expect(progress.map((option) => option.label)).toEqual(["In progress"]);
    // The property name finds its values.
    expect(options.filter((option) => matchesSearchablePickerOption(option, "label")).map((option) => option.label)).toEqual(["design"]);
    // Counts ride along as a muted value, never as search text.
    expect(options.find((option) => option.label === "design")?.meta).toBe("2");
    expect(options.filter((option) => matchesSearchablePickerOption(option, "2"))).toEqual([]);
  });

  test("picked values round-trip into the filter and keep the view, link filter and search", () => {
    const base = { ...createTrackerIssueFilter("all-open"), linked: "linked" as const, query: "rail" };
    const options = issueFilterPickerOptions({ projectOptions, labelOptions });
    const pick = (label: string) => options.find((option) => option.label === label)!.value;
    const next = applyIssueFilterValues(base, [pick("In progress"), pick("To do"), pick("design")]);
    expect(next.statusCategories).toEqual(["in_progress", "todo"]);
    expect(next.labels).toEqual(["design"]);
    expect(next.view).toBe("all-open");
    expect(next.linked).toBe("linked");
    expect(next.query).toBe("rail");
    expect(selectedIssueFilterValues(next).sort()).toEqual([pick("In progress"), pick("To do"), pick("design")].sort());
  });

  test("one chip per narrowed property, removable one at a time, and Clear all keeps the view", () => {
    const filter = {
      ...createTrackerIssueFilter("all-open"),
      statusCategories: ["in_progress", "todo"] as ["in_progress", "todo"],
      labels: ["design"],
      linked: "linked" as const,
      updated: "30" as const,
      query: "rail",
    };
    const chips = issueAppliedFilters({ filter, projectOptions, labelOptions, linkedLabel, updatedLabel });
    expect(chips.map((chip) => `${chip.property} ${chip.operator} ${chip.value}`)).toEqual([
      "Status is any of In progress, To do",
      "Label is design",
      "Stave runs is In Stave",
      "Updated within Last 30 days",
      "Search contains rail",
    ]);
    const withoutStatus = removeIssueAppliedFilter(filter, "statusCategories");
    expect(withoutStatus.statusCategories).toEqual([]);
    expect(withoutStatus.labels).toEqual(["design"]);
    expect(removeIssueAppliedFilter(filter, "linked").linked).toBe("any");
    expect(removeIssueAppliedFilter(filter, "query").query).toBe("");
    expect(removeIssueAppliedFilter(filter, "updated").updated).toBe("any");
    expect(clearIssueFilters(filter)).toEqual(createTrackerIssueFilter("all-open"));
  });

  test("chip words are Korean in the Korean UI", () => {
    applyAppLocale("ko");
    const filter = { ...createTrackerIssueFilter("all-open"), statusCategories: ["todo"] as ["todo"] };
    const [chip] = issueAppliedFilters({ filter, projectOptions, labelOptions, linkedLabel, updatedLabel });
    expect(chip?.property).toBe("상태");
    expect(chip?.operator).toBe("일치");
  });
});
