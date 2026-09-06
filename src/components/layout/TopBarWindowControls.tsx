import { Minus, Square, X } from "lucide-react";
import { memo, useEffect, useState, type CSSProperties } from "react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

interface TopBarWindowControlsProps {
  noDragStyle: CSSProperties;
}

export const TopBarWindowControls = memo(function TopBarWindowControls({
  noDragStyle,
}: TopBarWindowControlsProps) {
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
    const initStop = window.setTimeout(
      () => window.clearInterval(initPoll),
      5000,
    );

    return () => {
      mounted = false;
      window.clearInterval(initPoll);
      window.clearInterval(steadyPoll);
      window.clearTimeout(initStop);
    };
  }, []);

  return (
    <TooltipProvider>
      <div {...stylex.props(layoutShellStyles.windowControls)}>
        <span {...stylex.props(layoutShellStyles.windowDivider)} aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                xstyle={layoutShellStyles.windowButton}
                onClick={() => void window.api?.window?.minimize?.()}
                aria-label="window-minimize"
                style={noDragStyle}
              />
            }
          >
            <Minus {...stylex.props(layoutShellStyles.icon14)} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Minimize</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                xstyle={layoutShellStyles.windowButton}
                onClick={async () => {
                  const next = await window.api?.window?.toggleMaximize?.();
                  if (next) {
                    setIsMaximized(next.isMaximized);
                  }
                }}
                aria-label="window-maximize"
                style={noDragStyle}
              />
            }
          >
            <Square {...stylex.props(layoutShellStyles.icon14, isMaximized && layoutShellStyles.subdued)} />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isMaximized ? "Restore window" : "Maximize"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                xstyle={[layoutShellStyles.windowButton, layoutShellStyles.closeWindowButton]}
                onClick={() => void window.api?.window?.close?.()}
                aria-label="window-close"
                style={noDragStyle}
              />
            }
          >
            <X {...stylex.props(layoutShellStyles.icon14)} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Close window</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
});
