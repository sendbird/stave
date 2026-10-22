import { i18n, useTranslation } from "@/i18n";
import { LayoutGrid } from "lucide-react";
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { Button } from "@/components/ui";
import { CountBadge } from "@/components/system/CountBadge";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { describeFleetAttentionCounts } from "@/lib/fleet/fleet-vocabulary";
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
  // The count is what holds an agent up; results to review are only named in
  // the tooltip, so the badge never asks for action that nothing waits on.
  const blockingCount = useFleetAttention((snapshot) => snapshot.blockingItems.length);
  const reviewCount = useFleetAttention((snapshot) => snapshot.reviewItems.length);
  const shortcut = useShortcutHint("navigation.fleet-view");

  if (!repositoryPath && recentRepositories.length === 0) {
    return null;
  }

  return (
    <Tooltip
      content={
        isFleetViewActive
          ? i18n.t("shell:topBarFleetAttention.closeFleetView")
          : describeFleetAttentionCounts({ blockingCount, reviewCount })
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
          blockingCount > 0 && layoutShellStyles.topBarButtonWarning,
          isFleetViewActive && layoutShellStyles.topBarButtonActive,
        ]}
        style={props.noDragStyle}
        aria-label={
          isFleetViewActive ? i18n.t("shell:topBarFleetAttention.closeFleet") : i18n.t("shell:topBarFleetAttention.openFleet")
        }
        aria-pressed={isFleetViewActive}
        onClick={toggleFleetView}
        indicator={
          blockingCount > 0 ? (
            <CountBadge count={blockingCount} tone="warning" />
          ) : null
        }
      >
        <LayoutGrid {...stylex.props(layoutShellStyles.icon16)} />
      </Button>
    </Tooltip>
  );
}
