import { Workflow } from "lucide-react";
import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
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
            className={cn(
              "h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              isAutomationCenterActive && "bg-secondary/70 text-foreground",
            )}
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
        <Workflow className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isAutomationCenterActive
          ? "Close Automation Center"
          : "Automation Center"}
      </TooltipContent>
    </Tooltip>
  );
}
