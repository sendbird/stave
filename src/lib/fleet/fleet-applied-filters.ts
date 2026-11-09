import { i18n } from "@/i18n/runtime";
import { FLEET_TABLE_FILTER_OPTIONS, type FleetTaskTableFilter } from "./task-rows";
import { FLEET_OWNER_FILTER_OPTIONS, type FleetOwnerFilter } from "./task-owner";

export type FleetAppliedFilter = {
  id: "status" | "owner" | "query";
  property: string;
  operator: string;
  value: string;
};

/**
 * The Fleet board's filters that narrow it from its default (Active, every
 * owner, no search), as removable chips. Removing `status` returns the board
 * to Active, removing `owner` to every owner, and removing `query` clears the
 * search.
 */
export function fleetAppliedFilters(args: {
  filter: FleetTaskTableFilter;
  owner?: FleetOwnerFilter;
  query: string;
}): FleetAppliedFilter[] {
  const filters: FleetAppliedFilter[] = [];
  if (args.filter !== "active") {
    const option = FLEET_TABLE_FILTER_OPTIONS.find((candidate) => candidate.value === args.filter);
    filters.push({
      id: "status",
      property: i18n.t("fleet:fleetView.appliedStatus"),
      operator: i18n.t("fleet:fleetView.appliedIs"),
      value: option?.label ?? args.filter,
    });
  }
  if (args.owner && args.owner !== "all") {
    const option = FLEET_OWNER_FILTER_OPTIONS.find((candidate) => candidate.value === args.owner);
    filters.push({
      id: "owner",
      property: i18n.t("fleet:ownerFilter.label"),
      operator: i18n.t("fleet:fleetView.appliedIs"),
      value: option?.label ?? args.owner,
    });
  }
  const query = args.query.trim();
  if (query) {
    filters.push({
      id: "query",
      property: i18n.t("fleet:fleetView.appliedSearch"),
      operator: i18n.t("fleet:fleetView.appliedContains"),
      value: query,
    });
  }
  return filters;
}
