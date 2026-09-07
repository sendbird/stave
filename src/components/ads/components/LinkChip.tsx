import * as stylex from "@stylexjs/stylex";
import { ExternalLink, Link2 } from "lucide-react";
import type * as React from "react";

import { controlHeights, type ControlScale } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

// Hover and pressed washes for this file's OPAQUE resting fills. A translucent
// overlay cannot be painted onto one without dropping the fill itself, so the
// same operand is applied the other way, at the same 6/12 weights. sRGB, not
// oklab: an oklab mix is nearly invisible over a near-black fill.
const raisedWashHover = `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 6%)`;
const raisedWashPressed = `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 12%)`;

export type LinkChipProps = React.ComponentPropsWithoutRef<"a"> & {
  /**
   * Replaces the glyph inferred from `href`. Pass `null` for a bare chip when
   * the surrounding surface already says where the link goes.
   */
  icon?: React.ReactNode;
  /** Interactive chip size on the shared control scale. @default "xs" */
  size?: ControlScale;
} & XstyleProp;

/**
 * Reports whether `href` leaves the Atelier SPA.
 *
 * Deliberately syntactic — it never reads `location`, so the same href resolves
 * identically on the server, during hydration, and in tests. Fragments,
 * absolute paths and relative paths stay in-app; anything carrying a scheme
 * (`https:`, `mailto:`, `tel:`) or a protocol-relative `//` host leaves.
 */
export function isExternalLinkHref(href?: string): boolean {
  const value = href?.trim();
  if (!value) return false;
  if (value.startsWith("//")) return true;
  if (
    value.startsWith("#") ||
    value.startsWith("/") ||
    value.startsWith(".") ||
    value.startsWith("?")
  ) {
    return false;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * Compact link value for dense tables and property surfaces.
 *
 * The glyph and the `target`/`rel` defaults follow `href`: external links open
 * in a new tab behind an external-link glyph, in-app links navigate in place
 * behind a neutral link glyph. Pass `icon` to name the destination more
 * precisely (a page, an issue, a person), or `null` to drop the glyph.
 */
export function LinkChip({
  children,
  className,
  href,
  icon,
  rel,
  size = "xs",
  target,
  xstyle,
  ...props
}: LinkChipProps) {
  const external = isExternalLinkHref(href);
  const glyph =
    icon === undefined ? (
      external ? (
        <ExternalLink aria-hidden size={12} />
      ) : (
        <Link2 aria-hidden size={12} />
      )
    ) : (
      icon
    );
  return (
    <a
      {...props}
      className={cx(
        sx(
          styles.root,
          transition.colors,
          controlHeights[size],
          focusRing.ring,
          xstyle,
        ),
        className,
      )}
      href={href}
      rel={rel ?? (external ? "noreferrer" : undefined)}
      target={target ?? (external ? "_blank" : undefined)}
    >
      {glyph ? (
        <span aria-hidden className={linkChipIconClassName}>
          {glyph}
        </span>
      ) : null}
      <span className={linkChipLabelClassName}>{children}</span>
    </a>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": raisedWashHover,
      ":active": raisedWashPressed,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    display: "inline-flex",
    flexShrink: 1,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    lineHeight: vars.lineHeightTight,
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars.space8,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  icon: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 0,
  },
  label: {
    display: "block",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // CSS-only twin of the icon slot, for anchors whose markup we do not own
  // (Lexical builds `<a>` from a theme class and accepts no children). The
  // mask paints the same lucide glyphs the component renders.
  glyph: {
    // StyleX orders `::before` above any `:is()` condition, so the two glyphs
    // cannot be two competing `mask-image` rules — the internal one would always
    // win. The href test picks a custom property instead, and the pseudo-element
    // reads it.
    "--linkChipGlyph": {
      default: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 17H7A5 5 0 0 1 7 7h2'/%3E%3Cpath d='M15 7h2a5 5 0 1 1 0 10h-2'/%3E%3Cline x1='8' x2='16' y1='12' y2='12'/%3E%3C/svg%3E")`,
      ':is([href^="http"], [href^="//"], [href^="mailto:"], [href^="tel:"])': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 3h6v6'/%3E%3Cpath d='M10 14 21 3'/%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6'/%3E%3C/svg%3E")`,
    },
    "::before": {
      backgroundColor: vars.colorTextMuted,
      blockSize: 12,
      content: '""',
      flexShrink: 0,
      inlineSize: 12,
      maskImage: "var(--linkChipGlyph)",
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
    },
  },
});

/** Shared ADS link-chip frame for product-specific link variants. */
export const linkChipClassName = sx(
  styles.root,
  // `transition.colors` rather than the three declarations written out by
  // hand. The local copy was byte-identical to the recipe — including the
  // reduced-motion branch it happened to get right — which is exactly the
  // shape §3.1 flags: the next hand-written triplet is the one that forgets
  // `@media (prefers-reduced-motion: reduce)`.
  transition.colors,
  controlHeights.xs,
  focusRing.ring,
);

/** Shared truncating label treatment for product-specific link variants. */
export const linkChipLabelClassName = sx(styles.label);

/** Shared leading-glyph slot for product-specific link variants. */
export const linkChipIconClassName = sx(styles.icon);

/**
 * Shared glyph for chip-framed anchors rendered without children — pairs with
 * `linkChipClassName` and picks internal vs. external from the `href`.
 */
export const linkChipGlyphClassName = sx(styles.glyph);
