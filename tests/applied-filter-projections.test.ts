import { describe, expect, test } from "bun:test";

import { fleetAppliedFilters } from "@/lib/fleet/fleet-applied-filters";
import { automationRunAppliedFilters } from "@/components/layout/automation-center/automation-center.utils";

describe("applied filter chips", () => {
  test("Fleet shows a chip only for what narrows the board from Active with no search", () => {
    expect(fleetAppliedFilters({ filter: "active", query: "  " })).toEqual([]);
    const chips = fleetAppliedFilters({ filter: "running", query: " login " });
    expect(chips.map((chip) => chip.id)).toEqual(["status", "query"]);
    expect(chips.map((chip) => `${chip.property} ${chip.operator} ${chip.value}`)).toEqual([
      "Status is Running",
      "Search contains login",
    ]);
  });

  test("run history shows status and automation chips only when they narrow the list", () => {
    expect(automationRunAppliedFilters({ status: "all", automationName: null })).toEqual([]);
    const chips = automationRunAppliedFilters({ status: "failed", automationName: "Nightly triage" });
    expect(chips.map((chip) => `${chip.id}: ${chip.property} ${chip.operator} ${chip.value}`)).toEqual([
      "status: Status is Failed",
      "automation: Automation is Nightly triage",
    ]);
  });
});
