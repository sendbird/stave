import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import {
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "../headless/popover";
import { agentSurface } from "../recipes/agent-surface";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { POPUP_SIDE_OFFSET } from "../utils/placement";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { CitationList } from "./Citation.parts";
import { LinkChip } from "./LinkChip";
import { VisuallyHidden } from "./VisuallyHidden";

export type { CitationListProps, CitationSource } from "./Citation.parts";

export type CitationProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "children" | "title"
> & {
  excerpt?: React.ReactNode;
  href?: string;
  index: number;
  /** Accessible-name prefix for the mark. @default "Source" */
  label?: string;
  source?: React.ReactNode;
  title?: React.ReactNode;
} & XstyleProp;

/**
 * The inline citation mark — `decisions/agent-surface-grammar.md` §7.B.
 *
 * **Rung 0, `radiusSm`, and a tint rather than a stroke.** §4 gives `radiusSm`
 * to a sub-control mark inside a text flow and `radiusFull` to pills and
 * status dots; a `radiusFull` capsule dropped into running text once per claim
 * turns a grounded paragraph into a paragraph full of badges, which is the
 * exact regression this family is designed out of. A border would be louder
 * still: an outline around a two-character mark is the loudest possible
 * version of the box-per-object habit.
 *
 * **It is deliberately quieter than a link.** A link in this system is body
 * ink with an underline. The mark is `colorTextMuted` on the rung-4 tint with
 * no underline: a citation is an aside the reader steps over on the way
 * through a sentence, and at `fontSizeXs` on a body line it must not out-shout
 * the claim carrying it.
 *
 * **It is baseline-aligned, not superscript** — the one measured deviation
 * from the shape the old marker used. `vertical-align: super` lifts the box
 * about 0.33em above the baseline; stacked on a 16px minimum box that put the
 * mark's top above the line's own ascender and grew the line box, so a
 * paragraph visibly re-spaced the moment a citation landed in it. Baseline
 * alignment at `fontSizeXs` with `line-height: 1` gives a 14px box inside a
 * ~23px line box — it cannot disturb the line, which is the requirement the
 * superscript was only approximating.
 *
 * **`tabular-nums`, proportional face.** Fixed advance widths keep `[9]` and
 * `[10]` the same width so a renumbered paragraph does not re-flow.
 * `agentSurface.meta` is deliberately *not* applied: its own docstring forbids
 * mono on prose, and a monospaced mark mid-sentence reads as inline code.
 *
 * Given any provenance, the mark opens a **portalled popover**. §1 exempts an
 * overlay from the concentric-border count — it has no container to belong to,
 * and an overlay with no edge is a rendering bug — so that surface, and only
 * that surface, keeps a perimeter.
 */
function CitationMark({
  className,
  excerpt,
  href,
  index,
  label = "Source",
  source,
  title,
  xstyle,
  ...props
}: CitationProps) {
  const accessibleName =
    props["aria-label"] ??
    (typeof title === "string"
      ? `${label} ${index}: ${title}`
      : `${label} ${index}`);
  const hasProvenance = title != null || source != null || excerpt != null;

  if (!hasProvenance) {
    if (href) {
      return (
        <a
          aria-label={accessibleName}
          {...(props as React.ComponentPropsWithoutRef<"a">)}
          className={cx(
            sx(
              styles.mark,
              styles.markInteractive,
              transition.colors,
              focusRing.ring,
              xstyle,
            ),
            className,
          )}
          href={href}
        >
          {index}
        </a>
      );
    }
    return (
      <span
        {...props}
        aria-label={accessibleName}
        className={cx(sx(styles.mark, xstyle), className)}
      >
        {index}
      </span>
    );
  }

  // A mark with provenance is a button even when it has an `href`: the
  // popover is the point, and the destination is offered inside it as a real
  // link. An anchor that swallows its own activation to open a popup is a link
  // that does not navigate, which is worse than either.
  return (
    <PopoverRoot>
      <PopoverTrigger
        {...props}
        aria-label={accessibleName}
        className={cx(
          sx(
            styles.mark,
            styles.markInteractive,
            styles.markTrigger,
            transition.colors,
            focusRing.ring,
            xstyle,
          ),
          className,
        )}
        render={<button type="button" />}
      >
        {index}
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner
          align="start"
          className={sx(styles.positioner)}
          side="top"
          sideOffset={POPUP_SIDE_OFFSET}
        >
          <PopoverPopup
            className={cx(sx(styles.popup), "atelier-motion-dropdown")}
          >
            <PopoverTitle
              className={title != null ? sx(styles.popupTitle) : undefined}
              render={title != null ? <span /> : <VisuallyHidden />}
            >
              {title ?? accessibleName}
            </PopoverTitle>
            {source != null ? (
              <span className={sx(agentSurface.meta, styles.wrapAnywhere)}>
                {source}
              </span>
            ) : null}
            {excerpt != null ? (
              <span className={sx(styles.popupExcerpt)}>{excerpt}</span>
            ) : null}
            {href ? (
              <LinkChip className={sx(styles.popupLink)} href={href}>
                Open source
              </LinkChip>
            ) : null}
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}

/**
 * One component, because a mark with no list to open is a footnote to nowhere:
 * `<Citation />` is the mark in the running text and `<Citation.List />` is the
 * provenance it resolves against. Both read the same `CitationSource` shape, so
 * a paragraph and its source list cannot disagree about what `[2]` means.
 */
export const Citation = Object.assign(CitationMark, { List: CitationList });

/**
 * One step away from the canvas, in whichever direction the theme's ink runs —
 * the same `color-mix(in oklab, …)` construction `control-chrome.ts` uses for
 * its press step, so light darkens and dark lightens without a second token.
 */
const markHover = `color-mix(in oklab, ${vars.colorText} 5%, ${vars.colorCanvasSubtle})`;

const styles = stylex.create({
  mark: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    display: "inline-block",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeCaption,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
    // `1`, not a spacing token: the mark follows a word directly, and a 4px
    // gutter would read as a space the model did not write.
    marginInlineStart: 1,
    paddingBlock: 1,
    paddingInline: vars.space4,
    textDecoration: "none",
    verticalAlign: "baseline",
  },
  markInteractive: {
    backgroundColor: {
      default: vars.colorCanvasSubtle,
      ":hover": markHover,
    },
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    cursor: "pointer",
  },
  /** Strips the UA button box; the mark above already specifies the whole box. */
  markTrigger: {
    appearance: "none",
    borderStyle: "none",
    borderWidth: 0,
  },
  positioner: {
    zIndex: vars.zIndexDropdown,
  },
  /**
   * The one perimeter this component spends, and §1 exempts it: a portalled
   * overlay has no container to belong to. `elevation3` is the anchored
   * transient band `Popover` and `PreviewCard` already share.
   */
  popup: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationOverlay,
    color: vars.colorText,
    display: "grid",
    gap: vars.space4,
    inlineSize: "min(300px, calc(100dvw - 32px))",
    justifyItems: "start",
    padding: vars.space12,
    transformOrigin: "var(--transform-origin)",
  },
  popupTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  /**
   * Four lines of excerpt, then a clamp. The popover is a decision aid — "is
   * this the source I meant?" — not a reader; an unclamped excerpt covers the
   * answer it was opened to support.
   */
  popupExcerpt: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
    color: vars.colorTextMuted,
    display: "-webkit-box",
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflow: "hidden",
  },
  popupLink: {
    marginBlockStart: vars.space4,
  },
  wrapAnywhere: {
    overflowWrap: "anywhere",
  },
});
