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

export function TopBarRoutines(props: { noDragStyle: CSSProperties }) {
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
                ? "close-automation-center"
                : "open-automation-center"
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
          ? "Close Library"
          : "Library"}
      </TooltipContent>
    </Tooltip>
  );
}
