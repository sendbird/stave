import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Search } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SectionId } from "./settings-dialog.schema";
import {
  settingsSectionsById,
  type SettingsSearch,
  type SettingsSearchField,
} from "./settings-search";
import {
  SETTINGS_SCOPE_PICKER_ID,
  SETTINGS_SCOPE_SEARCH_ENTRY,
} from "./settings-scope-bar";
import { settingsDialogStyles as styles } from "./SettingsDialog.styles";

/**
 * The matches for a Settings search, shared by the sidebar and the narrow
 * header so both layouts find, open and explain the same results. The sidebar
 * already narrows its section list to the matching sections, so only the
 * narrow header, which has no such list, asks for them (`includeSections`).
 * A query nothing answers says so instead of leaving an empty space.
 */
export function SettingsSearchResults(props: {
  search: SettingsSearch;
  includeSections?: boolean;
  activeSection?: SectionId;
  id?: string;
  onSelectScope: () => void;
  onSelectField: (field: SettingsSearchField) => void;
  onSelectSection?: (sectionId: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { search } = props;
  const sections = props.includeSections ? search.sections : [];
  if (!search.query) {
    return null;
  }
  if (search.fields.length === 0 && !search.scopeMatches && sections.length === 0) {
    return search.empty ? (
      <div id={props.id} role="status" className={sx(styles.emptyResults)}>
        {t("settings:dialog.search.noMatches", { query: search.query })}
      </div>
    ) : null;
  }
  return (
    <SidebarGroup
      id={props.id}
      role="group"
      aria-label={t("settings:dialog.search.results")}
    >
      <SidebarGroupLabel className={sx(styles.groupLabel)}>
        {t("settings:dialog.search.results")}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {search.scopeMatches ? (
            <SidebarMenuItem key={SETTINGS_SCOPE_PICKER_ID}>
              <SidebarMenuButton
                size="sm"
                onClick={props.onSelectScope}
                className={sx(styles.menuButton)}
                icon={<Search />}
              >
                {t(SETTINGS_SCOPE_SEARCH_ENTRY.titleKey)}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {search.fields.map((field) => (
            <SidebarMenuItem key={field.fieldId}>
              <SidebarMenuButton
                size="sm"
                onClick={() => props.onSelectField(field)}
                className={sx(styles.menuButton)}
                icon={<Search />}
                badge={
                  <span className={sx(styles.menuSectionLabel)}>
                    {t(settingsSectionsById[field.sectionId].labelKey)}
                  </span>
                }
              >
                {t(field.titleKey)}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <SidebarMenuItem key={`section:${section.id}`}>
                <SidebarMenuButton
                  size="sm"
                  current={props.activeSection === section.id}
                  onClick={() => props.onSelectSection?.(section.id)}
                  className={sx(styles.menuButton)}
                  icon={<Icon />}
                >
                  {t(section.labelKey)}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
