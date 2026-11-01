import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { settingsSectionsById, type SectionId } from "./settings-dialog.schema";
import { settingsPageTabsStyles as styles } from "./settings-page-tabs.styles";

/** DOM id of the body that shows the active tab's section. */
export const SETTINGS_PAGE_PANEL_ID = "settings-page-panel";

/** DOM id of a section's tab; the page body is labelled by the active one. */
export function settingsPageTabId(sectionId: SectionId) {
  return `settings-page-tab-${sectionId}`;
}

/**
 * One tab per visible section of a Settings page that hosts several. The
 * section body renders below the scope bar rather than inside this root, so
 * the dialog marks that body as the tab panel (`SETTINGS_PAGE_PANEL_ID`).
 */
export function SettingsPageTabs(props: {
  /** The page label; names the tab list. */
  label: string;
  sectionIds: readonly SectionId[];
  activeSectionId: SectionId;
  onSelectSection: (sectionId: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <div className={sx(styles.bar)}>
      <Tabs
        variant="line"
        size="md"
        value={props.activeSectionId}
        onValueChange={(value) => {
          const next = props.sectionIds.find((sectionId) => sectionId === value);
          if (next) {
            props.onSelectSection(next);
          }
        }}
        xstyle={styles.root}
      >
        <TabsList aria-label={props.label} xstyle={styles.list}>
          {props.sectionIds.map((sectionId) => (
            <TabsTrigger
              key={sectionId}
              id={settingsPageTabId(sectionId)}
              value={sectionId}
              aria-controls={SETTINGS_PAGE_PANEL_ID}
              xstyle={styles.tab}
            >
              {t(settingsSectionsById[sectionId].labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
