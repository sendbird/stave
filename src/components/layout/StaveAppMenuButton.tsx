import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
  const compact = args?.compact ?? false;
  const [open, setOpen] = useState(false);
  const [
    clearTaskSelection,
    repositoryPath,
    isDarkMode,
    setDarkMode,
    refreshRepositoryFiles,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.clearTaskSelection,
          state.repositoryPath,
          state.isDarkMode,
          state.setDarkMode,
          state.refreshRepositoryFiles,
        ] as const,
    ),
  );

  const handleRefreshRepositoryFiles = useCallback(() => {
    void refreshRepositoryFiles();
  }, [refreshRepositoryFiles]);

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
              aria-label={i18n.t("shell:staveAppMenuButton.openStaveMenu")}
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
          className={UI_LAYER_CLASS.appMenu}
            xstyle={staveAppMenuStyles.menu}
        >
          <DropdownMenuLabel>Stave</DropdownMenuLabel>
          <DropdownMenuItem onSelect={clearTaskSelection}>
            <Home {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:staveAppMenuButton.home")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={args?.onOpenCommandPalette}
          >
            <Command {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:staveAppMenuButton.commandPalette")}
            <DropdownMenuShortcut
              className={sx(staveAppMenuStyles.shortcut)}
            >
              {commandPaletteShortcutLabel}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {repositoryPath ? (
            <DropdownMenuItem
              onSelect={handleRefreshRepositoryFiles}
            >
              <RefreshCw {...stylex.props(staveAppMenuStyles.itemIcon)} />
              {i18n.t("shell:staveAppMenuButton.refreshRepositoryFiles")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={handleToggleTheme}>
            {isDarkMode ? (
              <Sun {...stylex.props(staveAppMenuStyles.itemIcon)} />
            ) : (
              <Moon {...stylex.props(staveAppMenuStyles.itemIcon)} />
            )}
            {isDarkMode ? i18n.t("shell:staveAppMenuButton.switchToLightMode") : i18n.t("shell:staveAppMenuButton.switchToDarkMode")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={args?.onOpenKeyboardShortcuts}
          >
            <Keyboard {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:staveAppMenuButton.keyboardShortcuts")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={args?.onOpenSettings}>
            <Settings {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:staveAppMenuButton.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
