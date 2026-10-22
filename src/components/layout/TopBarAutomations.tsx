import { i18n, useTranslation } from "@/i18n";
import { Workflow } from "lucide-react";
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { Button } from "@/components/ui";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { layoutShellStyles } from "./layout-shell.styles";
import { useAppStore } from "@/store/app.store";

export function TopBarAutomations(props: { noDragStyle: CSSProperties }) {
  useTranslation();
  const [toggleAutomationCenter, isAutomationCenterActive] = useAppStore(
    useShallow(
      (state) =>
        [
          state.toggleAutomationCenter,
          state.activeAppSurface.kind === "automation-center",
        ] as const,
    ),
  );
  const shortcut = useShortcutHint("navigation.automation-center");

  return (
    <Tooltip
      content={
        isAutomationCenterActive
          ? i18n.t("shell:topBarAutomations.closeSchedules")
          : i18n.t("shell:topBarAutomations.schedules")
      }
      shortcut={shortcut}
      side="bottom"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        xstyle={[
          layoutShellStyles.topBarButton,
          isAutomationCenterActive && layoutShellStyles.topBarButtonActive,
        ]}
        style={props.noDragStyle}
        aria-label={
          isAutomationCenterActive
            ? i18n.t("shell:topBarAutomations.closeSchedules")
            : i18n.t("shell:topBarAutomations.openSchedules")
        }
        aria-pressed={isAutomationCenterActive}
        onClick={toggleAutomationCenter}
      >
        <Workflow {...stylex.props(layoutShellStyles.icon16)} />
      </Button>
    </Tooltip>
  );
}
