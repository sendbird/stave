import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { Maximize2, Minimize2 } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { overlaySurface } from "@/components/ads/recipes/overlay-surface";
import { sx } from "@/components/ads/utils/stylex";
import { toast } from "@/components/ui";
import {
  clampInlineRenderHeight,
  INLINE_RENDER_DEFAULT_HEIGHT,
  INLINE_RENDER_FRAME_SANDBOX,
  INLINE_RENDER_MAX_HEIGHT,
  type InlineRenderTheme,
} from "@/lib/inline-render/inline-render";
import type { McpAppViewDescription } from "@/lib/mcp-app/mcp-app-bridge";
import { buildMcpAppFrameAllow, buildMcpAppSrcdoc } from "@/lib/mcp-app/mcp-app-csp";
import {
  buildMcpAppHostContext,
  buildMcpAppStyleVariables,
} from "@/lib/mcp-app/mcp-app-host-context";
import {
  createMcpAppHostSession,
  type McpAppHostSession,
} from "@/lib/mcp-app/mcp-app-host-protocol";
import { setMcpAppModelContext } from "@/lib/mcp-app/mcp-app-model-context";
import {
  buildMcpAppViewUrl,
  type McpAppDisplayMode,
  type McpAppViewReference,
} from "@/lib/mcp-app/mcp-app-view";
import { useAppStore } from "@/store/app.store";
import { inlineHtmlRenderStyles as styles } from "./inline-html-render.styles";
import { useInlineRenderTheme } from "./inline-render-theme";
import { McpAppViewConfirm, type McpAppConfirmRequest } from "./mcp-app-view-confirm";

const dynamic = stylex.create({
  frameHeight: (height: number) => ({ blockSize: `${height}px` }),
  colorScheme: (scheme: "light" | "dark") => ({ colorScheme: scheme }),
  slotHeld: (height: number) => ({ minBlockSize: `${height}px` }),
});

type Availability = "checking" | "ready" | "missing" | "unavailable";

/** A view the frame host can show: by URL from the desktop app, or as srcdoc in the browser preview. */
function canShow(view: McpAppViewDescription, hasScheme: boolean) {
  return hasScheme || typeof view.html === "string";
}

/**
 * One MCP App view in its tool row. The view is third-party HTML the runtime
 * captured when the call completed; it is served from the inline render
 * scheme under the CSP its resource declared, in a frame without
 * `allow-same-origin`. This component is the host end of the view's
 * JSON-RPC conversation (`mcp-app-host-protocol.ts`): it sizes the frame,
 * keeps the view's theme current, relays requests to the view's own server,
 * and asks the reader before the view sends a message or runs a tool that is
 * not read-only.
 */
export const McpAppView = memo(function McpAppView(props: {
  reference: McpAppViewReference;
  taskId: string;
  toolUseId?: string;
}) {
  useTranslation();
  const { reference, taskId, toolUseId } = props;
  const bridge = typeof window === "undefined" ? undefined : window.api?.mcpApp;
  // The desktop preload serves the render scheme; the browser preview does not.
  const hasScheme = typeof window !== "undefined" && Boolean(window.api?.inlineRender);
  const [view, setView] = useState<McpAppViewDescription | null>(null);
  const [availability, setAvailability] = useState<Availability>(
    bridge ? "checking" : "unavailable",
  );
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge
      .describe({ viewId: reference.viewId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.exists && canShow(result.view, hasScheme)) {
          setView(result.view);
          setAvailability("ready");
        } else {
          setAvailability(result.ok && !result.exists ? "missing" : "unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setAvailability("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, hasScheme, reference.viewId]);

  const theme = useInlineRenderTheme();
  const themeRef = useRef<InlineRenderTheme>(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);
  const [displayMode, setDisplayMode] = useState<McpAppDisplayMode>("inline");
  const displayModeRef = useRef<McpAppDisplayMode>("inline");
  const [height, setHeight] = useState(INLINE_RENDER_DEFAULT_HEIGHT);

  // One question at a time: a view that asks again while the reader is still
  // deciding is refused rather than stacking prompts.
  const [confirmRequest, setConfirmRequest] = useState<McpAppConfirmRequest | null>(null);
  const confirmResolveRef = useRef<((allowed: boolean) => void) | null>(null);
  const askReader = useCallback((request: McpAppConfirmRequest) => {
    if (confirmResolveRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmRequest(request);
    });
  }, []);
  const resolveConfirm = useCallback((allowed: boolean) => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmRequest(null);
    resolve?.(allowed);
  }, []);
  useEffect(() => () => confirmResolveRef.current?.(false), []);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<McpAppHostSession | null>(null);

  // One host session per frame document. It is created before the view's
  // scripts can run, so the view's `ui/initialize` is never missed.
  useLayoutEffect(() => {
    if (availability !== "ready" || !view || !bridge) return;
    const frame = frameRef.current;
    if (!frame) return;
    const session = createMcpAppHostSession({
      capabilities: view.capabilities,
      csp: view.csp,
      permissions: view.permissions,
      toolInput: view.toolInput,
      toolResult: view.toolResult,
      appTools: view.appTools,
      hostContext: () =>
        buildMcpAppHostContext({
          theme: themeRef.current,
          displayMode: displayModeRef.current,
          maxHeight:
            displayModeRef.current === "fullscreen" ? window.innerHeight : INLINE_RENDER_MAX_HEIGHT,
          width: frame.clientWidth,
          locale: i18n.language,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          platform: hasScheme ? "desktop" : "web",
          tool: { name: view.tool, callId: toolUseId },
        }),
      post: (message) => frame.contentWindow?.postMessage(message, "*"),
      handlers: {
        openLink: (url) => {
          // A view may only open a link the reader just clicked in this frame.
          const activation = navigator.userActivation;
          if (document.activeElement !== frame || (activation && !activation.isActive)) {
            return false;
          }
          const openExternal = window.api?.shell?.openExternal;
          if (openExternal) {
            void openExternal({ url });
          } else {
            window.open(url, "_blank", "noopener,noreferrer");
          }
          return true;
        },
        requestDisplayMode: (mode) => {
          displayModeRef.current = mode;
          setDisplayMode(mode);
          return mode;
        },
        sendMessage: async (text) => {
          if (!(await askReader({ kind: "message", server: view.server, text }))) return false;
          const result = await useAppStore.getState().sendUserMessage({
            taskId,
            content: text,
            // Never steered into a running turn: it waits its turn like any queued message.
            submitIntent: "queue",
            preservePromptDraft: true,
            turnOrigin: "conversation",
          });
          const sent = result.status === "queued" || result.status === "started" || result.status === "run-started";
          if (!sent) toast.error(i18n.t("session:mcpAppView.messageFailed"));
          return sent;
        },
        updateModelContext: (text) =>
          setMcpAppModelContext({
            taskId,
            viewId: reference.viewId,
            server: view.server,
            tool: view.tool,
            text,
          }),
        confirmToolCall: ({ tool, arguments: args }) =>
          askReader({ kind: "tool", server: view.server, tool: tool.title ?? tool.name, arguments: args }),
        callTool: async ({ name, arguments: args }) => {
          const response = await bridge.request({
            viewId: reference.viewId,
            method: "tools/call",
            params: { name, arguments: args },
          });
          if (!response.ok) throw new Error(response.error);
          return response.result;
        },
        readResource: async (uri) => {
          const response = await bridge.request({
            viewId: reference.viewId,
            method: "resources/read",
            params: { uri },
          });
          if (!response.ok) throw new Error(response.error);
          return response.result;
        },
        sizeChanged: ({ height: next }) => setHeight(clampInlineRenderHeight(next)),
      },
    });
    sessionRef.current = session;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      session.receive(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      void session.teardown("The view was closed.");
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [askReader, availability, bridge, hasScheme, reference.viewId, taskId, toolUseId, view]);

  useEffect(() => {
    sessionRef.current?.updateHostContext({
      theme: theme.appearance === "dark" ? "dark" : "light",
      styles: { variables: buildMcpAppStyleVariables(theme) },
    });
  }, [theme]);

  const slotRef = useRef<HTMLDivElement>(null);
  const [heldHeight, setHeldHeight] = useState(0);
  const fullscreen = displayMode === "fullscreen";
  const changeDisplayMode = useCallback((mode: McpAppDisplayMode) => {
    if (mode === displayModeRef.current) return;
    if (mode === "fullscreen") setHeldHeight(slotRef.current?.getBoundingClientRect().height ?? 0);
    displayModeRef.current = mode;
    setDisplayMode(mode);
    sessionRef.current?.updateHostContext({ displayMode: mode });
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") changeDisplayMode("inline");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [changeDisplayMode, fullscreen]);

  const frameSrc = useMemo(
    () => (hasScheme ? buildMcpAppViewUrl(reference.viewId) : undefined),
    [hasScheme, reference.viewId],
  );
  const frameSrcDoc = useMemo(
    () => (!hasScheme && view?.html ? buildMcpAppSrcdoc(view.html, view.csp) : undefined),
    [hasScheme, view],
  );
  const title = i18n.t("session:mcpAppView.title", { tool: reference.tool, server: reference.server });
  const toggleLabel = fullscreen
    ? i18n.t("session:mcpAppView.exitFullscreen")
    : i18n.t("session:mcpAppView.fullscreen");

  return (
    <div ref={slotRef} {...stylex.props(styles.slot, fullscreen && dynamic.slotHeld(heldHeight))}>
      {fullscreen ? (
        <div
          aria-hidden
          className={sx(overlaySurface.backdrop)}
          onClick={() => changeDisplayMode("inline")}
        />
      ) : null}
      <figure
        className={sx(styles.figure, fullscreen && styles.figureExpanded)}
        aria-label={title}
        data-mcp-app-view={reference.viewId}
      >
        <figcaption className={sx(styles.header)}>
          <span className={sx(styles.title)} title={title}>
            {title}
          </span>
          <span className={sx(styles.actions)}>
            <Tooltip content={toggleLabel}>
              <Button
                aria-label={toggleLabel}
                aria-pressed={fullscreen}
                iconOnly
                size="xs"
                type="button"
                variant="quiet"
                onClick={() => changeDisplayMode(fullscreen ? "inline" : "fullscreen")}
              >
                {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </Button>
            </Tooltip>
          </span>
        </figcaption>
        {availability === "ready" && view ? (
          <iframe
            ref={frameRef}
            title={title}
            src={frameSrc}
            srcDoc={frameSrcDoc}
            sandbox={INLINE_RENDER_FRAME_SANDBOX}
            referrerPolicy="no-referrer"
            allow={buildMcpAppFrameAllow(view.permissions)}
            {...stylex.props(
              styles.frame,
              fullscreen ? styles.frameExpanded : dynamic.frameHeight(height),
              dynamic.colorScheme(theme.appearance),
            )}
          />
        ) : (
          <p className={sx(styles.notice)}>
            {availability === "checking"
              ? i18n.t("session:mcpAppView.loading")
              : availability === "missing"
                ? i18n.t("session:mcpAppView.missing")
                : i18n.t("session:mcpAppView.unavailable")}
          </p>
        )}
      </figure>
      <McpAppViewConfirm request={confirmRequest} onResolve={resolveConfirm} />
    </div>
  );
}, (previous, next) =>
  previous.reference.viewId === next.reference.viewId &&
  previous.taskId === next.taskId &&
  previous.toolUseId === next.toolUseId,
);
