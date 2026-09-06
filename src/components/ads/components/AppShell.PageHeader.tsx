import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Breadcrumb, type BreadcrumbItem } from "./Breadcrumb";

export type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  description?: React.ReactNode;
  /**
   * Inline metadata row below the title/description (owner, dates, counts,
   * links). Compose with `PageHeaderMetaItem` for muted items with the
   * standard type ramp.
   */
  meta?: React.ReactNode;
  /**
   * View-switch tab strip anchored at the bottom of the header (e.g. an ADS
   * `Tabs` list). Rendered full-width after all other slots.
   */
  tabs?: React.ReactNode;
  title: React.ReactNode;
  /**
   * Leading glyph rendered inline before the title (identity/tone dot,
   * page icon). Decorative — pair with text, never a lone color signal.
   */
  titleIcon?: React.ReactNode;
};

export function PageHeader({
  actions,
  breadcrumbs,
  children,
  className,
  description,
  meta,
  tabs,
  title,
  titleIcon,
  ...props
}: PageHeaderProps) {
  return (
    <header {...props} className={cx(sx(styles.pageHeader), className)}>
      {breadcrumbs ? (
        <Breadcrumb density="compact" items={breadcrumbs} />
      ) : null}
      <div className={sx(styles.pageHeaderRow)}>
        <div className={sx(styles.pageHeaderCopy)}>
          {titleIcon ? (
            <span className={sx(styles.pageTitleRow)}>
              <span aria-hidden className={sx(styles.pageTitleIcon)}>
                {titleIcon}
              </span>
              <h1 className={sx(styles.pageTitle)}>{title}</h1>
            </span>
          ) : (
            <h1 className={sx(styles.pageTitle)}>{title}</h1>
          )}
          {description ? (
            <p className={sx(styles.pageDescription)}>{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className={sx(styles.pageActions)}>{actions}</div>
        ) : null}
      </div>
      {meta ? <div className={sx(styles.pageMeta)}>{meta}</div> : null}
      {children}
      {tabs ? <div className={sx(styles.pageTabs)}>{tabs}</div> : null}
    </header>
  );
}

/** Muted inline metadata item for the `PageHeader` `meta` slot. */
export function PageHeaderMetaItem({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span {...props} className={cx(sx(styles.pageMetaItem), className)} />;
}

const styles = stylex.create({
  pageHeader: {
    // The header owns its inline-size context. The title/action row below uses
    // content-aware flex wrapping inside that owner instead of guessing from
    // the viewport or a fixed container threshold.
    containerName: "atelier-page-header",
    containerType: "inline-size",
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: "minmax(0, 1fr)",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  pageHeaderRow: {
    alignItems: "start",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space16,
    minInlineSize: 0,
  },
  pageHeaderCopy: {
    display: "grid",
    // A readable copy column is the line-breaking input, not a hard breakpoint.
    // A compact action (including refresh) stays beside the title whenever a
    // 24rem copy measure still fits; a wider action group wraps as a unit.
    flexBasis: "24rem",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars.space8,
    justifyItems: "start",
    minInlineSize: 0,
  },
  pageTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeHeading,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightHeading,
    margin: 0,
    overflowWrap: "anywhere",
  },
  pageDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    // Measure cap in `ch`, so it tracks the font size instead of assuming one.
    // 680px was the 60–75ch cap for a 16px body; against this rule's own
    // `fontSizeBody` (14px, ~7.1px average advance) it ran ~90–97 characters —
    // past the point where the eye reliably finds the next line. 62ch stays
    // mid-range at whatever size the token later takes.
    maxInlineSize: "62ch",
    overflowWrap: "anywhere",
  },
  pageActions: {
    // `alignItems` centres each control inside its flex LINE; `alignContent`
    // centres the line inside the box. Both are needed because this slot wraps:
    // with only the first, a 32px line sat at the top of the 28px box and every
    // action stayed 2px low — the exact drift this fix removes.
    alignContent: "center",
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars.space8,
    /*
     * The row is `align-items: start`, because the copy column can carry a
     * description under the title. That left every action sitting lower than
     * the title it acts on — a 32px control against a 28px line box is 2px out,
     * and a taller control is further out.
     *
     * Giving the slot the title's OWN line height and centring inside it fixes
     * the whole family at once: a control of any height overflows this box
     * symmetrically, so its centre lands on the title's centre whether it is
     * 32px or 36px. A fixed offset would only have been right for one of them.
     * The box does not clip — nothing here sets `overflow`.
     */
    blockSize: {
      default: vars.lineHeightHeading,
      "@container atelier-page-header (max-width: 480px)": "auto",
    },
    inlineSize: {
      default: "fit-content",
      "@container atelier-page-header (max-width: 480px)": "100%",
    },
    justifyContent: {
      default: "flex-end",
      "@container atelier-page-header (max-width: 480px)": "flex-start",
    },
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  pageTitleRow: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  pageTitleIcon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  pageMeta: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    minInlineSize: 0,
  },
  pageMetaItem: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
  },
  pageTabs: {
    display: "grid",
    minInlineSize: 0,
  },
});
