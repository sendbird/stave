import { Keyboard, Moon, RefreshCw, Settings, Sun } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";

interface TopBarUtilityActionsProps {
  isDarkMode: boolean;
  noDragStyle: CSSProperties;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onPreloadShortcuts: () => void;
  onPreloadSettings: () => void;
}

export const TopBarUtilityActions = memo(function TopBarUtilityActions({
  isDarkMode,
  noDragStyle,
  onRefresh,
  onToggleTheme,
  onOpenShortcuts,
  onOpenSettings,
  onPreloadShortcuts,
  onPreloadSettings,
}: TopBarUtilityActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-md p-0" onClick={onRefresh} style={noDragStyle}>
              <RefreshCw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Refresh project files</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-md p-0"
              onClick={onToggleTheme}
              aria-label="toggle theme"
              style={noDragStyle}
            >
              {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isDarkMode ? "Switch to light mode" : "Switch to dark mode"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-md p-0"
              aria-label="open-shortcuts"
              onMouseEnter={onPreloadShortcuts}
              onFocus={onPreloadShortcuts}
              onClick={onOpenShortcuts}
              style={noDragStyle}
            >
              <Keyboard className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Keyboard shortcuts</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="open-settings"
              className="h-9 w-9 rounded-md p-0"
              onMouseEnter={onPreloadSettings}
              onFocus={onPreloadSettings}
              onClick={onOpenSettings}
              style={noDragStyle}
            >
              <Settings className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
});
