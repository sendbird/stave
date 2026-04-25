import { Command, Home, Keyboard, Moon, RefreshCw, Settings, Sun } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { STAVE_LOGO_URL } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export const SIDEBAR_HOME_BUTTON_CLASS =
  "h-10 w-10 rounded-md border border-border/80 bg-background/70 p-0 hover:bg-secondary/70";

export function StaveAppMenuButton(args?: {
  compact?: boolean;
  className?: string;
  onOpenCommandPalette?: () => void;
  onOpenKeyboardShortcuts?: () => void;
  onOpenSettings?: () => void;
}) {
  const compact = args?.compact ?? false;
  const [open, setOpen] = useState(false);
  const [clearTaskSelection, projectPath, isDarkMode, setDarkMode, refreshProjectFiles] = useAppStore(
    useShallow((state) => [
      state.clearTaskSelection,
      state.projectPath,
      state.isDarkMode,
      state.setDarkMode,
      state.refreshProjectFiles,
    ] as const),
  );

  const handleRefreshProjectFiles = useCallback(() => {
    void refreshProjectFiles();
  }, [refreshProjectFiles]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode({ enabled: !isDarkMode });
  }, [isDarkMode, setDarkMode]);

  const commandPaletteShortcutLabel = useMemo(
    () => (
      typeof navigator !== "undefined" && /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "⌘⇧P"
        : "Ctrl+Shift+P"
    ),
    [],
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Open Stave menu"
            className={cn(
              compact
                ? SIDEBAR_HOME_BUTTON_CLASS
                : "h-8 gap-1.5 rounded-md border border-border/80 bg-card px-2.5 hover:bg-secondary/70",
              open && "border-primary/70 bg-secondary/80",
              args?.className,
            )}
          >
            <img
              src={STAVE_LOGO_URL}
              alt="Stave"
              className="size-4 rounded-sm"
              draggable={false}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className={`${UI_LAYER_CLASS.appMenu} w-64`}>
          <DropdownMenuLabel>Stave</DropdownMenuLabel>
          <DropdownMenuItem className="gap-2" onSelect={clearTaskSelection}>
            <Home className="size-4 text-muted-foreground" />
            Home
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={args?.onOpenCommandPalette}>
            <Command className="size-4 text-muted-foreground" />
            Command Palette
            <DropdownMenuShortcut className="text-[11px] tracking-normal">
              {commandPaletteShortcutLabel}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {projectPath ? (
            <DropdownMenuItem className="gap-2" onSelect={handleRefreshProjectFiles}>
              <RefreshCw className="size-4 text-muted-foreground" />
              Refresh project files
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="gap-2" onSelect={handleToggleTheme}>
            {isDarkMode ? (
              <Sun className="size-4 text-muted-foreground" />
            ) : (
              <Moon className="size-4 text-muted-foreground" />
            )}
            {isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={args?.onOpenKeyboardShortcuts}>
            <Keyboard className="size-4 text-muted-foreground" />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={args?.onOpenSettings}>
            <Settings className="size-4 text-muted-foreground" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
