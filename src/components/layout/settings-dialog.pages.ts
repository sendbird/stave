import type { LucideIcon } from "lucide-react";
import {
  buildSettingsSearchText,
  isSettingsSectionVisible,
  settingsSectionsById,
  type SectionId,
  type SettingsI18nKey,
  type SettingsSectionVisibility,
} from "./settings-dialog.schema";

/**
 * The Settings sidebar lists pages; a page hosts one or more sections and
 * shows one tab per visible section when it hosts several. `SectionId` stays
 * the unit of content, deep links, search and scope: the page is derived from
 * the section, so `openSettings({ section })` opens the host page on that tab.
 *
 * A single-section page uses its section's label; a page that merges
 * sections has a label of its own under `settings:pages`.
 */
export const settingsPages = [
  { id: "general", labelKey: "settings:sections.general.label", sectionIds: ["general"] },
  { id: "appearance", labelKey: "settings:sections.theme.label", sectionIds: ["theme"] },
  { id: "chat", labelKey: "settings:sections.chat.label", sectionIds: ["chat"] },
  { id: "editorTerminal", labelKey: "settings:pages.editorTerminal", sectionIds: ["editor", "terminal"] },
  { id: "keyboard", labelKey: "settings:sections.commandPalette.label", sectionIds: ["commandPalette"] },
  { id: "browser", labelKey: "settings:pages.browser", sectionIds: ["lens", "mentions"] },
  { id: "projects", labelKey: "settings:pages.projects", sectionIds: ["projects", "scripts", "memory"] },
  { id: "accounts", labelKey: "settings:sections.accounts.label", sectionIds: ["accounts", "tooling"] },
  { id: "providers", labelKey: "settings:sections.providers.label", sectionIds: ["providers"] },
  {
    id: "models",
    labelKey: "settings:sections.models.label",
    sectionIds: ["models", "autoRouting", "auxiliaryInference"],
  },
  { id: "presetsMacros", labelKey: "settings:pages.presetsMacros", sectionIds: ["presets", "macros"] },
  { id: "promptsSkills", labelKey: "settings:pages.promptsSkills", sectionIds: ["prompts", "skills"] },
  { id: "mcp", labelKey: "settings:sections.mcp.label", sectionIds: ["mcp"] },
  {
    id: "integrations",
    labelKey: "settings:sections.integrations.label",
    sectionIds: ["integrations", "issues", "kickoff"],
  },
  { id: "secrets", labelKey: "settings:sections.secrets.label", sectionIds: ["secrets"] },
  { id: "developer", labelKey: "settings:sections.developer.label", sectionIds: ["developer"] },
  { id: "changelog", labelKey: "settings:sections.changelog.label", sectionIds: ["changelog"] },
] as const satisfies ReadonlyArray<{
  id: string;
  labelKey: SettingsI18nKey;
  sectionIds: readonly [SectionId, ...SectionId[]];
}>;

export type SettingsPage = (typeof settingsPages)[number];
export type SettingsPageId = SettingsPage["id"];

// A section added without a host page fails to compile here.
const _everySectionHasAPage: Exclude<
  SectionId,
  SettingsPage["sectionIds"][number]
> extends never
  ? true
  : never = true;

export const settingsPageGroups = [
  {
    labelKey: "settings:sections.groups.app",
    pageIds: ["general", "appearance", "chat", "editorTerminal", "keyboard", "browser"],
  },
  { labelKey: "settings:sections.groups.projects", pageIds: ["projects"] },
  {
    labelKey: "settings:sections.groups.agents",
    pageIds: [
      "accounts",
      "providers",
      "models",
      "presetsMacros",
      "promptsSkills",
      "mcp",
      "integrations",
      "secrets",
    ],
  },
  { labelKey: "settings:sections.groups.system", pageIds: ["developer", "changelog"] },
] as const satisfies ReadonlyArray<{
  labelKey: SettingsI18nKey;
  pageIds: readonly SettingsPageId[];
}>;

export const settingsPagesById = Object.fromEntries(
  settingsPages.map((page) => [page.id, page]),
) as Record<SettingsPageId, SettingsPage>;

const pageIdBySection = new Map<SectionId, SettingsPageId>(
  settingsPages.flatMap((page) =>
    page.sectionIds.map((sectionId) => [sectionId, page.id] as const),
  ),
);

/** Sidebar order: page order first, then tab order inside the page. */
const navigationOrderBySection = new Map<SectionId, number>(
  settingsPages.flatMap((page, pageIndex) =>
    page.sectionIds.map(
      (sectionId, tabIndex) => [sectionId, pageIndex * 100 + tabIndex] as const,
    ),
  ),
);

/** The page that hosts a section. */
export function getSettingsPageId(sectionId: SectionId): SettingsPageId {
  return pageIdBySection.get(sectionId) ?? "general";
}

export function getSettingsSectionNavigationOrder(sectionId: SectionId) {
  return navigationOrderBySection.get(sectionId) ?? Number.MAX_SAFE_INTEGER;
}

/** A page shows its first section's icon. */
export function getSettingsPageIcon(pageId: SettingsPageId): LucideIcon {
  return settingsSectionsById[settingsPagesById[pageId].sectionIds[0]].icon;
}

/** The page's sections the current profile shows, in tab order. */
export function listVisibleSettingsPageSections(
  pageId: SettingsPageId,
  visibility: SettingsSectionVisibility,
): SectionId[] {
  return settingsPagesById[pageId].sectionIds.filter((sectionId) =>
    isSettingsSectionVisible(sectionId, visibility),
  );
}

/** Pages with at least one visible section, in sidebar order. */
export function listVisibleSettingsPages(
  visibility: SettingsSectionVisibility,
): SettingsPage[] {
  return settingsPageGroups
    .flatMap((group): readonly SettingsPageId[] => group.pageIds)
    .map((pageId) => settingsPagesById[pageId])
    .filter(
      (page) => listVisibleSettingsPageSections(page.id, visibility).length > 0,
    );
}

/** The tab a page opens on: its first visible section, General when none is. */
export function resolveSettingsPageSection(
  pageId: SettingsPageId,
  visibility: SettingsSectionVisibility,
): SectionId {
  return listVisibleSettingsPageSections(pageId, visibility)[0] ?? "general";
}

export function matchesSettingsPage(page: SettingsPage, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return true;
  }
  const haystack = buildSettingsSearchText([page.labelKey], []);
  return terms.every((term) => haystack.includes(term));
}
