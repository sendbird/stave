import { CraneConnectorSettingsSection } from "@/components/layout/settings-dialog-crane-connector";
import { JiraConnectorSettingsSection } from "@/components/layout/settings-dialog-jira-connector";
import { MartinSyncSettingsSection } from "@/components/layout/settings-dialog-martin-sync";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "./settings-dialog-sections.styles";

/** Settings > Integrations: the outbound connectors, stacked. */
export function IntegrationsSection() {
  return (
    <div className={sx(styles.spaceY8)}>
      <CraneConnectorSettingsSection />
      <JiraConnectorSettingsSection />
      <MartinSyncSettingsSection />
    </div>
  );
}
