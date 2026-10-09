import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { Check, Code2, Copy, Download, Maximize2, Minimize2, X } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { overlaySurface } from "@/components/ads/recipes/overlay-surface";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { useConversationFrameHost } from "@/components/ai-elements/conversation";
import { toast } from "@/components/ui";
import {
  buildInlineRenderHostContextMessage,
  buildInlineRenderSrcdoc,
  buildInlineRenderThemeFragment,
  buildInlineRenderUrl,
  INLINE_RENDER_FRAME_SANDBOX,
  normalizeInlineRenderNetworkPolicy,
  readInlineRenderInputHtml,
  type InlineRenderReference,
} from "@/lib/inline-render/inline-render";
import { inlineRenderViewMemory } from "@/lib/inline-render/inline-render-frame-pool";
import { useAppStore } from "@/store/app.store";
import { inlineRenderContextRuntime } from "@/store/inline-render-context-runtime";
import { inlineHtmlRenderStyles as styles } from "./inline-html-render.styles";
import { InlineRenderMessageConfirmDialog } from "./inline-render-message-confirm";
import { useInlineRenderTheme } from "./inline-render-theme";
import { useInlineRenderFrameBridge, useInlineRenderFrameSlot } from "./use-inline-render-frame";

const COPIED_MS = 1_500;

const dynamic = stylex.create({
  frameHeight: (height: number) => ({ blockSize: `${height}px` }),
  colorScheme: (scheme: "light" | "dark") => ({ colorScheme: scheme }),
  slotHeld: (height: number) => ({ minBlockSize: `${height}px` }),
});

type Availability = "checking" | "ready" | "missing" | "unavailable";

/**
 * One page an agent published with `stave_render_html`, shown in the
 * conversation. The page is served by the main process from its own scheme
 * and runs in a sandboxed frame; this component sizes it, keeps its theme
 * current, and answers what a page may ask (`useInlineRenderFrameBridge`):
 * report its height, open a link the reader clicked, send a message the
 * reader confirms, and report state for the agent's next turn.
 *
 * The frame is mounted only near the viewport and within the window's live
 * frame cap (`useInlineRenderFrameSlot`); otherwise the block keeps the
 * page's last height with no frame in it.
 *
 * Without the desktop bridge (the browser-only preview) the page is built
 * from the tool call's input instead, with the same bootstrap and a `<meta>`
 * CSP.
 */
export const InlineHtmlRender = memo(function InlineHtmlRender(props: {
  reference: InlineRenderReference;
  taskId: string;
  toolInput?: string;
}) {
  useTranslation();
  const { reference, taskId } = props;
  const bridge = typeof window === "undefined" ? undefined : window.api?.inlineRender;
  const networkPolicy = useAppStore((state) =>
    normalizeInlineRenderNetworkPolicy(state.settings.inlineRenderNetworkPolicy),
  );
  const theme = useInlineRenderTheme();
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const fallbackHtml = useMemo(
    () => (bridge ? null : readInlineRenderInputHtml(props.toolInput)),
    [bridge, props.toolInput],
  );
  const [availability, setAvailability] = useState<Availability>(() =>
    bridge ? "checking" : fallbackHtml ? "ready" : "unavailable",
  );
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge
      .describe({ renderId: reference.renderId })
      .then((result) => {
        if (!cancelled) setAvailability(result.ok && result.exists ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setAvailability("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, reference.renderId]);

  // The URL is built once per page and policy: a new theme travels as a
  // message, so a theme change never reloads the page and loses its state.
  const frameSrc = useMemo(
    () =>
      bridge
        ? `${buildInlineRenderUrl({ renderId: reference.renderId, networkPolicy })}${buildInlineRenderThemeFragment(themeRef.current)}`
        : undefined,
    [bridge, reference.renderId, networkPolicy],
  );
  const frameSrcDoc = useMemo(
    () => (!bridge && fallbackHtml ? buildInlineRenderSrcdoc(fallbackHtml, networkPolicy) : undefined),
    [bridge, fallbackHtml, networkPolicy],
  );

  // Height and expansion outlive the block, so a remounted block keeps its
  // place instead of jumping back to the height the agent first guessed.
  const [height, setHeight] = useState(
    () => inlineRenderViewMemory.get(reference.renderId).height ?? reference.height,
  );
  const [expanded, setExpandedState] = useState(
    () => inlineRenderViewMemory.get(reference.renderId).expanded === true,
  );
  const [heldHeight, setHeldHeight] = useState(0);
  const slotRef = useRef<HTMLDivElement>(null);
  const setExpanded = useCallback(
    (next: boolean) => {
      if (next) setHeldHeight(slotRef.current?.getBoundingClientRect().height ?? 0);
      inlineRenderViewMemory.set(reference.renderId, { expanded: next });
      setExpandedState(next);
    },
    [reference.renderId],
  );
  const toggleExpanded = useCallback(() => setExpanded(!expanded), [expanded, setExpanded]);
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, setExpanded]);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameHost = useConversationFrameHost();
  const onSize = useCallback(
    (next: number) => {
      inlineRenderViewMemory.set(reference.renderId, { height: next });
      setHeight(next);
    },
    [reference.renderId],
  );
  const touchRef = useRef<() => void>(() => {});
  const onUse = useCallback(() => touchRef.current(), []);
  const { messageRequest, confirmMessage, declineMessage } = useInlineRenderFrameBridge({
    frameRef,
    renderId: reference.renderId,
    taskId,
    title: reference.title,
    onSize,
    onScrollIntent: frameHost?.markUserScrollIntent,
    onUse,
  });
  // A frame waiting on the reader's answer stays live, so the answer reaches
  // the page that asked.
  const slot = useInlineRenderFrameSlot({
    slotRef,
    scrollContainer: frameHost?.scrollContainer ?? null,
    pinned: expanded || messageRequest !== null,
  });
  useEffect(() => {
    touchRef.current = slot.touch;
  }, [slot.touch]);

  const postTheme = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      buildInlineRenderHostContextMessage(themeRef.current),
      "*",
    );
  }, []);
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(buildInlineRenderHostContextMessage(theme), "*");
  }, [theme]);

  const modelContext = useSyncExternalStore(
    useCallback(
      (listener: () => void) => inlineRenderContextRuntime.subscribe(reference.renderId, listener),
      [reference.renderId],
    ),
    () => inlineRenderContextRuntime.getSnapshot(reference.renderId),
    () => undefined,
  );
  useEffect(() => {
    void inlineRenderContextRuntime.load({ renderId: reference.renderId, taskId });
  }, [reference.renderId, taskId]);
  const clearModelContext = useCallback(
    () => inlineRenderContextRuntime.clear({ renderId: reference.renderId, taskId }),
    [reference.renderId, taskId],
  );

  const [sourceOpen, setSourceOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const toggleSource = useCallback(() => {
    setSourceOpen((open) => !open);
    if (source !== null) return;
    if (!bridge) {
      setSource(fallbackHtml ?? "");
      return;
    }
    void bridge.readSource({ renderId: reference.renderId }).then((result) => {
      if (result.ok) {
        setSource(result.html);
      } else {
        setSource("");
        toast.error(i18n.t("session:inlineRender.sourceUnavailable"));
      }
    });
  }, [bridge, fallbackHtml, reference.renderId, source]);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  const copySource = useCallback(() => {
    if (!source) return;
    void navigator.clipboard?.writeText(source).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [source]);

  const save = useCallback(() => {
    if (!bridge) return;
    void bridge.saveAs({ renderId: reference.renderId }).then((result) => {
      if (result.ok) {
        toast.success(i18n.t("session:inlineRender.saved", { path: result.filePath }));
      } else if (!("canceled" in result)) {
        toast.error(i18n.t("session:inlineRender.saveFailed"));
      }
    });
  }, [bridge, reference.renderId]);

  const sourceLabel = sourceOpen
    ? i18n.t("session:inlineRender.hideSource")
    : i18n.t("session:inlineRender.viewSource");
  const expandLabel = expanded
    ? i18n.t("session:inlineRender.collapse")
    : i18n.t("session:inlineRender.expand");

  let body: ReactNode;
  if (availability !== "ready") {
    body = (
      <p className={sx(styles.notice)}>
        {availability === "checking"
          ? i18n.t("session:inlineRender.loading")
          : availability === "missing"
            ? i18n.t("session:inlineRender.missing")
            : i18n.t("session:inlineRender.unavailable")}
      </p>
    );
  } else if (slot.live) {
    body = (
      <iframe
        key={networkPolicy}
        ref={frameRef}
        title={reference.title}
        src={frameSrc}
        srcDoc={frameSrcDoc}
        sandbox={INLINE_RENDER_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        allow=""
        loading="lazy"
        onLoad={postTheme}
        {...stylex.props(
          styles.frame,
          expanded ? styles.frameExpanded : dynamic.frameHeight(height),
          dynamic.colorScheme(theme.appearance),
        )}
      />
    );
  } else {
    // Unmounted to save memory: the block keeps the page's height, and a
    // page held back only by the live cap can be brought back.
    body = (
      <div
        data-inline-render-paused=""
        {...stylex.props(styles.paused, dynamic.frameHeight(height))}
      >
        {slot.waiting ? (
          <>
            <span>{i18n.t("session:inlineRender.paused")}</span>
            <Button size="xs" type="button" variant="quiet" onClick={slot.touch}>
              {i18n.t("session:inlineRender.resume")}
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={slotRef}
      onPointerDown={slot.touch}
      {...stylex.props(styles.slot, expanded && dynamic.slotHeld(heldHeight))}
    >
      {expanded ? (
        <div
          aria-hidden
          className={sx(overlaySurface.backdrop)}
          onClick={() => setExpanded(false)}
        />
      ) : null}
      <figure
        className={sx(styles.figure, expanded && styles.figureExpanded)}
        aria-label={reference.title}
      >
        <figcaption className={sx(styles.header)}>
          <span className={sx(styles.title)} title={reference.title}>
            {reference.title}
          </span>
          <span className={sx(styles.actions)}>
            {modelContext ? (
              <Tooltip content={i18n.t("session:inlineRender.contextSharedHint")}>
                <Button
                  aria-label={i18n.t("session:inlineRender.clearContext")}
                  size="xs"
                  type="button"
                  variant="quiet"
                  onClick={clearModelContext}
                >
                  {i18n.t("session:inlineRender.contextShared")}
                  <X aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
            <IconAction label={sourceLabel} pressed={sourceOpen} onClick={toggleSource}>
              <Code2 aria-hidden />
            </IconAction>
            {bridge ? (
              <IconAction label={i18n.t("session:inlineRender.save")} onClick={save}>
                <Download aria-hidden />
              </IconAction>
            ) : null}
            <IconAction label={expandLabel} pressed={expanded} onClick={toggleExpanded}>
              {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </IconAction>
          </span>
        </figcaption>
        {body}
        {sourceOpen ? (
          <div className={sx(styles.source, expanded && styles.sourceExpanded)}>
            <pre className={sx(styles.sourceText)}>
              {source ?? i18n.t("session:inlineRender.loading")}
            </pre>
            <Button
              size="xs"
              type="button"
              variant="quiet"
              disabled={!source}
              onClick={copySource}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? i18n.t("session:inlineRender.copied") : i18n.t("session:inlineRender.copy")}
            </Button>
          </div>
        ) : null}
      </figure>
      <InlineRenderMessageConfirmDialog
        request={messageRequest}
        onConfirm={confirmMessage}
        onDecline={declineMessage}
      />
    </div>
  );
}, (previous, next) =>
  previous.reference.renderId === next.reference.renderId &&
  previous.reference.title === next.reference.title &&
  previous.reference.height === next.reference.height &&
  previous.taskId === next.taskId &&
  previous.toolInput === next.toolInput,
);

function IconAction(props: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={props.label}>
      <Button
        aria-label={props.label}
        aria-pressed={props.pressed}
        iconOnly
        size="xs"
        type="button"
        variant="quiet"
        onClick={props.onClick}
      >
        {props.children}
      </Button>
    </Tooltip>
  );
}

/** Every page a turn published, in call order, outside the collapsible trace. */
export function InlineHtmlRenderList(props: {
  renders: ReadonlyArray<{ key: string; reference: InlineRenderReference; toolInput?: string }>;
  taskId: string;
  xstyle?: StyleXValue;
}) {
  return (
    <div className={sx(listStyles.list, props.xstyle)}>
      {props.renders.map((render) => (
        <InlineHtmlRender
          key={render.key}
          reference={render.reference}
          taskId={props.taskId}
          toolInput={render.toolInput}
        />
      ))}
    </div>
  );
}

const listStyles = stylex.create({
  list: {
    display: "grid",
    gap: vars["--ads-space-12"],
    minInlineSize: 0,
  },
});
