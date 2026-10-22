import { searchSettingsFields } from "./settings-dialog.registry";
import {
  isSettingsSectionVisible,
  listVisibleSettingsSections,
  matchesSettingsSection,
  settingsSectionGroups,
  settingsSections,
  type SectionId,
  type SettingsSection,
  type SettingsSectionVisibility,
} from "./settings-dialog.schema";
import { matchesSettingsScopeSearch } from "./settings-scope-bar";

export type SettingsSearchField = ReturnType<typeof searchSettingsFields>[number];

export const settingsSectionsById = Object.fromEntries(
  settingsSections.map((section) => [section.id, section]),
) as Record<SectionId, SettingsSection>;

/** What a Settings search query finds, read the same way by every layout. */
export interface SettingsSearch {
  /** The trimmed query; empty until the user types. */
  query: string;
  /** Visible settings whose own words match, in registry order. */
  fields: SettingsSearchField[];
  /** The project scope picker matches. */
  scopeMatches: boolean;
  /** Visible sections whose own words match; empty without a query. */
  sections: SettingsSection[];
  /** Navigation groups that keep a matching section or a section with a match. */
  groups: Array<{ labelKey: (typeof settingsSectionGroups)[number]["labelKey"]; ids: SectionId[] }>;
  /** Nothing answers the query: no setting, section or the scope picker. */
  empty: boolean;
}

export function resolveSettingsSearch(
  rawQuery: string,
  visibility: SettingsSectionVisibility,
): SettingsSearch {
  const query = rawQuery.trim();
  const fields = searchSettingsFields(query).filter((field) =>
    isSettingsSectionVisible(field.sectionId, visibility),
  );
  const scopeMatches = matchesSettingsScopeSearch(query);
  const matchingSections = listVisibleSettingsSections(visibility).filter(
    (section) => matchesSettingsSection(section, query),
  );
  const visibleSectionIds = new Set<SectionId>(
    matchingSections.map((section) => section.id),
  );
  fields.forEach((field) => visibleSectionIds.add(field.sectionId));
  const groups = settingsSectionGroups
    .map((group) => ({
      ...group,
      ids: group.ids.filter((sectionId) => visibleSectionIds.has(sectionId)),
    }))
    .filter((group) => group.ids.length > 0);
  return {
    query,
    fields,
    scopeMatches,
    sections: query ? matchingSections : [],
    groups,
    empty: groups.length === 0 && fields.length === 0 && !scopeMatches,
  };
}
