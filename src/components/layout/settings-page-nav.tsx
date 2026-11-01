import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  getSettingsPageIcon,
  settingsPagesById,
  type SettingsPageId,
} from "./settings-dialog.pages";
import type { SettingsSearch, SettingsSearchTarget } from "./settings-search";
import { settingsDialogStyles as styles } from "./SettingsDialog.styles";

/**
 * The Settings sidebar: one entry per page, grouped, narrowed to the pages a
 * search keeps. Each entry carries the tab it opens (`SettingsSearchTarget`).
 */
export function SettingsPageNav(props: {
  groups: SettingsSearch["groups"];
  activePageId: SettingsPageId;
  onOpenPage: (target: SettingsSearchTarget) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return props.groups.map((group) => (
    <SidebarGroup key={group.labelKey}>
      <SidebarGroupLabel className={sx(styles.groupLabel)}>
        {t(group.labelKey)}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.pages.map((target) => {
            const Icon = getSettingsPageIcon(target.pageId);
            return (
              <SidebarMenuItem key={target.pageId}>
                <SidebarMenuButton
                  current={props.activePageId === target.pageId}
                  onClick={() => props.onOpenPage(target)}
                  className={sx(styles.menuButton)}
                  icon={<Icon />}
                >
                  {t(settingsPagesById[target.pageId].labelKey)}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
