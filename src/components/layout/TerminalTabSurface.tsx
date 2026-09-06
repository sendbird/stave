import { useEffect, useRef } from "react";
import {
  TERMINAL_SURFACE_FRAME_CLASS_NAME,
  terminalSurfaceStyles,
} from "@/components/layout/terminal-surface-styles";
import { sx } from "@/components/ads/utils/stylex";
import { useTerminalInstance } from "@/components/layout/useTerminalInstance";
import type { UseTerminalTabManagerReturn } from "@/components/layout/useTerminalTabManager";
import { getTerminalSessionRouter } from "@/lib/terminal/terminal-session-router";

export function TerminalTabSurface(args: {
  tabKey: string;
  sessionId: string | null;
  surface: "terminal-pane" | "cli-session";
  isActive: boolean;
  isVisible: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
  cursorStyle?: "block" | "bar" | "underline";
  isDarkMode: boolean;
  dimmed?: boolean;
  tabManager: UseTerminalTabManagerReturn;
  onData: (tabKey: string, input: string) => void;
  onResize: (
    tabKey: string,
    cols: number,
    rows: number,
  ) => Promise<void> | void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalInstance = useTerminalInstance({
    containerRef,
    diagnosticContext: {
      surface: args.surface,
      tabKey: args.tabKey,
      sessionId: args.sessionId,
    },
    enabled: args.tabManager.shouldMountTerminal(args.tabKey),
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    lineHeight: args.lineHeight,
    cursorStyle: args.cursorStyle,
    isDarkMode: args.isDarkMode,
    visible: args.isVisible && args.isActive,
    restartToken: args.tabManager.getRestartToken(args.tabKey),
    onData: (input) => args.onData(args.tabKey, input),
    onResize: (cols, rows) => args.onResize(args.tabKey, cols, rows),
  });

  useEffect(
    () =>
      args.tabManager.registerInstance(
        args.tabKey,
        terminalInstance.controller,
      ),
    [args.tabKey, args.tabManager, terminalInstance.controller],
  );

  useEffect(() => {
    if (
      !args.sessionId ||
      !args.isActive ||
      !args.isVisible ||
      !terminalInstance.ready
    ) {
      return;
    }

    const router = getTerminalSessionRouter();
    return router.subscribe(args.sessionId, {
      onScreenState: (screenState) => {
        terminalInstance.controller.restoreScreenState(screenState);
      },
      onOutput: (output, onParsed) => {
        terminalInstance.controller.write(output, onParsed);
      },
    });
  }, [
    args.isActive,
    args.isVisible,
    args.sessionId,
    terminalInstance.controller,
    terminalInstance.ready,
  ]);

  useEffect(() => {
    args.tabManager.updateInstanceStatus(args.tabKey, {
      ready: terminalInstance.ready,
      error: terminalInstance.error,
      writeErrorCount: terminalInstance.writeErrorCount,
      revision: terminalInstance.revision,
    });
  }, [
    args.tabKey,
    args.tabManager,
    terminalInstance.error,
    terminalInstance.ready,
    terminalInstance.revision,
    terminalInstance.writeErrorCount,
  ]);

  return (
    <div
      className={TERMINAL_SURFACE_FRAME_CLASS_NAME}
      style={{ display: args.isActive ? "block" : "none" }}
      aria-hidden={!args.isActive}
    >
      <div
        ref={containerRef}
        data-terminal-surface
        className={sx(
          terminalSurfaceStyles.surface,
          args.dimmed && terminalSurfaceStyles.dimmed,
        )}
      />
    </div>
  );
}
