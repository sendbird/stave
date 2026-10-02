import { useEffect, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { standaloneCliStyles as styles } from "@/components/layout/standalone-cli/standalone-cli.styles";
import { X } from "lucide-react";
import { Button, PopoverContent } from "@/components/ui";
import { StandaloneCliTabBar } from "@/components/layout/standalone-cli/StandaloneCliTabBar";
import { StandaloneCliTerminal } from "@/components/layout/standalone-cli/StandaloneCliTerminal";
import { useStandaloneCliInstalledTabIds } from "@/components/layout/standalone-cli/useStandaloneCliInstalledTabIds";
import type { StandaloneCliTabId } from "@/lib/terminal/standalone-cli";
import { resolvePathBaseName } from "@/lib/path-utils";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function buildStandaloneCliEmptyStateText() {
  return "Set a Standalone CLI folder in Settings to run Claude Code, Codex, Cursor, and Kiro here. Nothing is added to your repositories.";
}

export function buildStandaloneCliNoInstalledCliText() {
  return "No supported CLI was found on this machine. Install Claude Code, Codex, Cursor, or Kiro, or set its binary path in Settings.";
}

/**
 * Sizing for the popup itself. With a folder set the panel is a terminal and
 * wants the room, bounded by the positioner's `--available-height` so it never
 * runs off the bottom of the window. With no folder there is nothing to size a
 * terminal against, so it shrinks to its message rather than parking a 40rem
 * void under the top bar.
 */
export function buildStandaloneCliPopoverStyle(args: {
  folderPath: string;
  hasInstalledCli: boolean;
}) {
  return args.folderPath && args.hasInstalledCli
    ? styles.popoverTerminal
    : styles.popoverEmpty;
}

/** Prop-driven so the panel can be asserted without a popover or a store. */
export function StandaloneCliPanel(props: {
  folderPath: string;
  installedTabIds: readonly StandaloneCliTabId[];
  visible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const { folderPath, installedTabIds, visible, onClose, onOpenSettings } =
    props;
  const emptyStateText = !folderPath
    ? buildStandaloneCliEmptyStateText()
    : installedTabIds.length === 0
      ? buildStandaloneCliNoInstalledCliText()
      : null;
  const folderLabel = folderPath
    ? resolvePathBaseName({ path: folderPath, fallback: folderPath })
    : "No folder set";

  return (
    <section
      data-testid="standalone-cli-panel"
      aria-label="Standalone CLI"
      className={sx(styles.panel)}
    >
      <header className={sx(styles.panelHeader)}>
        <div className={sx(styles.panelHeaderLead)}>
          <StandaloneCliTabBar tabIds={installedTabIds} />
          <span
            className={sx(styles.folderLabel)}
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
          xstyle={styles.closeButton}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      {emptyStateText === null ? (
        // The panel stays mounted through a close, so the terminal is told to
        // hide rather than being torn down. That keeps the CLI session attached
        // and the xterm buffer intact, so reopening is a repaint.
        <StandaloneCliTerminal
          folderPath={folderPath}
          installedTabIds={installedTabIds}
          visible={visible}
        />
      ) : (
        <div className={sx(styles.emptyState)}>
          <p className={sx(styles.emptyStateText)}>{emptyStateText}</p>
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
  );
}

export function StandaloneCliPopoverContent() {
  const open = useStandaloneCliStore((state) => state.open);
  const closeOverlay = useStandaloneCliStore((state) => state.closeOverlay);
  const adoptFolder = useStandaloneCliStore((state) => state.adoptFolder);
  const folderPath = useAppStore(
    (state) => state.settings.standaloneCliFolderPath,
  );
  const installedTabIds = useStandaloneCliInstalledTabIds();
  const [booted, setBooted] = useState(false);

  // Reconcile the Settings folder with the folder the live sessions were
  // booted against. adoptFolder is a no-op when they already agree.
  useEffect(() => {
    void adoptFolder({ folderPath });
  }, [adoptFolder, folderPath]);

  // Neither CLI may start before the user asks for one, so the subtree mounts
  // on the first open. From then on `keepMounted` holds it in the DOM through
  // every close, which is what keeps the terminal alive between visits.
  useEffect(() => {
    if (open) {
      setBooted(true);
    }
  }, [open]);

  return (
    <PopoverContent
      layer="floatingChrome"
      keepMounted={booted}
      side="bottom"
      align="end"
      sideOffset={6}
      collisionPadding={12}
      xstyle={buildStandaloneCliPopoverStyle({
        folderPath,
        hasInstalledCli: installedTabIds.length > 0,
      })}
    >
      {booted ? (
        <StandaloneCliPanel
          folderPath={folderPath}
          installedTabIds={installedTabIds}
          visible={open}
          onClose={closeOverlay}
          onOpenSettings={() => {
            // The popover layer sits above the dialog layer, so it has to get
            // out of the way before Settings opens.
            closeOverlay();
            window.dispatchEvent(
              new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                detail: { section: "general" },
              }),
            );
          }}
        />
      ) : null}
    </PopoverContent>
  );
}
