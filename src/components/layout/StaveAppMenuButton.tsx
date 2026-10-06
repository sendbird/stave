import { APP_LOCALES, APP_LOCALE_NATIVE_NAMES, isAppLocale, i18n, useTranslation } from "@/i18n";
import {
  Bot,
  ChartNoAxesColumn,
  Gauge,
  LayoutGrid,
  Command,
  Home,
  Keyboard,
  Languages,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
    openFleetView,
    openAgents,
    openResults,
    openUsage,
    repositoryPath,
    isDarkMode,
    setDarkMode,
    refreshRepositoryFiles,
    language,
    updateSettings,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.clearTaskSelection,
          state.openFleetView,
          state.openAgents,
          state.openResults,
          state.openUsage,
          state.repositoryPath,
          state.isDarkMode,
          state.setDarkMode,
          state.refreshRepositoryFiles,
          state.settings.language,
          state.updateSettings,
        ] as const,
    ),
  );

  const handleRefreshRepositoryFiles = useCallback(() => {
    void refreshRepositoryFiles();
  }, [refreshRepositoryFiles]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode({ enabled: !isDarkMode });
  }, [isDarkMode, setDarkMode]);

  const handleLanguageChange = useCallback((value: string) => {
    if (isAppLocale(value)) {
      updateSettings({ patch: { language: value } });
    }
  }, [updateSettings]);

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
          <DropdownMenuItem onSelect={() => openFleetView()}>
            <LayoutGrid {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:sidebarPrimaryNav.fleetView")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openAgents()}>
            <Bot {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:sidebarPrimaryNav.agents")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openResults()}>
            <ChartNoAxesColumn {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:sidebarPrimaryNav.results")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openUsage()}>
            <Gauge {...stylex.props(staveAppMenuStyles.itemIcon)} />
            {i18n.t("shell:sidebarPrimaryNav.aIUsage")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages {...stylex.props(staveAppMenuStyles.itemIcon)} />
              {i18n.t("shell:staveAppMenuButton.language")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={language} onValueChange={handleLanguageChange}>
                {APP_LOCALES.map((locale) => (
                  <DropdownMenuRadioItem key={locale} value={locale}>
                    {APP_LOCALE_NATIVE_NAMES[locale]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
