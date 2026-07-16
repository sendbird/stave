import { useMemo, type RefObject } from "react";
import {
  useTerminalInstance,
  type TerminalInstanceController,
} from "./useTerminalInstance";

export interface CliTerminalInstanceController {
  clear: () => void;
  write: (data: string, onParsed?: () => void) => void;
  writeln: (data: string) => void;
  getSize: () => { cols: number; rows: number };
  focus: () => (() => void) | null;
}

export interface UseCliTerminalInstanceArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  instanceKey: string;
  enabled: boolean;
  visible: boolean;
  restartToken: number;
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
  cursorStyle?: "block" | "bar" | "underline";
  isDarkMode: boolean;
  onData: (input: string) => void;
  onResize: (cols: number, rows: number) => Promise<void> | void;
}

export interface UseCliTerminalInstanceReturn {
  controller: CliTerminalInstanceController;
  ready: boolean;
  error: string | null;
  revision: number;
  writeErrorCount: number;
}

function mapController(
  controller: TerminalInstanceController,
): CliTerminalInstanceController {
  return {
    clear: controller.clear,
    write: controller.write,
    writeln: controller.writeln,
    getSize: controller.getSize,
    focus: controller.focus,
  };
}

/** CLI panes share the same renderer core as docked PTY panes. */
export function useCliTerminalInstance(
  args: UseCliTerminalInstanceArgs,
): UseCliTerminalInstanceReturn {
  const result = useTerminalInstance({
    containerRef: args.containerRef,
    diagnosticContext: {
      surface: "cli-session",
      tabKey: args.instanceKey,
      sessionId: null,
    },
    enabled: args.enabled,
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    lineHeight: args.lineHeight,
    cursorStyle: args.cursorStyle,
    isDarkMode: args.isDarkMode,
    visible: args.visible,
    restartToken: args.restartToken,
    onData: args.onData,
    onResize: args.onResize,
  });

  const controller = useMemo(
    () => mapController(result.controller),
    [result.controller],
  );

  return {
    ...result,
    controller,
  };
}
