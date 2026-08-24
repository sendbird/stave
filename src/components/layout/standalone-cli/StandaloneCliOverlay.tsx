import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { StandaloneCliTabBar } from "@/components/layout/standalone-cli/StandaloneCliTabBar";
import { StandaloneCliTerminal } from "@/components/layout/standalone-cli/StandaloneCliTerminal";
import { resolvePathBaseName } from "@/lib/path-utils";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function buildStandaloneCliEmptyStateText() {
  return "Set a Standalone CLI folder in Settings to run Claude Code and Codex here. Nothing is added to your projects.";
}

export function StandaloneCliOverlay() {
  const open = useStandaloneCliStore((state) => state.open);
  const closeOverlay = useStandaloneCliStore((state) => state.closeOverlay);
  const adoptFolder = useStandaloneCliStore((state) => state.adoptFolder);
  const folderPath = useAppStore(
    (state) => state.settings.standaloneCliFolderPath,
  );

  // Reconcile the Settings folder with the folder the live sessions were
  // booted against. adoptFolder is a no-op when they already agree.
  useEffect(() => {
    void adoptFolder({ folderPath });
  }, [adoptFolder, folderPath]);

  if (!open) {
    return null;
  }

  const folderLabel = folderPath
    ? resolvePathBaseName({ path: folderPath, fallback: folderPath })
    : "No folder set";

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm",
        UI_LAYER_CLASS.floatingChrome,
      )}
      // Escape is the Claude Code TUI cancel key, so it must reach the PTY.
      // Closing happens through the header button and the top-bar toggle only.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          closeOverlay();
        }
      }}
    >
      <section
        data-testid="standalone-cli-panel"
        aria-label="Standalone CLI"
        className="flex h-[min(40rem,82vh)] w-[min(60rem,92vw)] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <StandaloneCliTabBar />
            <span
              className="truncate font-mono text-xs text-muted-foreground"
              title={folderPath || undefined}
            >
              {folderLabel}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Close Standalone CLI"
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={closeOverlay}
          >
            <X className="size-4" />
          </Button>
        </header>
        {folderPath ? (
          <StandaloneCliTerminal folderPath={folderPath} visible={open} />
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {buildStandaloneCliEmptyStateText()}
          </p>
        )}
      </section>
    </div>
  );
}
