import { FolderTree, LoaderCircle } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { Card, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { TopBarBranchDropdown } from "@/components/layout/TopBarBranchDropdown";
import { TopBarFileSearch } from "@/components/layout/TopBarFileSearch";
import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { TopBarUtilityActions } from "@/components/layout/TopBarUtilityActions";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";

const loadSettingsDialog = () =>
  import("@/components/layout/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  }));
const SettingsDialog = lazy(() => loadSettingsDialog());
const loadKeyboardShortcutsDrawer = () =>
  import("@/components/layout/KeyboardShortcutsDrawer").then((module) => ({
    default: module.KeyboardShortcutsDrawer,
  }));
const KeyboardShortcutsDrawer = lazy(() => loadKeyboardShortcutsDrawer());
const TOP_BAR_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const TOP_BAR_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

function formatWorkspacePathLabel(args: { workspacePath?: string; projectPath?: string | null }) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return "";
  }

  const projectPath = args.projectPath?.trim();
  if (projectPath && workspacePath.startsWith(`${projectPath}/`)) {
    return workspacePath.slice(projectPath.length + 1);
  }

  return workspacePath;
}

export function TopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [
    isDarkMode,
    setDarkMode,
    refreshProjectFiles,
    activeWorkspaceId,
    workspacePathById,
    projectPath,
  ] = useAppStore(useShallow((state) => [
    state.isDarkMode,
    state.setDarkMode,
    state.refreshProjectFiles,
    state.activeWorkspaceId,
    state.workspacePathById,
    state.projectPath,
  ] as const));
  const activeWorkspacePath = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const workspacePathLabel = formatWorkspacePathLabel({
    workspacePath: activeWorkspacePath,
    projectPath,
  });

  function OverlayLoadingFallback(args: { title: string }) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]">
        <Card className="w-full max-w-md border-border/80 bg-background/95 p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading {args.title.toLowerCase()}...
          </div>
        </Card>
      </div>
    );
  }

  const handleRefreshProjectFiles = useCallback(() => {
    void refreshProjectFiles();
  }, [refreshProjectFiles]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode({ enabled: !isDarkMode });
  }, [isDarkMode, setDarkMode]);

  const handleOpenShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
    setShortcutsOpen(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void loadSettingsDialog();
    setSettingsOpen(true);
  }, []);

  const handlePreloadShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
  }, []);

  const handlePreloadSettings = useCallback(() => {
    void loadSettingsDialog();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod || event.altKey || event.shiftKey || event.code !== "Slash") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement
        && (
          target.isContentEditable
          || Boolean(target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']"))
        )
      ) {
        return;
      }

      event.preventDefault();
      setShortcutsOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header
        data-testid="top-bar"
        className="relative z-30 flex h-12 items-center justify-between gap-3 border-b border-border/70 bg-card px-3.5"
        style={TOP_BAR_DRAG_STYLE}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TooltipProvider>
            <TopBarBranchDropdown noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
            {activeWorkspacePath ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
                    style={TOP_BAR_NO_DRAG_STYLE}
                  >
                    <FolderTree className="size-3.5 shrink-0" />
                    <span className="truncate font-mono">{workspacePathLabel}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">{activeWorkspacePath}</TooltipContent>
              </Tooltip>
            ) : null}
            <TopBarOpenPR noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          </TooltipProvider>
        </div>
        <div
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={TOP_BAR_NO_DRAG_STYLE}
        >
          <TopBarFileSearch noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5" style={TOP_BAR_NO_DRAG_STYLE}>
          <TopBarUtilityActions
            isDarkMode={isDarkMode}
            noDragStyle={TOP_BAR_NO_DRAG_STYLE}
            onRefresh={handleRefreshProjectFiles}
            onToggleTheme={handleToggleTheme}
            onOpenShortcuts={handleOpenShortcuts}
            onOpenSettings={handleOpenSettings}
            onPreloadShortcuts={handlePreloadShortcuts}
            onPreloadSettings={handlePreloadSettings}
          />
          <TopBarWindowControls noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        </div>
      </header>
      {shortcutsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title="Keyboard Shortcuts" />}>
          <KeyboardShortcutsDrawer open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </Suspense>
      ) : null}
      {settingsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title="Settings" />}>
          <SettingsDialog open={settingsOpen} onOpenChange={({ open }) => setSettingsOpen(open)} />
        </Suspense>
      ) : null}
    </>
  );
}
