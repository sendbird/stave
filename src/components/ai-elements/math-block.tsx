import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { LruCache } from "./message-markdown-blocks";

type Katex = (typeof import("katex"))["default"];

let katexModule: Promise<Katex> | null = null;
let loadedKatex: Katex | null = null;

/**
 * KaTeX and its stylesheet (with fonts) load the first time a reply shows
 * math, so a session without formulas never pays for them.
 */
function loadKatex() {
  katexModule ??= Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
  ]).then(([module]) => {
    loadedKatex = module.default;
    return module.default;
  });
  return katexModule;
}

// Typeset formulas by mode and TeX, shared by every message.
const typesetCache = new LruCache<string, string>(500);

function typeset(katex: Katex, tex: string, display: boolean): string {
  const key = `${display ? "D" : "I"}\u0000${tex}`;
  const cached = typesetCache.get(key);
  if (cached !== undefined) return cached;
  const html = katex.renderToString(tex, {
    displayMode: display,
    // A formula KaTeX cannot read shows its source in the error color
    // instead of throwing.
    throwOnError: false,
    errorColor: vars["--aui-color-danger-text"],
    // No \href, \url, \htmlClass or \htmlStyle: TeX in a reply cannot add
    // links, classes or styles to the page.
    trust: false,
    strict: "ignore",
    maxExpand: 1000,
    output: "htmlAndMathml",
  });
  typesetCache.set(key, html);
  return html;
}

type TypesetState = { status: "loading" } | { status: "ready"; html: string } | { status: "failed" };

function useTypeset(tex: string, display: boolean): TypesetState {
  const [loaded, setLoaded] = useState<"pending" | "ready" | "failed">(
    loadedKatex ? "ready" : "pending",
  );
  useEffect(() => {
    if (loaded !== "pending") return;
    let alive = true;
    loadKatex().then(
      () => {
        if (alive) setLoaded("ready");
      },
      () => {
        if (alive) setLoaded("failed");
      },
    );
    return () => {
      alive = false;
    };
  }, [loaded]);
  return useMemo(() => {
    if (loaded === "failed") return { status: "failed" };
    if (loaded === "pending" || !loadedKatex) return { status: "loading" };
    try {
      return { status: "ready", html: typeset(loadedKatex, tex, display) };
    } catch {
      return { status: "failed" };
    }
  }, [display, loaded, tex]);
}

/** `$…$` in a line of a reply. Until KaTeX loads, the TeX shows as written. */
export function MathInline({ tex }: { tex: string }) {
  useTranslation();
  const result = useTypeset(tex, false);
  if (result.status !== "ready") {
    return <span className={sx(styles.inlineSource)}>{`$${tex}$`}</span>;
  }
  return (
    <span
      className={sx(styles.inline)}
      data-math="inline"
      // KaTeX markup generated from the TeX with `trust: false`.
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

/**
 * A `$$` block or a ```math fence, typeset as a centred formula that scrolls
 * sideways when it is wider than the column. The source is one click away.
 */
export function MathBlock({ tex, source }: { tex: string; source: ReactNode }) {
  useTranslation();
  const [showSource, setShowSource] = useState(false);
  const result = useTypeset(tex, true);

  if (result.status === "failed") {
    return (
      <div className={sx(styles.stack)}>
        {source}
        <p className={sx(styles.note)}>{i18n.t("composer:richBlock.mathFailed")}</p>
      </div>
    );
  }
  return (
    <div className={sx(styles.stack)}>
      {showSource ? (
        source
      ) : (
        <figure className={sx(styles.frame)} data-math="display">
          {result.status === "ready" ? (
            <div
              className={sx(styles.display)}
              // KaTeX markup generated from the TeX with `trust: false`.
              dangerouslySetInnerHTML={{ __html: result.html }}
            />
          ) : (
            <pre className={sx(styles.displaySource)}>{tex}</pre>
          )}
        </figure>
      )}
      <div className={sx(styles.toolbar)}>
        <Button size="xs" type="button" variant="quiet" onClick={() => setShowSource((value) => !value)}>
          {showSource ? i18n.t("composer:richBlock.showFormula") : i18n.t("composer:richBlock.showCode")}
        </Button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  inline: {
    // KaTeX sets its own size relative to the line; keep it on the text line.
    whiteSpace: "nowrap",
  },
  inlineSource: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: "0.9em",
    color: vars["--aui-color-text-muted"],
  },
  stack: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
    marginBottom: { default: vars["--aui-space-12"], ":last-child": 0 },
  },
  frame: {
    margin: 0,
    minInlineSize: 0,
    overflowX: "auto",
    overflowY: "hidden",
  },
  display: {
    minInlineSize: "min-content",
  },
  displaySource: {
    margin: 0,
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text-muted"],
    textAlign: "center",
    whiteSpace: "pre-wrap",
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
});
