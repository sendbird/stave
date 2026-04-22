import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

export interface CliTerminalInstanceController {
  clear: () => void;
  write: (data: string) => void;
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

const DEFAULT_TERMINAL_BACKGROUND = "#1f1f1f";
const DEFAULT_TERMINAL_FOREGROUND = "#eaeaea";

/** Track global WebGL failure — skip on subsequent terminal instances after a GPU crash. */
let webglLoadFailed = false;

function describeTerminalError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/** Parse an rgb/rgba string and return the channel values, or null. */
function parseRgb(rgb: string): [number, number, number] | null {
  const m = rgb.match(/(\d+)/g);
  if (!m || m.length < 3) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function resolveTerminalTheme() {
  if (typeof document === "undefined") {
    return {
      background: DEFAULT_TERMINAL_BACKGROUND,
      foreground: DEFAULT_TERMINAL_FOREGROUND,
    };
  }

  // xterm.js (and its WebGL addon) cannot parse oklch() color strings.
  // Resolve CSS custom properties through a probe element so the browser
  // converts oklch/etc. to an rgb() string that xterm can consume.
  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.backgroundColor = "var(--color-terminal)";
  probe.style.color = "var(--color-terminal-foreground)";
  document.documentElement.appendChild(probe);
  const computed = getComputedStyle(probe);
  const background = computed.backgroundColor || DEFAULT_TERMINAL_BACKGROUND;
  const foreground = computed.color || DEFAULT_TERMINAL_FOREGROUND;
  probe.remove();

  // Derive a visible selection colour from the foreground so selected text
  // stands out regardless of the terminal palette.
  const fg = parseRgb(foreground);
  const selectionBackground = fg
    ? `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0.35)`
    : undefined;
  const selectionInactiveBackground = fg
    ? `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0.2)`
    : undefined;

  return {
    background,
    foreground,
    selectionBackground,
    selectionInactiveBackground,
  };
}

function focusCliTerminalSurface(args: {
  terminal: XTerm | null;
  container: HTMLDivElement | null;
}) {
  if (!args.terminal || !args.container || typeof window === "undefined") {
    return null;
  }

  let cancelled = false;
  let frameId = 0;
  let attempts = 0;
  const maxAttempts = 8;

  const focus = () => {
    if (cancelled) {
      return;
    }

    args.terminal?.focus();

    const textarea = args.container?.querySelector(".xterm-helper-textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
    }

    const activeElement = args.container?.ownerDocument?.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      args.container?.contains(activeElement)
    ) {
      return;
    }

    attempts += 1;
    if (attempts < maxAttempts) {
      frameId = window.requestAnimationFrame(focus);
    }
  };

  frameId = window.requestAnimationFrame(focus);
  return () => {
    cancelled = true;
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
  };
}

export function useCliTerminalInstance(
  args: UseCliTerminalInstanceArgs,
): UseCliTerminalInstanceReturn {
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const visibleRef = useRef(args.visible);
  const onDataRef = useRef(args.onData);
  const onResizeRef = useRef(args.onResize);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [writeErrorCount, setWriteErrorCount] = useState(0);

  useEffect(() => {
    visibleRef.current = args.visible;
    onDataRef.current = args.onData;
    onResizeRef.current = args.onResize;
  }, [args.onData, args.onResize, args.visible]);

  const writeToTerminal = useCallback((operation: () => void) => {
    try {
      operation();
      setWriteErrorCount((count) => (count === 0 ? count : 0));
      setError((current) => (current ? null : current));
    } catch (caughtError) {
      setWriteErrorCount((count) => count + 1);
      setError(
        describeTerminalError(caughtError, "Failed to update CLI terminal."),
      );
    }
  }, []);

  const controller = useMemo<CliTerminalInstanceController>(
    () => ({
      clear: () => {
        const terminal = terminalRef.current;
        if (!terminal) {
          return;
        }
        writeToTerminal(() => {
          terminal.clear();
        });
      },
      write: (data: string) => {
        const terminal = terminalRef.current;
        if (!terminal || !data) {
          return;
        }
        writeToTerminal(() => {
          terminal.write(data);
        });
      },
      writeln: (data: string) => {
        const terminal = terminalRef.current;
        if (!terminal) {
          return;
        }
        writeToTerminal(() => {
          terminal.writeln(data);
        });
      },
      getSize: () => {
        const terminal = terminalRef.current;
        return {
          cols: terminal?.cols ?? 0,
          rows: terminal?.rows ?? 0,
        };
      },
      focus: () =>
        focusCliTerminalSurface({
          terminal: terminalRef.current,
          container: args.containerRef.current,
        }),
    }),
    [args.containerRef, writeToTerminal],
  );

  useEffect(() => {
    if (!args.enabled) {
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastSizeRef.current = { cols: 0, rows: 0 };
      setReady(false);
      setWriteErrorCount(0);
      setError(null);
      return;
    }

    const container = args.containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let focusCleanup: (() => void) | null = null;
    let resizeFrame = 0;

    setReady(false);
    setWriteErrorCount(0);
    setError(null);
    container.replaceChildren();

    const terminal = new XTerm({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: args.fontFamily,
      fontSize: args.fontSize,
      scrollback: 10_000,
      theme: resolveTerminalTheme(),
    });
    const fitAddon = new FitAddon();

    const emitResize = () => {
      if (!visibleRef.current) {
        return;
      }
      const currentTerminal = terminalRef.current;
      const currentFitAddon = fitAddonRef.current;
      if (!currentTerminal || !currentFitAddon) {
        return;
      }

      currentFitAddon.fit();
      const nextSize = {
        cols: currentTerminal.cols,
        rows: currentTerminal.rows,
      };
      if (
        nextSize.cols < 1 ||
        nextSize.rows < 1 ||
        (nextSize.cols === lastSizeRef.current.cols &&
          nextSize.rows === lastSizeRef.current.rows)
      ) {
        return;
      }

      lastSizeRef.current = nextSize;
      void onResizeRef.current(nextSize.cols, nextSize.rows);
    };

    try {
      terminal.loadAddon(fitAddon);
      terminal.open(container);
    } catch (caughtError) {
      terminal.dispose();
      setError(
        describeTerminalError(
          caughtError,
          "Failed to initialize CLI terminal renderer.",
        ),
      );
      return;
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (!webglLoadFailed) {
      import("@xterm/addon-webgl")
        .then(({ WebglAddon }) => {
          if (cancelled || terminalRef.current !== terminal) {
            return;
          }
          try {
            const webgl = new WebglAddon();
            webgl.onContextLoss(() => {
              webgl.dispose();
              webglLoadFailed = true;
            });
            terminal.loadAddon(webgl);
          } catch {
            webglLoadFailed = true;
          }
        })
        .catch(() => {
          webglLoadFailed = true;
        });
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (!visibleRef.current) {
              return;
            }
            if (resizeFrame) {
              return;
            }
            resizeFrame = window.requestAnimationFrame(() => {
              resizeFrame = 0;
              emitResize();
            });
          })
        : null;
    resizeObserver?.observe(container);

    const dataDisposable = terminal.onData((input) => {
      onDataRef.current(input);
    });

    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      if (cancelled) {
        return;
      }
      emitResize();
      setReady(true);
      setRevision((value) => value + 1);
      focusCleanup = focusCliTerminalSurface({
        terminal,
        container,
      });
    });

    return () => {
      cancelled = true;
      focusCleanup?.();
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }
      dataDisposable.dispose();
      resizeObserver?.disconnect();
      terminal.dispose();
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      if (fitAddonRef.current === fitAddon) {
        fitAddonRef.current = null;
      }
      lastSizeRef.current = { cols: 0, rows: 0 };
      setReady(false);
    };
  }, [
    args.containerRef,
    args.enabled,
    args.fontFamily,
    args.fontSize,
    args.instanceKey,
    args.restartToken,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }

    terminal.options.fontFamily = args.fontFamily;
    terminal.options.fontSize = args.fontSize;
    terminal.options.theme = resolveTerminalTheme();
    fitAddon.fit();
    const nextSize = {
      cols: terminal.cols,
      rows: terminal.rows,
    };
    if (
      nextSize.cols > 0 &&
      nextSize.rows > 0 &&
      (nextSize.cols !== lastSizeRef.current.cols ||
        nextSize.rows !== lastSizeRef.current.rows)
    ) {
      lastSizeRef.current = nextSize;
      void onResizeRef.current(nextSize.cols, nextSize.rows);
    }
  }, [args.fontFamily, args.fontSize, args.isDarkMode]);

  useEffect(() => {
    if (!args.visible || !ready) {
      return;
    }
    const fitAddon = fitAddonRef.current;
    const terminal = terminalRef.current;
    if (fitAddon && terminal) {
      fitAddon.fit();
      const nextSize = { cols: terminal.cols, rows: terminal.rows };
      if (
        nextSize.cols > 0 &&
        nextSize.rows > 0 &&
        (nextSize.cols !== lastSizeRef.current.cols ||
          nextSize.rows !== lastSizeRef.current.rows)
      ) {
        lastSizeRef.current = nextSize;
        void onResizeRef.current(nextSize.cols, nextSize.rows);
      }
    }
    return controller.focus() ?? undefined;
  }, [args.visible, controller, ready]);

  return {
    controller,
    ready,
    error,
    revision,
    writeErrorCount,
  };
}
