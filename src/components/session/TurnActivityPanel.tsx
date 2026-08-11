import { useShallow } from "zustand/react/shallow";
import { TurnActivity } from "@/components/session/TurnActivity";
import { Button } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

/**
 * Right-rail "Turn Activity" panel body.
 *
 * The activity surface renders in exactly one host at a time (docked,
 * floating, or this panel — `settings.turnActivityPlacement`). When the
 * placement is elsewhere this panel explains that and offers a one-click
 * move, so opening the panel is never a dead end.
 */
export function TurnActivityPanel() {
  const [placement, updateSettings] = useAppStore(
    useShallow(
      (state) =>
        [state.settings.turnActivityPlacement, state.updateSettings] as const,
    ),
  );

  if (placement !== "panel") {
    return (
      <div
        data-testid="turn-activity-panel-placeholder"
        className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-sm text-muted-foreground">
          Turn activity is currently{" "}
          {placement === "floating"
            ? "floating over the chat"
            : "docked above the prompt input"}
          .
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            updateSettings({ patch: { turnActivityPlacement: "panel" } })
          }
        >
          Show turn activity here
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TurnActivity host="panel" />
    </div>
  );
}
