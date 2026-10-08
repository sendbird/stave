import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Check, Code2, Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { overlaySurface } from "@/components/ads/recipes/overlay-surface";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { toast } from "@/components/ui";
import {
  buildInlineRenderHostContextMessage,
  buildInlineRenderSrcdoc,
  buildInlineRenderThemeFragment,
  buildInlineRenderUrl,
  clampInlineRenderHeight,
  INLINE_RENDER_FRAME_SANDBOX,
  normalizeInlineRenderNetworkPolicy,
  parseInlineRenderFrameMessage,
  readInlineRenderInputHtml,
  type InlineRenderReference,
} from "@/lib/inline-render/inline-render";
import { useAppStore } from "@/store/app.store";
import { inlineHtmlRenderStyles as styles } from "./inline-html-render.styles";
import { useInlineRenderTheme } from "./inline-render-theme";

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
 * and runs in a sandboxed frame; this component only sizes it, keeps its
 * theme current, and answers the two requests a page may make: report its
 * height, and open a link after the reader clicked one.
 *
 * Without the desktop bridge (the browser-only preview) the page is built
 * from the tool call's input instead, with the same bootstrap and a `<meta>`
 * CSP.
 */
export const InlineHtmlRender = memo(function InlineHtmlRender(props: {
  reference: InlineRenderReference;
  toolInput?: string;
}) {
  useTranslation();
  const { reference } = props;
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

  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(reference.height);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const message = parseInlineRenderFrameMessage(event.data);
      if (!message) return;
      if (message.kind === "size") {
        setHeight(clampInlineRenderHeight(message.height));
        return;
      }
      // A page may only open a link the reader just clicked in this frame.
      const activation = navigator.userActivation;
      if (document.activeElement !== frame || (activation && !activation.isActive)) return;
      const openExternal = window.api?.shell?.openExternal;
      if (openExternal) {
        void openExternal({ url: message.url });
      } else {
        window.open(message.url, "_blank", "noopener,noreferrer");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const postTheme = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      buildInlineRenderHostContextMessage(themeRef.current),
      "*",
    );
  }, []);
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(buildInlineRenderHostContextMessage(theme), "*");
  }, [theme]);

  const slotRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [heldHeight, setHeldHeight] = useState(0);
  const toggleExpanded = useCallback(() => {
    setExpanded((value) => {
      if (!value) setHeldHeight(slotRef.current?.getBoundingClientRect().height ?? 0);
      return !value;
    });
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

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

  return (
    <div
      ref={slotRef}
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
        {availability === "ready" ? (
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
        ) : (
          <p className={sx(styles.notice)}>
            {availability === "checking"
              ? i18n.t("session:inlineRender.loading")
              : availability === "missing"
                ? i18n.t("session:inlineRender.missing")
                : i18n.t("session:inlineRender.unavailable")}
          </p>
        )}
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
    </div>
  );
}, (previous, next) =>
  previous.reference.renderId === next.reference.renderId &&
  previous.reference.title === next.reference.title &&
  previous.reference.height === next.reference.height &&
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
  xstyle?: StyleXValue;
}) {
  return (
    <div className={sx(listStyles.list, props.xstyle)}>
      {props.renders.map((render) => (
        <InlineHtmlRender
          key={render.key}
          reference={render.reference}
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
