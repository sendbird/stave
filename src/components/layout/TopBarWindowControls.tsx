import { Minus, Square, X } from "lucide-react";
import { memo, useEffect, useState, type CSSProperties } from "react";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";

interface TopBarWindowControlsProps {
  noDragStyle: CSSProperties;
}

export const TopBarWindowControls = memo(function TopBarWindowControls({ noDragStyle }: TopBarWindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncWindowState = async () => {
      const getState = window.api?.window?.isMaximized;
      if (!getState) {
        return;
      }
      const state = await getState();
      if (state && mounted) {
        setIsMaximized(Boolean(state.isMaximized));
      }
    };

    void syncWindowState();
    const initPoll = window.setInterval(() => {
      void syncWindowState();
    }, 250);
    const steadyPoll = window.setInterval(() => {
      void syncWindowState();
    }, 1000);
    const initStop = window.setTimeout(() => window.clearInterval(initPoll), 5000);

    return () => {
      mounted = false;
      window.clearInterval(initPoll);
      window.clearInterval(steadyPoll);
      window.clearTimeout(initStop);
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-md p-0"
              onClick={() => void window.api?.window?.minimize?.()}
              aria-label="window-minimize"
              style={noDragStyle}
            >
              <Minus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Minimize</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-md p-0"
              onClick={async () => {
                const next = await window.api?.window?.toggleMaximize?.();
                if (next) {
                  setIsMaximized(next.isMaximized);
                }
              }}
              aria-label="window-maximize"
              style={noDragStyle}
            >
              <Square className={cn("size-3.5", isMaximized && "opacity-80")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isMaximized ? "Restore window" : "Maximize"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-md p-0 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => void window.api?.window?.close?.()}
              aria-label="window-close"
              style={noDragStyle}
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close window</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
});
