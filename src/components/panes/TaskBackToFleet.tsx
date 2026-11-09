import { i18n, useTranslation } from "@/i18n";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { Tooltip } from "@/components/aui/components/Tooltip";
import {
  navigateSurfaceHistory,
  useBackAppSurfaceKind,
} from "@/components/panes/surface-history-runtime";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { useAppStore } from "@/store/app.store";

/**
 * "← Fleet View" in the header of a task opened from Fleet: one step back, the
 * same step Cmd/Ctrl+[ takes. Shown only on the task that is the current
 * place, so a split pane's other task never offers it.
 */
export function TaskBackToFleet(props: { taskId: string; compact?: boolean }) {
  useTranslation();
  const backKind = useBackAppSurfaceKind();
  const isCurrentTask = useAppStore(
    (state) =>
      state.activeSurface.kind === "task" &&
      state.activeSurface.taskId === props.taskId,
  );
  const backShortcut = useShortcutHint("navigation.back");
  if (backKind !== "fleet-view" || !isCurrentTask) {
    return null;
  }
  const label = i18n.t("panes:paneHeaderActions.backToFleetView");
  const goBack = () => void navigateSurfaceHistory("back");
  return (
    <Tooltip content={label} shortcut={backShortcut}>
      {props.compact ? (
        <Button
          type="button"
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={label}
          onClick={goBack}
          data-testid="task-back-to-fleet"
        >
          <ArrowLeft aria-hidden />
        </Button>
      ) : (
        <Button
          type="button"
          variant="quiet"
          size="xs"
          aria-label={label}
          onClick={goBack}
          data-testid="task-back-to-fleet"
        >
          <ArrowLeft aria-hidden />
          {i18n.t("panes:paneHeaderActions.fleetView")}
        </Button>
      )}
    </Tooltip>
  );
}
