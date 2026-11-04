import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { FolderTree, ListChecks } from "lucide-react";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { useAppStore } from "@/store/app.store";
import type { SidebarNavView } from "@/store/app-settings";
import { LabeledField, SelectField, SettingsCard, SwitchField } from "../settings-dialog.shared";
import { settingsSharedStyles } from "../settings-dialog.shared.styles";
import {
  normalizeWorkspaceSettleAfterDays,
  WORKSPACE_SETTLE_AFTER_DAY_OPTIONS,
} from "@/lib/fleet/workspace-settlement";

const SETTLE_AFTER_DAYS_OFF = "off";

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
  const settleOnMerge = useAppStore((state) => state.settings.workQueueSettleOnMerge);
  const settleAfterDays = useAppStore((state) =>
    normalizeWorkspaceSettleAfterDays(state.settings.workQueueSettleAfterDays),
  );
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
        <SegmentedControl
          aria-label={t("settings:themeSection.sidebar.view.title")}
          density="regular"
          xstyle={settingsSharedStyles.shortControlEnd}
          value={sidebarNavView}
          onValueChange={(value) => updateSettings({ patch: { sidebarNavView: value } })}
          options={SIDEBAR_NAV_VIEW_FIELDS.map((option) => ({
            value: option.value,
            label: t(option.label),
            icon: <option.Icon aria-hidden />,
          }))}
        />
      </LabeledField>
      <SwitchField
        title={t("settings:themeSection.sidebar.settle.onMerge.title")}
        description={t("settings:themeSection.sidebar.settle.onMerge.description")}
        checked={settleOnMerge}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { workQueueSettleOnMerge: checked } })
        }
      />
      <SelectField
        title={t("settings:themeSection.sidebar.settle.afterDays.title")}
        description={t("settings:themeSection.sidebar.settle.afterDays.description")}
        value={settleAfterDays === null ? SETTLE_AFTER_DAYS_OFF : String(settleAfterDays)}
        onChange={(value) =>
          updateSettings({
            patch: {
              workQueueSettleAfterDays:
                value === SETTLE_AFTER_DAYS_OFF ? null : Number(value),
            },
          })
        }
        options={[
          { value: SETTLE_AFTER_DAYS_OFF, label: t("settings:themeSection.sidebar.settle.afterDays.off") },
          ...WORKSPACE_SETTLE_AFTER_DAY_OPTIONS.map((days) => ({
            value: String(days),
            label: t("settings:themeSection.sidebar.settle.afterDays.days", { count: days }),
          })),
        ]}
      />
    </SettingsCard>
  );
}
