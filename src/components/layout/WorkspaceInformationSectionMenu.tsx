import { i18n, useTranslation } from "@/i18n";
import { RotateCcw, Settings2 } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  WORKSPACE_INFORMATION_SECTION_IDS,
  WORKSPACE_INFORMATION_SECTION_LABELS,
  isWorkspaceInformationSectionAvailable,
  resolveVisibleWorkspaceInformationSections,
  workspaceInformationSectionHasContent,
} from "@/lib/workspace-information-sections";
import { useAppStore } from "@/store/app.store";
import { workspaceInformationSectionMenuStyles as styles } from "./workspace-information-section-menu.styles";

export function WorkspaceInformationSectionMenu() {
  const { t: tI18n } = useTranslation(["workspace"]);
  const [information, visibility, craneConnectorEnabled, updateSettings] =
    useAppStore(
      useShallow((state) => [
        state.workspaceInformation,
        state.settings.infoPanelSectionVisibility,
        state.settings.craneConnector.enabled,
        state.updateSettings,
      ]),
    );
  const visibleSections = useMemo(
    () =>
      new Set(
        resolveVisibleWorkspaceInformationSections({
          visibility,
          information,
          craneConnectorEnabled,
          // TODO(tasks-surface): read `settings.jiraConnector.enabled` once the Jira connector slice exists.
          jiraConnectorEnabled: false,
        }),
      ),
    [craneConnectorEnabled, information, visibility, i18n.resolvedLanguage],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            xstyle={styles.trigger}
            aria-label={tI18n("workspace:workspaceInformationSectionMenu.configureInformationPanelSections")}
          />
        }
      >
        <Settings2 className={sx(styles.triggerIcon)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" xstyle={styles.content}>
        <DropdownMenuLabel>{tI18n("workspace:workspaceInformationSectionMenu.visibleSections")}</DropdownMenuLabel>
        {WORKSPACE_INFORMATION_SECTION_IDS.filter(
          (id) =>
            id !== "overview" &&
            // Integration-gated sections stay out of the menu entirely while
            // their integration is off and they hold nothing.
            isWorkspaceInformationSectionAvailable({
              id,
              information,
              craneConnectorEnabled,
            }),
        ).map((id) => {
          // Plans live on the filesystem, so the menu cannot cheaply know
          // whether they exist; skip the hint instead of showing a stale one.
          const hasContent =
            id !== "plans" &&
            workspaceInformationSectionHasContent({
              id,
              information,
            });
          return (
            <DropdownMenuCheckboxItem
              key={id}
              checked={visibleSections.has(id)}
              onCheckedChange={(checked) =>
                updateSettings({
                  patch: {
                    infoPanelSectionVisibility: {
                      ...visibility,
                      [id]: checked === true,
                    },
                  },
                })
              }
            >
              <span className={sx(styles.itemLabel)}>
                {WORKSPACE_INFORMATION_SECTION_LABELS[id]}
              </span>
              {hasContent ? (
                <span className={sx(styles.itemHint)}>{tI18n("workspace:workspaceInformationSectionMenu.filled")}</span>
              ) : null}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            updateSettings({ patch: { infoPanelSectionVisibility: {} } })
          }
        >
          <RotateCcw className={sx(styles.resetIcon)} />
          {tI18n("workspace:workspaceInformationSectionMenu.resetToDefaults")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
