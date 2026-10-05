import { i18n, useTranslation } from "@/i18n";
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
import { CountBadge } from "@/components/system/CountBadge";
import { layoutShellStyles } from "./layout-shell.styles";
import { useAppStore } from "@/store/app.store";

export function TopBarFleetAttention(props: { noDragStyle: CSSProperties }) {
  useTranslation();
  const [repositoryPath, recentRepositories, toggleFleetView, isFleetViewActive] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.repositoryPath,
            state.recentRepositories,
            state.toggleFleetView,
            state.activeAppSurface.kind === "fleet-view",
          ] as const,
      ),
    );
  const { count: attentionCount } = useFleetAttentionProjection();

  if (!repositoryPath && recentRepositories.length === 0) {
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
              isFleetViewActive ? i18n.t("shell:topBarFleetAttention.closeFleet") : i18n.t("shell:topBarFleetAttention.openFleet")
            }
            aria-pressed={isFleetViewActive}
            onClick={toggleFleetView}
            indicator={
              attentionCount > 0 ? (
                <CountBadge count={attentionCount} tone="warning" />
              ) : null
            }
          />
        }
      >
        <Bot {...stylex.props(layoutShellStyles.icon16)} />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isFleetViewActive
          ? i18n.t("shell:topBarFleetAttention.closeFleetView")
          : attentionCount > 0
            ? i18n.t("shell:topBarFleetAttention.fleetViewActionRequired", { count: attentionCount })
            : i18n.t("shell:topBarFleetAttention.fleetView")}
      </TooltipContent>
    </Tooltip>
  );
}
