import { Bot } from "lucide-react";
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import { useFleetAttentionProjection } from "@/components/layout/useFleetAttentionProjection";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { layoutShellStyles } from "./layout-shell.styles";
import { useAppStore } from "@/store/app.store";

export function TopBarFleetAttention(props: { noDragStyle: CSSProperties }) {
  const [projectPath, recentProjects, toggleFleetView, isFleetViewActive] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.projectPath,
            state.recentProjects,
            state.toggleFleetView,
            state.activeAppSurface.kind === "fleet-view",
          ] as const,
      ),
    );
  const { count: attentionCount } = useFleetAttentionProjection();

  if (!projectPath && recentProjects.length === 0) {
    return null;
  }

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
              attentionCount > 0 && layoutShellStyles.topBarButtonWarning,
              isFleetViewActive && layoutShellStyles.topBarButtonActive,
            ]}
            style={props.noDragStyle}
            aria-label={
              isFleetViewActive ? "close-fleet-view" : "open-fleet-view"
            }
            aria-pressed={isFleetViewActive}
            onClick={toggleFleetView}
          />
        }
      >
        <Bot {...stylex.props(layoutShellStyles.icon16)} />
        {attentionCount > 0 ? (
          <span {...stylex.props(layoutShellStyles.topBarAttentionBadge)}>
            {attentionCount > 99 ? "99+" : attentionCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isFleetViewActive
          ? "Close Fleet View"
          : attentionCount > 0
            ? `Fleet View · ${attentionCount} action${attentionCount === 1 ? "" : "s"} required`
            : "Fleet View"}
      </TooltipContent>
    </Tooltip>
  );
}
