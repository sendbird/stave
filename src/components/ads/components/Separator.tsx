import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { SeparatorRoot, type SeparatorRootProps } from "../headless/separator";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

/**
 * Line treatment. `solid` is the hairline §1.3 budgets for a real division;
 * `dashed` and `dotted` are for a boundary that is provisional or inferred — a
 * drop target's edge, a placeholder row, a projected value in a schedule — where
 * a solid rule would claim the same authority as a structural division.
 */
export type SeparatorVariant = "solid" | "dashed" | "dotted";

/** Where the label sits along the rule. @default "center" */
export type SeparatorLabelPosition = "start" | "center" | "end";

export type SeparatorProps = Omit<SeparatorRootProps, "className"> & {
  className?: string;
  /**
   * Text or content rendered inside the rule, which then draws on both sides of
   * it ("or" between two sign-in paths, a date break in a transcript, a section
   * name in a long settings column). Horizontal only — a vertical labelled rule
   * would set the label on its side or force a fixed height, and neither is a
   * divider any more.
   */
  label?: React.ReactNode;
  /** Where the label sits along the rule. @default "center" */
  labelPosition?: SeparatorLabelPosition;
  /** Line treatment. @default "solid" */
  variant?: SeparatorVariant;
} & XstyleProp;

/**
 * Rule between two regions (baseline `Separator` anatomy).
 *
 * §1.3 asks a divider for a reason padding cannot give, so this stays a
 * hairline in `colorBorder` and never gains weight. What it does gain is the two
 * things a divider is asked for and consumers were hand-rolling instead: a
 * non-solid line, and a label inside the rule.
 *
 * The line is drawn with a *border*, not a background fill, because
 * `border-style` is what makes `dashed` and `dotted` possible at all — a
 * 1px-tall filled box cannot be dashed. Rendered geometry for `solid` is
 * unchanged: the box is 0 and the hairline border supplies the same single
 * device pixel, independent of `box-sizing`.
 */
export function Separator({
  className,
  label,
  labelPosition = "center",
  orientation = "horizontal",
  variant = "solid",
  xstyle,
  ...props
}: SeparatorProps) {
  if (label != null && orientation !== "vertical") {
    /*
     * A labelled divider is one separator with the rule broken around its text,
     * not two separators with a caption between them. The element keeps
     * `role="separator"`; the two rule segments are decorative.
     *
     * ARIA prohibits name-from-content on a non-focusable `separator`, so a
     * string label is also set as `aria-label` — otherwise the visible text
     * would be announced as nothing at all. A `ReactNode` label cannot be
     * flattened safely, so those callers pass their own `aria-label` (or leave
     * the divider unnamed, which is what a purely decorative one wants).
     *
     * This branch renders its own element rather than the Base UI part, because
     * the rule has to be broken into two segments around the label. The two
     * Base UI-only props are therefore not part of the labelled contract:
     * `render` would replace the element that owns the segments, and `style` as
     * a state callback has no separator state to read. Both are dropped here
     * instead of being passed through as something they are not.
     */
    const { render: _render, style, ...nativeProps } = props;
    const ariaLabel =
      props["aria-label"] ?? (typeof label === "string" ? label : undefined);
    const theme = themeProps("separator", { variant });

    return (
      <div
        {...nativeProps}
        {...theme}
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className={cx(sx(styles.labelledRoot, xstyle), theme.className, className)}
        role="separator"
        style={typeof style === "function" ? undefined : style}
      >
        {labelPosition === "start" ? null : (
          <span
            {...themeSlotProps("separator", "rule")}
            aria-hidden
            className={sx(styles.rule, ruleVariantStyles[variant])}
          />
        )}
        <span
          {...themeSlotProps("separator", "label")}
          className={sx(styles.label)}
        >
          {label}
        </span>
        {labelPosition === "end" ? null : (
          <span
            {...themeSlotProps("separator", "rule")}
            aria-hidden
            className={sx(styles.rule, ruleVariantStyles[variant])}
          />
        )}
      </div>
    );
  }

  const theme = themeProps("separator", { variant });

  return (
    <SeparatorRoot
      {...props}
      {...theme}
      className={cx(
        sx(
          styles.root,
          orientation === "vertical" ? styles.vertical : styles.horizontal,
          orientation === "vertical"
            ? verticalVariantStyles[variant]
            : horizontalVariantStyles[variant],
          xstyle,
        ),
        theme.className,
        className,
      )}
      orientation={orientation}
    />
  );
}

const styles = stylex.create({
  root: {
    borderColor: vars["--ads-color-border"],
  },
  horizontal: {
    // The border draws the hairline, so the box itself is zero-height. This is
    // what `dashed`/`dotted` need, and it keeps `solid` pixel-identical to the
    // previous `blockSize: 1` + background implementation.
    blockSize: 0,
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    inlineSize: "100%",
  },
  vertical: {
    blockSize: "100%",
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    inlineSize: 0,
    minBlockSize: 24,
  },
  horizontalSolid: { borderBlockStartStyle: "solid" },
  horizontalDashed: { borderBlockStartStyle: "dashed" },
  horizontalDotted: { borderBlockStartStyle: "dotted" },
  verticalSolid: { borderInlineStartStyle: "solid" },
  verticalDashed: { borderInlineStartStyle: "dashed" },
  verticalDotted: { borderInlineStartStyle: "dotted" },
  labelledRoot: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  rule: {
    blockSize: 0,
    borderBlockStartColor: vars["--ads-color-border"],
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    flexGrow: 1,
    // Both segments may shrink to nothing before the label wraps: the label is
    // the content, the rule is the decoration.
    flexShrink: 1,
    minInlineSize: 0,
  },
  ruleSolid: { borderBlockStartStyle: "solid" },
  ruleDashed: { borderBlockStartStyle: "dashed" },
  ruleDotted: { borderBlockStartStyle: "dotted" },
  label: {
    // §5's metadata tier: a divider label names a break, it is not a heading.
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
});

const horizontalVariantStyles = {
  dashed: styles.horizontalDashed,
  dotted: styles.horizontalDotted,
  solid: styles.horizontalSolid,
} as const satisfies Record<SeparatorVariant, unknown>;

const verticalVariantStyles = {
  dashed: styles.verticalDashed,
  dotted: styles.verticalDotted,
  solid: styles.verticalSolid,
} as const satisfies Record<SeparatorVariant, unknown>;

const ruleVariantStyles = {
  dashed: styles.ruleDashed,
  dotted: styles.ruleDotted,
  solid: styles.ruleSolid,
} as const satisfies Record<SeparatorVariant, unknown>;
