import { Home, Keyboard, LoaderCircle, Settings } from "lucide-react";
import { Suspense, lazy, useCallback, useState } from "react";
import { Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui";
import { getProviderIconUrl } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

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

export function StaveAppMenuButton(args?: { compact?: boolean; className?: string }) {
  const compact = args?.compact ?? false;
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const clearTaskSelection = useAppStore((state) => state.clearTaskSelection);

  const handleOpenShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
    setShortcutsOpen(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void loadSettingsDialog();
    setSettingsOpen(true);
  }, []);

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
                ? "h-10 w-10 rounded-md border border-border/80 bg-background/70 p-0 hover:bg-secondary/70"
                : "h-8 gap-1.5 rounded-md border border-border/80 bg-card px-2.5 hover:bg-secondary/70",
              open && "border-primary/70 bg-secondary/80",
              args?.className,
            )}
          >
            <img
              src={getProviderIconUrl({ providerId: "stave", isDarkMode })}
              alt="Stave"
              className="h-4 w-auto"
              draggable={false}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-52">
          <DropdownMenuLabel>Stave</DropdownMenuLabel>
          <DropdownMenuItem className="gap-2" onSelect={clearTaskSelection}>
            <Home className="size-4 text-muted-foreground" />
            Home
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onSelect={handleOpenShortcuts}>
            <Keyboard className="size-4 text-muted-foreground" />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={handleOpenSettings}>
            <Settings className="size-4 text-muted-foreground" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
