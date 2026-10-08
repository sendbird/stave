import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { FolderTree, ListChecks } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { SidebarNavView } from "@/store/app-settings";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { LabeledField, SettingsCard, SwitchField } from "../settings-dialog.shared";

const SIDEBAR_NAV_VIEW_FIELDS: readonly {
  value: SidebarNavView;
  label: "settings:themeSection.sidebar.view.repositories" | "settings:themeSection.sidebar.view.workQueue";
  Icon: typeof FolderTree;
}[] = [
  { value: "projects", label: "settings:themeSection.sidebar.view.repositories", Icon: FolderTree },
  { value: "work-queue", label: "settings:themeSection.sidebar.view.workQueue", Icon: ListChecks },
] as const;

export function SidebarSettingsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const sidebarShowFleetView = useAppStore(
    (state) => state.settings.sidebarShowFleetView,
  );
  const sidebarShowAgents = useAppStore((state) => state.settings.sidebarShowAgents);
  const sidebarShowAiUsage = useAppStore((state) => state.settings.sidebarShowAiUsage);
  const sidebarNavView = useAppStore((state) => state.settings.sidebarNavView);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <SettingsCard
      title={t("settings:themeSection.sidebar.title")}
      description={t("settings:themeSection.sidebar.description")}
    >
      <SwitchField
        title={t("settings:themeSection.sidebar.fleetView.title")}
        description={t("settings:themeSection.sidebar.fleetView.description")}
        checked={sidebarShowFleetView}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowFleetView: checked } })
        }
      />
      <SwitchField
        title={t("settings:themeSection.sidebar.agents.title")}
        description={t("settings:themeSection.sidebar.agents.description")}
        checked={sidebarShowAgents}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowAgents: checked } })
        }
      />
      <SwitchField
        title={t("settings:themeSection.sidebar.aiUsage.title")}
        description={t("settings:themeSection.sidebar.aiUsage.description")}
        checked={sidebarShowAiUsage}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowAiUsage: checked } })
        }
      />
      <LabeledField
        title={t("settings:themeSection.sidebar.view.title")}
        description={t("settings:themeSection.sidebar.view.description")}
      >
        <div className={sx(styles.rowWrapGap2)}>
          {SIDEBAR_NAV_VIEW_FIELDS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={
                sidebarNavView === option.value ? "primary" : "outline"
              }
              size="sm"
              aria-pressed={sidebarNavView === option.value}
              onClick={() =>
                updateSettings({ patch: { sidebarNavView: option.value } })
              }
            >
              <option.Icon className={sx(styles.iconMd)} />
              {t(option.label)}
            </Button>
          ))}
        </div>
      </LabeledField>
    </SettingsCard>
  );
}
