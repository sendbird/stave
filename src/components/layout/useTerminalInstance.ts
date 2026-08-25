import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import {
  DEFAULT_TERMINAL_FONT_WEIGHT,
  DEFAULT_TERMINAL_FONT_WEIGHT_BOLD,
} from "@/lib/terminal/defaults";
import { TerminalOutputScheduler } from "@/lib/terminal/terminal-output-scheduler";
import {
  focusTerminalInstanceSurface,
  waitForAnimationFrames,
} from "@/components/layout/terminal-instance-focus";
import {
  getResolvedTerminalThemeKey,
  resolveTerminalTheme,
} from "@/components/layout/terminal-instance-theme";
import { restoreTerminalScreenState } from "@/components/layout/terminal-instance-screen-state";

// This module stays the public entry point for the terminal instance hook, so
// helpers that moved into sibling modules are re-exported here unchanged.
export { focusTerminalInstanceSurface } from "@/components/layout/terminal-instance-focus";
export { restoreTerminalScreenState } from "@/components/layout/terminal-instance-screen-state";

const AUTO_FOCUS_MAX_ATTEMPTS = 60;
const WEBGL_MAX_AUTOMATIC_RETRIES = 3;

export const TERMINAL_WRITE_ERROR_THRESHOLD = 5;

function describeTerminalError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

export interface TerminalInstanceController {
  readonly terminal: XTerm | null;
  readonly fitAddon: FitAddon | null;
  clear: () => void;
  restoreScreenState: (screenState: string) => void;
  write: (data: string, onParsed?: () => void) => void;
  writeln: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  focus: () => () => void;
  proposeDimensions: () => { cols: number; rows: number } | undefined;
  getSize: () => { cols: number; rows: number };
  /**
   * Re-measures and repaints the renderer after its DOM was repositioned or
   * reparented (e.g. a Dockview panel moved between groups) and re-enables
   * the WebGL addon if it was lost during the move.
   */
  refreshViewport: () => void;
}

export interface UseTerminalInstanceArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  diagnosticContext?: {
    surface: string;
    tabKey: string;
    sessionId: string | null;
  };
  enabled: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
  cursorStyle?: "block" | "bar" | "underline";
  isDarkMode: boolean;
  visible: boolean;
  // Rebuilds xterm on change. Strings let a caller fold a surface identity (an
  // active tab key) in without inventing a collision-free numeric encoding.
  restartToken?: number | string;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => Promise<void> | void;
}

export interface UseTerminalInstanceReturn {
  controller: TerminalInstanceController;
  ready: boolean;
  error: string | null;
  writeErrorCount: number;
  revision: number;
}

export function useTerminalInstance(
  args: UseTerminalInstanceArgs,
): UseTerminalInstanceReturn {
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputSchedulerRef = useRef<TerminalOutputScheduler | null>(null);
  const webglCleanupRef = useRef<() => void>(() => {});
  const retryWebglRef = useRef<() => void>(() => {});
  const cleanupRef = useRef<() => void>(() => {});
  const themeSyncFrameRef = useRef<number | null>(null);
  const themeKeyRef = useRef<string | null>(null);
  const visibleRef = useRef(args.visible);
  const diagnosticContextRef = useRef(args.diagnosticContext);
  const onDataRef = useRef(args.onData);
  const onResizeRef = useRef(args.onResize);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeErrorCount, setWriteErrorCount] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    visibleRef.current = args.visible;
  }, [args.visible]);

  useEffect(() => {
    diagnosticContextRef.current = args.diagnosticContext;
  }, [args.diagnosticContext]);

  useEffect(() => {
    onDataRef.current = args.onData;
    onResizeRef.current = args.onResize;
  }, [args.onData, args.onResize]);

  const clearPendingThemeWork = useCallback(() => {
    if (themeSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(themeSyncFrameRef.current);
      themeSyncFrameRef.current = null;
    }
  }, []);

  const disposeInstance = useCallback(() => {
    clearPendingThemeWork();

    outputSchedulerRef.current?.dispose();
    outputSchedulerRef.current = null;
    webglCleanupRef.current();
    webglCleanupRef.current = () => {};
    retryWebglRef.current = () => {};

    try {
      cleanupRef.current();
    } catch (caughtError) {
      console.warn("[terminal] failed to dispose renderer", caughtError);
    }

    cleanupRef.current = () => {};
    terminalRef.current = null;
    fitAddonRef.current = null;
    themeKeyRef.current = null;
    setReady(false);
  }, [clearPendingThemeWork]);

  // Track consecutive successful writes so the degraded banner can auto-clear
  // once the renderer genuinely stabilises. Only count real writes so a null
  // terminal during teardown/bootstrap does not clear a still-broken surface.
  const consecutiveWriteSuccessRef = useRef(0);
  const reportRendererIssue = useCallback(
    (context: string, caughtError: unknown) => {
      const diagnostics = window.api?.diagnostics;
      if (!diagnostics?.reportRendererIssue) {
        return;
      }

      const message = describeTerminalError(
        caughtError,
        "Unknown terminal renderer failure.",
      );
      const stack =
        caughtError instanceof Error && caughtError.stack
          ? caughtError.stack
          : undefined;
      const size = terminalRef.current
        ? {
            cols: String(terminalRef.current.cols ?? 0),
            rows: String(terminalRef.current.rows ?? 0),
          }
        : null;

      void diagnostics.reportRendererIssue({
        scope: "terminal-renderer",
        context,
        message,
        stack,
        metadata: {
          surface: diagnosticContextRef.current?.surface ?? "unknown",
          tabKey: diagnosticContextRef.current?.tabKey ?? "unknown",
          sessionId: diagnosticContextRef.current?.sessionId ?? "none",
          visible: String(visibleRef.current),
          cols: size?.cols ?? "0",
          rows: size?.rows ?? "0",
        },
      });
    },
    [],
  );

  const executeTerminalOperation = useCallback(
    <T>(
      context: string,
      operation: () => T,
      options: {
        countWriteError?: boolean;
        countWriteSuccessWhen?: (result: T) => boolean;
        message?: string;
      } = {},
    ) => {
      try {
        const result = operation();
        const didWrite = options.countWriteSuccessWhen?.(result) ?? true;
        if (options.countWriteError && didWrite) {
          consecutiveWriteSuccessRef.current += 1;
          if (
            consecutiveWriteSuccessRef.current >= TERMINAL_WRITE_ERROR_THRESHOLD
          ) {
            consecutiveWriteSuccessRef.current = 0;
            setWriteErrorCount(0);
          }
        }
        return result;
      } catch (caughtError) {
        if (options.countWriteError) {
          consecutiveWriteSuccessRef.current = 0;
          setWriteErrorCount((count) => count + 1);
        }

        reportRendererIssue(context, caughtError);
        console.error(`[terminal] ${context}`, caughtError);
        setError(
          describeTerminalError(
            caughtError,
            options.message ?? "Terminal renderer failed.",
          ),
        );
        return undefined;
      }
    },
    [reportRendererIssue],
  );

  const measureProposedDimensions = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const container = args.containerRef.current;
    if (!fitAddon || !container) {
      return undefined;
    }
    if (container.offsetWidth <= 0 || container.offsetHeight <= 0) {
      return undefined;
    }

    const proposed = executeTerminalOperation(
      "measure-terminal-dimensions",
      () => fitAddon.proposeDimensions(),
      { message: "Failed to measure terminal dimensions." },
    );
    if (!proposed) {
      return undefined;
    }

    return {
      cols: Math.max(1, proposed.cols),
      rows: Math.max(1, proposed.rows),
    };
  }, [args.containerRef, executeTerminalOperation]);

  const emitResize = useCallback(() => {
    if (!visibleRef.current) {
      return;
    }
    const proposed = measureProposedDimensions();
    if (!proposed) {
      return;
    }
    onResizeRef.current(proposed.cols, proposed.rows);
  }, [measureProposedDimensions]);

  const syncTerminalTheme = useCallback(
    (force = false) => {
      const terminal = terminalRef.current;
      if (!terminal || typeof document === "undefined") {
        return;
      }

      const theme = resolveTerminalTheme();
      const themeKey = getResolvedTerminalThemeKey(theme);
      if (!force && themeKeyRef.current === themeKey) {
        return;
      }

      themeKeyRef.current = themeKey;
      executeTerminalOperation(
        "sync-terminal-theme",
        () => {
          terminal.options.theme = theme;
        },
        { message: "Failed to apply terminal theme." },
      );
    },
    [executeTerminalOperation],
  );

  const scheduleTerminalThemeSync = useCallback(
    (force = false) => {
      if (themeSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(themeSyncFrameRef.current);
      }

      themeSyncFrameRef.current = window.requestAnimationFrame(() => {
        themeSyncFrameRef.current = null;
        syncTerminalTheme(force);
      });
    },
    [syncTerminalTheme],
  );

  const focus = useCallback(() => {
    let cancelled = false;
    let attempts = 0;

    const tryFocus = () => {
      if (cancelled) {
        return;
      }

      const didFocus = focusTerminalInstanceSurface({
        terminal: terminalRef.current,
        container: args.containerRef.current,
      });
      if (didFocus) {
        return;
      }

      attempts += 1;
      if (attempts < AUTO_FOCUS_MAX_ATTEMPTS) {
        window.requestAnimationFrame(tryFocus);
      }
    };

    window.requestAnimationFrame(tryFocus);

    return () => {
      cancelled = true;
    };
  }, [args.containerRef]);

  useEffect(() => {
    if (!args.enabled) {
      disposeInstance();
      setError(null);
      setWriteErrorCount(0);
      return;
    }

    let cancelled = false;

    setReady(false);
    setError(null);
    setWriteErrorCount(0);
    consecutiveWriteSuccessRef.current = 0;

    const bootstrap = async () => {
      const container = args.containerRef.current;
      if (cancelled || !container) {
        return;
      }

      if (typeof document !== "undefined" && "fonts" in document) {
        // FontFaceSet.load accepts one family reliably. Loading the whole
        // fallback stack can silently skip the Nerd Font preload.
        const primaryFontFamily =
          args.fontFamily.split(",")[0]?.trim() || "monospace";
        const fontSpec = `${args.fontSize}px ${primaryFontFamily}`;
        try {
          await Promise.race([
            document.fonts.load(fontSpec),
            new Promise<void>((resolve) => setTimeout(resolve, 1500)),
          ]);
        } catch {
          // Best-effort font preload. Continue even if the browser rejects it.
        }
      }

      if (cancelled) {
        return;
      }

      container.replaceChildren();

      const terminal = new XTerm({
        allowProposedApi: true,
        convertEol: true,
        cursorBlink: false,
        cursorStyle: args.cursorStyle ?? "block",
        fontFamily: args.fontFamily,
        fontSize: args.fontSize,
        fontWeight: DEFAULT_TERMINAL_FONT_WEIGHT,
        fontWeightBold: DEFAULT_TERMINAL_FONT_WEIGHT_BOLD,
        lineHeight: Math.min(3, Math.max(1, args.lineHeight ?? 1)),
        minimumContrastRatio: 4.5,
        scrollback: 10_000,
        theme: resolveTerminalTheme(),
      });
      const fitAddon = new FitAddon();

      try {
        terminal.loadAddon(fitAddon);
        terminal.open(container);
      } catch (caughtError) {
        try {
          terminal.dispose();
        } catch {
          // Ignore best-effort cleanup after failed bootstrap.
        }
        if (!cancelled) {
          setError(
            describeTerminalError(
              caughtError,
              "Failed to initialize terminal renderer.",
            ),
          );
        }
        return;
      }

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      themeKeyRef.current = null;

      const outputScheduler = new TerminalOutputScheduler(terminal, {
        maxChunkChars: 128 * 1024,
        onWriteError: (caughtError) => {
          executeTerminalOperation(
            "write-terminal-output",
            () => {
              throw caughtError;
            },
            {
              countWriteError: true,
              message: "Failed to render terminal output.",
            },
          );
        },
        onWriteParsed: () => {
          executeTerminalOperation("write-terminal-output", () => true, {
            countWriteError: true,
            countWriteSuccessWhen: Boolean,
          });
        },
      });
      outputSchedulerRef.current = outputScheduler;

      for (const [name, addon] of [
        ["unicode11", new Unicode11Addon()],
        ["web-links", new WebLinksAddon()],
        ["search", new SearchAddon()],
      ] as const) {
        try {
          terminal.loadAddon(addon);
        } catch (caughtError) {
          reportRendererIssue(`load-terminal-addon:${name}`, caughtError);
        }
      }

      let webgl: {
        dispose: () => void;
        onContextLoss: (callback: () => void) => void;
        textureAtlas?: HTMLCanvasElement;
      } | null = null;
      let webglRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let webglRetryCount = 0;
      const releaseWebgl = () => {
        if (webglRetryTimer !== null) {
          clearTimeout(webglRetryTimer);
          webglRetryTimer = null;
        }
        const canvas = webgl?.textureAtlas;
        const context =
          canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
        const loseContext = context?.getExtension("WEBGL_lose_context");
        loseContext?.loseContext();
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        webgl?.dispose();
        webgl = null;
      };
      const loadWebgl = () => {
        if (cancelled || !visibleRef.current || webgl) {
          return;
        }
        import("@xterm/addon-webgl")
          .then(({ WebglAddon }) => {
            if (
              cancelled ||
              terminalRef.current !== terminal ||
              !visibleRef.current
            ) {
              return;
            }
            try {
              const nextWebgl = new WebglAddon();
              nextWebgl.onContextLoss(() => {
                nextWebgl.dispose();
                webgl = null;
                webglRetryCount += 1;
                if (
                  visibleRef.current &&
                  webglRetryCount <= WEBGL_MAX_AUTOMATIC_RETRIES &&
                  webglRetryTimer === null
                ) {
                  webglRetryTimer = setTimeout(() => {
                    webglRetryTimer = null;
                    loadWebgl();
                  }, 500);
                }
              });
              terminal.loadAddon(nextWebgl);
              webgl = nextWebgl;
            } catch (caughtError) {
              reportRendererIssue("load-terminal-addon:webgl", caughtError);
            }
          })
          .catch((caughtError) => {
            reportRendererIssue("load-terminal-addon:webgl", caughtError);
          });
      };
      retryWebglRef.current = () => {
        webglRetryCount = 0;
        loadWebgl();
      };
      webglCleanupRef.current = releaseWebgl;
      loadWebgl();

      // Gate ResizeObserver through requestAnimationFrame so resize-heavy
      // interactions emit at most one measure + resize request per frame. The
      // local surface still follows the backend-success path, preserving the
      // PTY-first contract.
      let resizeRafPending = false;
      const resizeObserver =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
              if (!visibleRef.current) {
                return;
              }
              if (resizeRafPending) {
                return;
              }
              resizeRafPending = true;
              requestAnimationFrame(() => {
                resizeRafPending = false;
                if (!visibleRef.current) {
                  return;
                }
                emitResize();
              });
            })
          : null;
      resizeObserver?.observe(container);

      const dataDisposable = terminal.onData((input) => {
        onDataRef.current(input);
      });

      const onFocusIn = () => {
        terminal.options.cursorBlink = true;
      };
      const onFocusOut = (event: FocusEvent) => {
        const relatedTarget = event.relatedTarget;
        if (
          relatedTarget instanceof Node &&
          container.contains(relatedTarget)
        ) {
          return;
        }
        terminal.options.cursorBlink = false;
      };

      container.addEventListener("focusin", onFocusIn);
      container.addEventListener("focusout", onFocusOut);
      const onWindowFocus = () => retryWebglRef.current();
      window.addEventListener("focus", onWindowFocus);

      await waitForAnimationFrames(2);
      if (cancelled) {
        container.removeEventListener("focusin", onFocusIn);
        container.removeEventListener("focusout", onFocusOut);
        window.removeEventListener("focus", onWindowFocus);
        dataDisposable.dispose();
        resizeObserver?.disconnect();
        outputScheduler.dispose();
        releaseWebgl();
        terminal.dispose();
        return;
      }

      const proposed = measureProposedDimensions();
      if (proposed) {
        executeTerminalOperation(
          "resize-terminal-on-bootstrap",
          () => {
            terminal.resize(proposed.cols, proposed.rows);
          },
          { message: "Failed to size terminal renderer." },
        );
        onResizeRef.current(proposed.cols, proposed.rows);
      }

      scheduleTerminalThemeSync(true);

      if (!cancelled) {
        setReady(true);
        setRevision((value) => value + 1);
      }

      cleanupRef.current = () => {
        container.removeEventListener("focusin", onFocusIn);
        container.removeEventListener("focusout", onFocusOut);
        window.removeEventListener("focus", onWindowFocus);
        dataDisposable.dispose();
        resizeObserver?.disconnect();
        outputScheduler.dispose();
        releaseWebgl();
        terminal.dispose();
      };
    };

    void bootstrap();

    return () => {
      cancelled = true;
      disposeInstance();
    };
  }, [
    args.containerRef,
    args.enabled,
    args.cursorStyle,
    args.fontFamily,
    args.fontSize,
    args.lineHeight,
    args.restartToken,
    disposeInstance,
    emitResize,
    executeTerminalOperation,
    measureProposedDimensions,
    scheduleTerminalThemeSync,
  ]);

  useEffect(() => {
    if (
      !args.enabled ||
      typeof MutationObserver === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }

    const themeStyleIds = new Set([
      "stave-custom-theme",
      "stave-theme-overrides",
    ]);
    const isTrackedThemeNode = (node: Node | null) => {
      if (!node) {
        return false;
      }

      if (node instanceof Element) {
        return (
          themeStyleIds.has(node.id) ||
          themeStyleIds.has(node.parentElement?.id ?? "")
        );
      }

      return themeStyleIds.has(node.parentElement?.id ?? "");
    };

    const observer = new MutationObserver((records) => {
      const shouldSync = records.some((record) => {
        if (record.target === document.documentElement) {
          return true;
        }

        if (isTrackedThemeNode(record.target)) {
          return true;
        }

        return [...record.addedNodes, ...record.removedNodes].some(
          isTrackedThemeNode,
        );
      });

      if (shouldSync) {
        scheduleTerminalThemeSync(true);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(document.head, {
      attributes: true,
      attributeFilter: ["id"],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [args.enabled, scheduleTerminalThemeSync]);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    scheduleTerminalThemeSync(true);
  }, [args.enabled, args.isDarkMode, scheduleTerminalThemeSync]);

  useEffect(() => {
    if (!args.enabled || !args.visible || !ready) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await waitForAnimationFrames(2);
      if (cancelled) {
        return;
      }

      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      const proposed = measureProposedDimensions();
      if (
        proposed &&
        (proposed.cols !== terminal.cols || proposed.rows !== terminal.rows)
      ) {
        // PTY-first: hand the geometry change to the backend. The local
        // renderer resizes through the controller once the PTY acknowledges.
        onResizeRef.current(proposed.cols, proposed.rows);
        return;
      }

      // Geometry unchanged — force a repaint in case the surface was
      // display:none while hidden (xterm may have skipped layout work).
      executeTerminalOperation(
        "refresh-terminal-on-restore",
        () => {
          terminal.refresh(0, Math.max(0, terminal.rows - 1));
        },
        { message: "Failed to refresh terminal viewport." },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    args.enabled,
    args.visible,
    executeTerminalOperation,
    measureProposedDimensions,
    ready,
  ]);

  useEffect(() => {
    if (args.visible) {
      retryWebglRef.current();
      return;
    }
    webglCleanupRef.current();
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.cursorBlink = false;
    }
  }, [args.visible]);

  const controller = useMemo<TerminalInstanceController>(
    () => ({
      get terminal() {
        return terminalRef.current;
      },
      get fitAddon() {
        return fitAddonRef.current;
      },
      clear() {
        const terminal = terminalRef.current;
        const scheduler = outputSchedulerRef.current;
        if (!terminal || !scheduler) {
          return;
        }
        scheduler.replace("", () => terminal.clear());
      },
      restoreScreenState(screenState: string) {
        const terminal = terminalRef.current;
        const scheduler = outputSchedulerRef.current;
        if (!terminal || !scheduler) {
          return;
        }
        scheduler.replace(screenState, () => terminal.reset());
      },
      write(data: string, onParsed?: () => void) {
        if (!data) {
          onParsed?.();
          return;
        }
        const scheduler = outputSchedulerRef.current;
        if (!scheduler || !terminalRef.current) {
          onParsed?.();
          return;
        }
        scheduler.enqueue(data, onParsed);
      },
      writeln(data: string) {
        executeTerminalOperation(
          "write-terminal-line",
          () => {
            const terminal = terminalRef.current;
            if (!terminal) {
              return false;
            }
            terminal.writeln(data);
            return true;
          },
          {
            countWriteError: true,
            countWriteSuccessWhen: Boolean,
            message: "Failed to render terminal output.",
          },
        );
      },
      resize(cols: number, rows: number) {
        executeTerminalOperation(
          "resize-terminal",
          () => {
            terminalRef.current?.resize(cols, rows);
          },
          { message: "Failed to resize terminal renderer." },
        );
      },
      focus,
      proposeDimensions() {
        return measureProposedDimensions();
      },
      getSize() {
        return {
          cols: terminalRef.current?.cols ?? 0,
          rows: terminalRef.current?.rows ?? 0,
        };
      },
      refreshViewport() {
        retryWebglRef.current();
        const terminal = terminalRef.current;
        if (!terminal) {
          return;
        }
        const proposed = measureProposedDimensions();
        if (
          proposed &&
          (proposed.cols !== terminal.cols || proposed.rows !== terminal.rows)
        ) {
          // PTY-first: hand the geometry change to the backend. The local
          // renderer resizes through the controller once the PTY acknowledges.
          onResizeRef.current(proposed.cols, proposed.rows);
          return;
        }
        executeTerminalOperation(
          "refresh-terminal-on-reattach",
          () => {
            terminal.refresh(0, Math.max(0, terminal.rows - 1));
          },
          { message: "Failed to refresh terminal viewport." },
        );
      },
    }),
    [executeTerminalOperation, focus, measureProposedDimensions],
  );

  return {
    controller,
    ready,
    error,
    writeErrorCount,
    revision,
  };
}
