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

export function StandaloneCliOverlayView(props: {
  folderPath: string;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const { folderPath, onClose, onOpenSettings } = props;
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
      // Closing happens through the header button or a backdrop click; the
      // backdrop covers the top bar, so its toggle is unreachable while open.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
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
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        {folderPath ? (
          // Closing the overlay unmounts this subtree, so the terminal needs no
          // separate visibility flag to honour the CLI dispose-on-hide rule.
          <StandaloneCliTerminal folderPath={folderPath} />
        ) : (
          <div className="flex flex-col items-start gap-3 px-4 py-6">
            <p className="text-sm text-muted-foreground">
              {buildStandaloneCliEmptyStateText()}
            </p>
            {/* The backdrop covers the top bar, so this is the only route to
                Settings while the overlay is open. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
            >
              Open Settings
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export function StandaloneCliOverlay(props: { onOpenSettings: () => void }) {
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

  return (
    <StandaloneCliOverlayView
      folderPath={folderPath}
      onClose={closeOverlay}
      onOpenSettings={props.onOpenSettings}
    />
  );
}
