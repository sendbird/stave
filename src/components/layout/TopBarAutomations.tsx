import { i18n, useTranslation } from "@/i18n";
import { Workflow } from "lucide-react";
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
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

  return (
    <Tooltip>
      <TooltipTrigger
        render={
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
          />
        }
      >
        <Workflow {...stylex.props(layoutShellStyles.icon16)} />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isAutomationCenterActive
          ? i18n.t("shell:topBarAutomations.closeSchedules")
          : i18n.t("shell:topBarAutomations.schedules")}
      </TooltipContent>
    </Tooltip>
  );
}
