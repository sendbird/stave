import {
  Command,
  Home,
  Keyboard,
  Moon,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { STAVE_LOGO_URL } from "@/lib/providers/model-catalog";
import { cx, sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { staveAppMenuStyles } from "./stave-app-menu.styles";

export function StaveAppMenuButton(args?: {
  compact?: boolean;
  className?: string;
  onOpenCommandPalette?: () => void;
  onOpenKeyboardShortcuts?: () => void;
  onOpenSettings?: () => void;
}) {
  const compact = args?.compact ?? false;
  const [open, setOpen] = useState(false);
  const [
    clearTaskSelection,
    projectPath,
    isDarkMode,
    setDarkMode,
    refreshProjectFiles,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.clearTaskSelection,
          state.projectPath,
          state.isDarkMode,
          state.setDarkMode,
          state.refreshProjectFiles,
        ] as const,
    ),
  );

  const handleRefreshProjectFiles = useCallback(() => {
    void refreshProjectFiles();
  }, [refreshProjectFiles]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode({ enabled: !isDarkMode });
  }, [isDarkMode, setDarkMode]);

  const commandPaletteShortcutLabel = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "⌘⇧P"
        : "Ctrl+Shift+P",
    [],
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Open Stave menu"
              xstyle={[
                compact
                  ? staveAppMenuStyles.triggerCompact
                  : staveAppMenuStyles.trigger,
                open && staveAppMenuStyles.triggerOpen,
              ]}
              className={args?.className}
            />
          }
        >
          <img
            src={STAVE_LOGO_URL}
            alt="Stave"
            {...stylex.props(staveAppMenuStyles.logo)}
            draggable={false}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className={cx(UI_LAYER_CLASS.appMenu, sx(staveAppMenuStyles.menu))}
        >
          <DropdownMenuLabel>Stave</DropdownMenuLabel>
          <DropdownMenuItem onSelect={clearTaskSelection}>
            <Home {...stylex.props(staveAppMenuStyles.itemIcon)} />
            Home
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={args?.onOpenCommandPalette}
          >
            <Command {...stylex.props(staveAppMenuStyles.itemIcon)} />
            Command Palette
            <DropdownMenuShortcut
              className={sx(staveAppMenuStyles.shortcut)}
            >
              {commandPaletteShortcutLabel}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {projectPath ? (
            <DropdownMenuItem
              onSelect={handleRefreshProjectFiles}
            >
              <RefreshCw {...stylex.props(staveAppMenuStyles.itemIcon)} />
              Refresh project files
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={handleToggleTheme}>
            {isDarkMode ? (
              <Sun {...stylex.props(staveAppMenuStyles.itemIcon)} />
            ) : (
              <Moon {...stylex.props(staveAppMenuStyles.itemIcon)} />
            )}
            {isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={args?.onOpenKeyboardShortcuts}
          >
            <Keyboard {...stylex.props(staveAppMenuStyles.itemIcon)} />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={args?.onOpenSettings}>
            <Settings {...stylex.props(staveAppMenuStyles.itemIcon)} />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
