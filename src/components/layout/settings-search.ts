import { searchSettingsFields } from "./settings-dialog.registry";
import {
  getSettingsSectionNavigationOrder,
  listVisibleSettingsPageSections,
  matchesSettingsPage,
  settingsPageGroups,
  settingsPagesById,
  type SettingsPageId,
} from "./settings-dialog.pages";
import {
  isSettingsSectionVisible,
  matchesSettingsSection,
  settingsSectionsById,
  type SectionId,
  type SettingsI18nKey,
  type SettingsSectionVisibility,
} from "./settings-dialog.schema";
import { matchesSettingsScopeSearch } from "./settings-scope-bar";

export type SettingsSearchField = ReturnType<typeof searchSettingsFields>[number];

/** Where choosing a page opens: the page and the tab it lands on. */
export interface SettingsSearchTarget {
  pageId: SettingsPageId;
  sectionId: SectionId;
}

/** What a Settings search query finds, read the same way by every layout. */
export interface SettingsSearch {
  /** The trimmed query; empty until the user types. */
  query: string;
  /** Visible settings whose own words match, grouped by page in sidebar order. */
  fields: SettingsSearchField[];
  /** The project scope picker matches. */
  scopeMatches: boolean;
  /**
   * Pages that match by name (the page label or a tab's own words), one row
   * per page, opening the first tab that matched; empty without a query.
   */
  pages: SettingsSearchTarget[];
  /**
   * Sidebar groups that keep each page matching by name or holding a matching
   * setting, opening its first matching tab. Every visible page without a query.
   */
  groups: Array<{ labelKey: SettingsI18nKey; pages: SettingsSearchTarget[] }>;
  /** Nothing answers the query: no setting, page or the scope picker. */
  empty: boolean;
}

export function resolveSettingsSearch(
  rawQuery: string,
  visibility: SettingsSectionVisibility,
): SettingsSearch {
  const query = rawQuery.trim();
  const fields = searchSettingsFields(query)
    .filter((field) => isSettingsSectionVisible(field.sectionId, visibility))
    .sort(
      (left, right) =>
        getSettingsSectionNavigationOrder(left.sectionId) -
        getSettingsSectionNavigationOrder(right.sectionId),
    );
  const fieldSectionIds = new Set<SectionId>(
    fields.map((field) => field.sectionId),
  );
  const scopeMatches = matchesSettingsScopeSearch(query);
  const pages: SettingsSearchTarget[] = [];
  const groups: SettingsSearch["groups"] = [];
  for (const group of settingsPageGroups) {
    const groupPages: SettingsSearchTarget[] = [];
    for (const pageId of group.pageIds) {
      const sectionIds = listVisibleSettingsPageSections(pageId, visibility);
      const [firstSectionId] = sectionIds;
      if (!firstSectionId) {
        continue;
      }
      const pageMatches = matchesSettingsPage(settingsPagesById[pageId], query);
      const nameMatch = sectionIds.find((sectionId) =>
        matchesSettingsSection(settingsSectionsById[sectionId], query),
      );
      if (query && (pageMatches || nameMatch)) {
        pages.push({ pageId, sectionId: nameMatch ?? firstSectionId });
      }
      const target =
        sectionIds.find(
          (sectionId) => sectionId === nameMatch || fieldSectionIds.has(sectionId),
        ) ?? (pageMatches ? firstSectionId : undefined);
      if (target) {
        groupPages.push({ pageId, sectionId: target });
      }
    }
    if (groupPages.length > 0) {
      groups.push({ labelKey: group.labelKey, pages: groupPages });
    }
  }
  return {
    query,
    fields,
    scopeMatches,
    pages,
    groups,
    empty: groups.length === 0 && fields.length === 0 && !scopeMatches,
  };
}
