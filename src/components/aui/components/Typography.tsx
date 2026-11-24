import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { resolveNeutralTone } from "../utils/neutral-tone";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  SKELETON_ARRIVE_CLASS,
  SKELETON_CLASS,
  useSkeletonArrival,
  useSkeletonPhaseLock,
} from "./Skeleton.motion";

export type TextTone =
  | "neutral"
  | "muted"
  | "subtle"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "inverted";

export type TextProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "p" | "span" | "h2" | "h3" | "h4";
  /**
   * Swap the copy for a placeholder that reserves exactly one line box, so
   * nothing around the text reflows when the real content arrives. The bar is
   * the line's cap band, inline in a `span`, and as wide as `children` when
   * they are already a string (a known label waiting on its value) — else 60%
   * of a block or 6em inline. The copy fades in over 120ms when it lands.
   */
  loading?: boolean;
  /**
   * `xs` is the caption step (12px): the section-label tier — "Properties",
   * "Status transitions" — set as `size="xs" weight="strong" tone="muted"`,
   * the same caption/semibold/muted the system's own group labels use (Inbox
   * groups, ActivityFeed days). Muted, not subtle: a label names what follows,
   * and subtle is the 3:1 metadata role. Compositions hand-rolled this tier in
   * roughly ten places because `Text` stopped at body size.
   *
   * `sm` is interface text (14px: rows, labels, helper copy); `md` is the
   * 16px lead. There is no `lg`: it was a second name for `md` (the same
   * 16/24) and was removed on 2026-11-16 — write `md`. @default "sm"
   */
  size?: "xs" | "sm" | "md";
  /**
   * Put digits on a fixed advance width. Required for any number that updates
   * in place — timers, live counts, currency in a table column — because
   * proportional digits are per-glyph widths and make the row twitch on every
   * tick.
   */
  tabularNums?: boolean;
  /**
   * How loud the copy is and, for the status inks, what it says.
   *
   * `neutral`, `muted` and `subtle` are the neutral ramp. `success`, `danger`,
   * `warning` and `info` are the status ramp's text roles, for copy that IS the
   * result ("Deployed", "3 checks failed") rather than copy that reports one.
   * `inverted` is for copy on an inverse surface. Every one of these was
   * already a token with no way in through `Text`, so compositions painted
   * them with a local StyleX color. A status tone is never the only signal:
   * pair it with the word, a glyph or a badge that says the same (WCAG 1.4.1).
   * @default "neutral"
   */
  tone?: TextTone;
  /**
   * `true` (or `1`) keeps the text on one line and ends it with an ellipsis; a
   * number above 1 clamps to that many lines.
   */
  truncate?: boolean | number;
  weight?: "regular" | "medium" | "strong";
} & XstyleProp;

export function Text({
  as: Component = "p",
  children,
  className,
  loading = false,
  size = "sm",
  style,
  tabularNums = false,
  tone = "neutral",
  truncate = false,
  weight = "regular",
  xstyle,
  ...props
}: TextProps) {
  // `truncate` and `truncate={1}` describe the same result, so both take the
  // nowrap path: it leaves the element's `display` alone, while clamping has
  // to force `-webkit-box` on it.
  const lines =
    truncate === true
      ? 1
      : typeof truncate === "number"
        ? Math.trunc(truncate)
        : 0;
  const clamped = !loading && lines > 1;
  // The clamp count is per-instance, so it rides in on a custom property that
  // the static rule below reads — a StyleX rule cannot take a runtime value.
  const clampStyle = clamped
    ? ({ "--atelier-text-clamp": lines, ...style } as React.CSSProperties)
    : style;

  const theme = themeProps("text", { size, tone: resolveNeutralTone(tone) });
  useSkeletonPhaseLock(loading);
  const arriving = useSkeletonArrival(loading);
  // A string child is a sample of the copy: render it hidden inside the bar
  // so the bar is exactly as wide as the line will be.
  const sample =
    loading &&
    (typeof children === "string" || typeof children === "number") &&
    String(children).trim() !== "";

  return (
    <Component
      {...props}
      {...theme}
      aria-busy={loading ? true : props["aria-busy"]}
      className={cx(
        sx(
          styles.text,
          textSizeStyles[size],
          textToneStyles[tone],
          textWeightStyles[weight],
          tabularNums && styles.tabularNums,
          !loading && lines === 1 && styles.truncateLine,
          clamped && styles.truncateClamp,
          loading && styles.loading,
          xstyle,
        ),
        theme.className,
        arriving && SKELETON_ARRIVE_CLASS,
        className,
      )}
      style={clampStyle}
    >
      {loading ? (
        // The bar is decoration; the busy state is announced once on the
        // element that owns it, so screen readers hear "busy" instead of an
        // empty node.
        <span
          aria-hidden
          className={cx(
            sx(
              styles.loadingBar,
              sample
                ? styles.loadingBarSample
                : Component === "span"
                  ? styles.loadingBarInline
                  : styles.loadingBarBlock,
            ),
            SKELETON_CLASS,
          )}
          data-skeleton-band=""
        >
          {sample ? (
            <span className={sx(styles.loadingSample)}>{children}</span>
          ) : null}
        </span>
      ) : (
        children
      )}
    </Component>
  );
}

export type HeadingProps = React.HTMLAttributes<HTMLHeadingElement> & {
  /**
   * Render a non-heading element at this level's type: a value set large that
   * is not a title (a plan name, a metric, a phone number). It keeps the
   * level's size and leaves the document outline. Omit it for real headings.
   */
  as?: "div" | "p" | "span";
  /**
   * Opt into the display step, one stop above `level={1}`. It is a visual tier,
   * not a document tier: keep picking `level` for the outline and turn this on
   * only where the heading is the surface — a landing page, a full-screen empty
   * state, a hero title. Product chrome stays on levels 1–4 so dense screens do
   * not read like marketing pages.
   */
  display?: boolean;
  level?: 1 | 2 | 3 | 4;
  /**
   * The same ink as `Text`'s `tone`: a title that steps back (`muted`,
   * `subtle`, e.g. an unavailable card) or one that IS a result (`success`,
   * `danger`). Omitted, the heading keeps its full ink.
   */
  tone?: TextTone;
} & XstyleProp;

const headingTags = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
} as const;

export function Heading({
  as,
  className,
  display = false,
  level = 2,
  tone,
  xstyle,
  ...props
}: HeadingProps) {
  const Component = as ?? headingTags[level];
  const theme = themeProps("heading", {
    size: String(level) as "1" | "2" | "3" | "4",
  });

  return (
    <Component
      {...props}
      {...theme}
      className={cx(
        sx(
          styles.heading,
          headingLevelStyles[level],
          display && styles.headingDisplay,
          tone && textToneStyles[tone],
          xstyle,
        ),
        theme.className,
        className,
      )}
    />
  );
}

export type InlineCodeProps = React.ComponentProps<"code"> & XstyleProp;

export function InlineCode({ className, xstyle, ...props }: InlineCodeProps) {
  const theme = themeProps("inline-code");
  return (
    <code
      {...props}
      {...theme}
      className={cx(sx(styles.inlineCode, xstyle), theme.className, className)}
    />
  );
}

export type ProseProps = React.ComponentProps<"section"> & XstyleProp;

export function Prose({ className, xstyle, ...props }: ProseProps) {
  const theme = themeProps("prose");
  return (
    <section
      // The hook every descendant rule matches on. The caller authors the
      // subtree — a markdown renderer's output, a CMS field, a
      // `contenteditable` — so there is no element to hand a class to, and
      // typing it needs descendant selectors StyleX rejects by design. Two
      // sheets reach it through this attribute: `styles.css` restores the list
      // markers its own `ol, ul` reset strips, and `prose.css` types
      // everything else (headings, links, code, quotes, tables, media). Both
      // sit in `@layer base`, above the reset so a heading's rhythm outranks
      // the blanket `margin: 0`, and below every StyleX layer so an AUI
      // component standing in for an element — a `CodeBlock` for a `<pre>`, a
      // `Table` for a `<table>` — keeps its own styling.
      // Spread last-wins is intentional: a consumer may unset it.
      data-aui-prose=""
      {...props}
      {...theme}
      className={cx(sx(styles.prose, xstyle), theme.className, className)}
    />
  );
}

const styles = stylex.create({
  text: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-sans"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  // The caption rung pairs with the tight line height, as most of the
  // package's own 12px copy already does: at the body's 1.43 a caption line
  // stood ~1px taller than the copy it sits among.
  textXs: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  // `sm` is interface text (14px), `md` the 16px lead. F1 (2026-11-08)
  // returned `md` to the lead step: R0 had moved it to the 14px prose step,
  // which shrank every `size="md"` caller once body text was 14px again.
  textSm: {
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
  },
  textMd: {
    fontSize: vars["--aui-font-size-lead"],
    lineHeight: vars["--aui-line-height-lead"],
  },
  textDefault: {
    color: vars["--aui-color-text"],
  },
  textMuted: {
    color: vars["--aui-color-text-muted"],
  },
  textSubtle: {
    color: vars["--aui-color-text-subtle"],
  },
  textSuccess: {
    color: vars["--aui-color-success-text"],
  },
  textDanger: {
    color: vars["--aui-color-danger-text"],
  },
  textWarning: {
    color: vars["--aui-color-warning-text"],
  },
  textInfo: {
    color: vars["--aui-color-info-text"],
  },
  textInverted: {
    color: vars["--aui-color-text-inverted"],
  },
  textRegular: {
    fontWeight: vars["--aui-font-weight-regular"],
  },
  textMedium: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  textStrong: {
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  tabularNums: {
    fontVariantNumeric: "tabular-nums",
  },
  truncateLine: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  truncateClamp: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: "var(--atelier-text-clamp)",
    display: "-webkit-box",
    overflow: "hidden",
  },
  // The element keeps its own display: a loading `span` stays inline, so the
  // sentence around it no longer breaks around a 20px block.
  loading: {
    minBlockSize: "1lh",
  },
  // Exactly one line box, aligned to its top, so the line it sits in keeps the
  // type's own height; `skeleton-motion.css` paints the 0.72em cap band.
  loadingBar: {
    blockSize: "1lh",
    borderRadius: vars["--aui-radius-mark"],
    display: "inline-block",
    maxInlineSize: "100%",
    overflow: "hidden",
    position: "relative",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  loadingBarBlock: {
    inlineSize: "60%",
  },
  loadingBarInline: {
    inlineSize: "6em",
  },
  loadingBarSample: {
    inlineSize: "auto",
  },
  loadingSample: {
    visibility: "hidden",
  },
  heading: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-sans"],
    fontWeight: vars["--aui-font-weight-semibold"],
    margin: 0,
    overflowWrap: "anywhere",
    textWrap: "balance",
  },
  heading1: {
    fontSize: vars["--aui-font-size-title"],
    lineHeight: vars["--aui-line-height-title"],
  },
  headingDisplay: {
    fontSize: vars["--aui-font-size-display"],
    lineHeight: vars["--aui-line-height-display"],
  },
  // Levels 2-4 keep the base heading weight (600). F1 (2026-11-08) reverted
  // R0's 500 / 15px section step: at 500 the hierarchy read washed out.
  heading2: {
    fontSize: vars["--aui-font-size-heading"],
    lineHeight: vars["--aui-line-height-heading"],
  },
  heading3: {
    fontSize: vars["--aui-font-size-lead"],
    lineHeight: vars["--aui-line-height-lead"],
  },
  // Level 4 is level 3's 16px section step for an h4 outline ("Two heading
  // tiers", 2026-09-24), so it takes 16px's own line box: 24px. It sat on the
  // 20px control box until 2026-11-16, the one HTML heading off the table.
  heading4: {
    fontSize: vars["--aui-font-size-lead"],
    lineHeight: vars["--aui-line-height-lead"],
  },
  inlineCode: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-caption"],
    paddingBlock: 1,
    paddingInline: vars["--aui-space-4"],
  },
  // Prose is reading copy, so it takes the 14px prose step on its 22px line
  // (design direction §5), as `Stream` does — not the 20px interface line it
  // shared with rows and controls until 2026-11-09. The size is stated, not
  // inherited, so a compact-density region (13px interface text) keeps its
  // reading copy at 14px. `prose.css` gives headings, fenced code and bare
  // table cells their own lines, so only running text takes the 22px.
  prose: {
    color: vars["--aui-color-text"],
    display: "grid",
    fontSize: vars["--aui-font-size-prose"],
    gap: vars["--aui-space-12"],
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-prose"],
    maxInlineSize: 680,
    minInlineSize: 0,
  },
});

const textSizeStyles = {
  md: styles.textMd,
  sm: styles.textSm,
  xs: styles.textXs,
} as const;

const textToneStyles = {
  danger: styles.textDanger,
  info: styles.textInfo,
  inverted: styles.textInverted,
  muted: styles.textMuted,
  neutral: styles.textDefault,
  subtle: styles.textSubtle,
  success: styles.textSuccess,
  warning: styles.textWarning,
} satisfies Record<TextTone, unknown>;

const textWeightStyles = {
  medium: styles.textMedium,
  regular: styles.textRegular,
  strong: styles.textStrong,
} as const;

const headingLevelStyles = {
  1: styles.heading1,
  2: styles.heading2,
  3: styles.heading3,
  4: styles.heading4,
} as const;
