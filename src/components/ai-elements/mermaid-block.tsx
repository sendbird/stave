import { useEffect, useId, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { sanitizeMermaidSvg } from "./mermaid-sanitize";

type DiagramState =
  | { status: "drawing" }
  | { status: "ready"; svg: string }
  | { status: "failed" };

let mermaidModule: Promise<typeof import("mermaid")["default"]> | null = null;

/** Mermaid is large, so it loads the first time a diagram is drawn. */
function loadMermaid() {
  mermaidModule ??= import("mermaid").then((module) => module.default);
  return mermaidModule;
}

/** The theme actually applied: custom themes and previews set the root class. */
function isDarkDocument(fallback: boolean) {
  return typeof document === "undefined"
    ? fallback
    : document.documentElement.classList.contains("dark");
}

async function drawDiagram(args: { id: string; code: string; dark: boolean }): Promise<string | null> {
  const mermaid = await loadMermaid();
  const fontFamily =
    typeof document === "undefined"
      ? undefined
      : getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || undefined;
  mermaid.initialize({
    startOnLoad: false,
    // `strict` encodes label text and disables click handlers and links.
    securityLevel: "strict",
    theme: args.dark ? "dark" : "default",
    // SVG text labels instead of HTML in foreignObject, so nothing in a
    // diagram is parsed as markup.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    ...(fontFamily ? { fontFamily } : {}),
  });
  if (!(await mermaid.parse(args.code, { suppressErrors: true }))) return null;
  const { svg } = await mermaid.render(args.id, args.code);
  return sanitizeMermaidSvg(svg);
}

/**
 * A ```mermaid block drawn as a diagram once the reply has finished
 * streaming; half a diagram is a parse error, not a picture. The source is one
 * click away, and a diagram that cannot be drawn falls back to it.
 */
export function MermaidBlock(props: { code: string; isStreaming: boolean; source: ReactNode }) {
  useTranslation();
  // The store flag only triggers a redraw; the root class decides the theme.
  const darkModeSetting = useAppStore((state) => state.isDarkMode);
  const id = `stave-mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [showSource, setShowSource] = useState(false);
  const [diagram, setDiagram] = useState<DiagramState>({ status: "drawing" });

  useEffect(() => {
    if (props.isStreaming) return;
    let cancelled = false;
    setDiagram({ status: "drawing" });
    drawDiagram({ id, code: props.code, dark: isDarkDocument(darkModeSetting) })
      .then((svg) => {
        if (!cancelled) setDiagram(svg ? { status: "ready", svg } : { status: "failed" });
      })
      .catch(() => {
        if (!cancelled) setDiagram({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [darkModeSetting, id, props.code, props.isStreaming]);

  if (props.isStreaming) return <>{props.source}</>;
  if (diagram.status === "failed") {
    return (
      <div className={sx(styles.stack)}>
        {props.source}
        <p className={sx(styles.note)}>{i18n.t("composer:mermaid.failed")}</p>
      </div>
    );
  }

  return (
    <div className={sx(styles.stack)}>
      {showSource ? (
        props.source
      ) : (
        <figure className={sx(styles.frame)} data-testid="mermaid-diagram">
          {diagram.status === "ready" ? (
            // Sanitized SVG from a strict-mode render; see `drawDiagram`.
            <div className={sx(styles.canvas)} dangerouslySetInnerHTML={{ __html: diagram.svg }} />
          ) : (
            <p className={sx(styles.note)}>{i18n.t("composer:mermaid.drawing")}</p>
          )}
        </figure>
      )}
      <div className={sx(styles.toolbar)}>
        <Button size="xs" type="button" variant="quiet" onClick={() => setShowSource((value) => !value)}>
          {showSource ? i18n.t("composer:mermaid.showDiagram") : i18n.t("composer:mermaid.showCode")}
        </Button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  stack: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  frame: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    margin: 0,
    minInlineSize: 0,
    overflowX: "auto",
    padding: vars["--ads-space-12"],
  },
  canvas: {
    display: "flex",
    justifyContent: "center",
    minInlineSize: "min-content",
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
  },
  note: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
  },
});
