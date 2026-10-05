import { FolderTree, ListChecks } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { SidebarNavView } from "@/store/app-settings";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { LabeledField, SettingsCard, SwitchField } from "../settings-dialog.shared";

const SIDEBAR_NAV_VIEW_FIELDS: readonly {
  value: SidebarNavView;
  label: string;
  Icon: typeof FolderTree;
}[] = [
  { value: "projects", label: "Repositories", Icon: FolderTree },
  { value: "work-queue", label: "Work queue", Icon: ListChecks },
] as const;

export function SidebarSettingsCard() {
  const sidebarShowFleetView = useAppStore(
    (state) => state.settings.sidebarShowFleetView,
  );
  const sidebarShowAgents = useAppStore((state) => state.settings.sidebarShowAgents);
  const sidebarShowResults = useAppStore((state) => state.settings.sidebarShowResults);
  const sidebarShowAiUsage = useAppStore((state) => state.settings.sidebarShowAiUsage);
  const sidebarNavView = useAppStore((state) => state.settings.sidebarNavView);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <SettingsCard
      title="Sidebar"
      description="Choose which workspace navigation surfaces appear in the left sidebar."
    >
      <SwitchField
        title="Fleet View Shortcut"
        description="Show the Fleet View entry in the sidebar header area."
        checked={sidebarShowFleetView}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowFleetView: checked } })
        }
      />
      <SwitchField
        title="Agents Shortcut"
        description="Show Agents and its active agent rows in the sidebar header area."
        checked={sidebarShowAgents}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowAgents: checked } })
        }
      />
      <SwitchField
        title="Results Shortcut"
        description="Show the Results entry in the sidebar header area."
        checked={sidebarShowResults}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowResults: checked } })
        }
      />
      <SwitchField
        title="AI Usage Shortcut"
        description="Show the AI usage entry in the sidebar header area."
        checked={sidebarShowAiUsage}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { sidebarShowAiUsage: checked } })
        }
      />
      <LabeledField
        title="Sidebar View"
        description="Repositories lists workspaces by where they live; Work queue groups every workspace by what it wants from you. The toggle in the sidebar header changes this too, so the sidebar reopens in whichever view you used last."
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
              {option.label}
            </Button>
          ))}
        </div>
      </LabeledField>
    </SettingsCard>
  );
}
