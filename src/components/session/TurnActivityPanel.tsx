import { useShallow } from "zustand/react/shallow";
import { TurnActivity } from "@/components/session/TurnActivity";
import { ActionButton } from "@/components/system/ActionButton";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { TaskRunOverview } from "./TaskRunOverview";
import { turnActivityPanelStyles as styles } from "./turn-activity-panel.styles";

/**
 * Right-rail "Turn Activity" panel body.
 *
 * The activity surface renders in exactly one host at a time (docked,
 * floating, or this panel — `settings.turnActivityPlacement`). When the
 * placement is elsewhere this panel explains that and offers a one-click
 * move, so opening the panel is never a dead end.
 */
export function TurnActivityPanel() {
  return <LiveTurnActivityPanel />;
}

function LiveTurnActivityPanel() {
  const [placement, updateSettings] = useAppStore(
    useShallow(
      (state) =>
        [state.settings.turnActivityPlacement, state.updateSettings] as const,
    ),
  );

  if (placement !== "panel") {
    return (
      <div className={sx(styles.scrollColumn)}>
        <TaskRunOverview />
        <div
          data-testid="turn-activity-panel-placeholder"
          className={sx(styles.placeholder)}
        >
          <p className={sx(styles.placeholderText)}>
            Detailed activity is{" "}
            {placement === "floating"
              ? "floating over the chat"
              : "docked above the prompt input"}
            .
          </p>
          <ActionButton
            size="xs"
            onClick={() =>
              updateSettings({ patch: { turnActivityPlacement: "panel" } })
            }
          >
            Show here
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className={sx(styles.column)}>
      <TaskRunOverview />
      <div className={sx(styles.body)}>
        <TurnActivity host="panel" />
      </div>
    </div>
  );
}
