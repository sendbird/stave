import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { createContext, Fragment, useContext, useMemo } from "react";
import type * as React from "react";

import type { BreadcrumbRootProps } from "../headless/breadcrumb";
import { focusRing } from "../recipes/focus-ring";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

// ---------------------------------------------------------------------------
// Compound parts (compositional Breadcrumb API — standard anatomy:
// Root > List > Item > (Link | Page), with Separator between items)
// ---------------------------------------------------------------------------

export type BreadcrumbDensity = "compact" | "default";

type BreadcrumbShape = {
  density: BreadcrumbDensity;
  wrap: boolean;
};

const BreadcrumbShapeContext = createContext<BreadcrumbShape>({
  density: "default",
  wrap: true,
});

export type BreadcrumbRootCompoundProps = React.ComponentProps<"nav"> & {
  density?: BreadcrumbDensity;
  /**
   * Let the trail run onto more lines when it does not fit.
   *
   * True suits a page header, where the reader wants every ancestor spelled
   * out. Pass `false` in a chrome row — a `Topbar` beside a `SidebarTrigger` —
   * where the bar owns a fixed height: the trail then stays on one line and the
   * crumb labels ellipsize instead of growing the band. At 390px the docs
   * `AppShell` context row was a 78px stack of three crumbs inside a 48px bar.
   *
   * @default true
   */
  wrap?: boolean;
} & XstyleProp;

/** The breadcrumb landmark (`<nav aria-label="Breadcrumb">`). */
function Root({
  "aria-label": ariaLabel = "Breadcrumb",
  className,
  density = "default",
  wrap = true,
  xstyle,
  ...props
}: BreadcrumbRootCompoundProps) {
  const shape = useMemo(() => ({ density, wrap }), [density, wrap]);
  // `data-density` was already on this nav for consumers to query; it is now
  // the theme axis too, which is why the attribute is spread rather than
  // written twice under two names.
  const theme = themeProps("breadcrumb", { density });

  return (
    <BreadcrumbShapeContext.Provider value={shape}>
      <nav
        {...props}
        {...theme}
        aria-label={ariaLabel}
        className={cx(sx(styles.root, xstyle), theme.className, className)}
      />
    </BreadcrumbShapeContext.Provider>
  );
}

export type BreadcrumbListProps = React.ComponentProps<"ol"> & XstyleProp;

/** The ordered list containing the crumb items. */
function List({ className, xstyle, ...props }: BreadcrumbListProps) {
  const { wrap } = useContext(BreadcrumbShapeContext);

  return (
    <ol
      role="list"
      {...props}
      {...themeSlotProps("breadcrumb", "list")}
      className={cx(
        sx(styles.list, !wrap && styles.listSingleLine, xstyle),
        className,
      )}
    />
  );
}

export type BreadcrumbItemCompoundProps = React.ComponentProps<"li"> &
  XstyleProp;

/** One crumb (`<li>`); contains a `Link` or a `Page`. */
function Item({ className, xstyle, ...props }: BreadcrumbItemCompoundProps) {
  return (
    <li
      {...props}
      {...themeSlotProps("breadcrumb", "item")}
      className={cx(sx(styles.item, xstyle), className)}
    />
  );
}

export type BreadcrumbLinkProps = React.ComponentProps<"a"> & XstyleProp;

/** A navigable crumb (`<a>`). */
function Link({ className, xstyle, ...props }: BreadcrumbLinkProps) {
  const { density } = useContext(BreadcrumbShapeContext);

  return (
    <a
      {...props}
      {...themeSlotProps("breadcrumb", "link")}
      className={cx(
        sx(
          styles.link,
          density === "compact" && styles.interactiveCompact,
          focusRing.ring,
          xstyle,
        ),
        className,
      )}
    />
  );
}

export type BreadcrumbPageProps = React.ComponentProps<"span"> & XstyleProp;

/**
 * The current page crumb (`aria-current="page"`, non-interactive).
 *
 * Pass `aria-current={false}` for a crumb that is non-navigable but is NOT the
 * current page — an intermediate step with no route of its own. A destructuring
 * default fires on an explicit `undefined`, so `aria-current={undefined}` used
 * to fall straight back through to `"page"`: every hrefless crumb was announced
 * as the current page, and a trail like `Components / Actions & Overlays /
 * Button` shipped two of them. `false` is the only value that can express
 * "render this crumb, but it is not current".
 */
function Page({
  "aria-current": ariaCurrent = "page",
  className,
  xstyle,
  ...props
}: BreadcrumbPageProps) {
  const isCurrent = ariaCurrent !== false;
  const { density } = useContext(BreadcrumbShapeContext);

  return (
    <span
      {...props}
      {...themeSlotProps("breadcrumb", "page")}
      aria-current={isCurrent ? ariaCurrent : undefined}
      className={cx(
        sx(
          styles.page,
          density === "compact" && styles.interactiveCompact,
          !isCurrent && styles.pageMuted,
          xstyle,
        ),
        className,
      )}
    />
  );
}

export type BreadcrumbSeparatorProps = React.ComponentProps<"li"> & XstyleProp;

/** The visual divider between crumbs (presentational; chevron by default). */
function Separator({
  children,
  className,
  xstyle,
  ...props
}: BreadcrumbSeparatorProps) {
  return (
    <li
      {...props}
      {...themeSlotProps("breadcrumb", "separator")}
      aria-hidden
      className={cx(sx(styles.separatorItem, xstyle), className)}
      role="presentation"
    >
      {children ?? (
        <ChevronRight aria-hidden className={sx(styles.separator)} size={14} />
      )}
    </li>
  );
}

const compoundParts = {
  Root,
  List,
  Item,
  Link,
  Page,
  Separator,
} as const;

// ---------------------------------------------------------------------------
// Array (back-compat convenience) API — re-implemented on the compound parts
// ---------------------------------------------------------------------------

export type BreadcrumbItem = {
  current?: boolean;
  href?: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export type BreadcrumbProps = Omit<BreadcrumbRootProps, "children"> & {
  density?: BreadcrumbDensity;
  items: BreadcrumbItem[];
  label?: string;
  /** See `Breadcrumb.Root`'s `wrap`. @default true */
  wrap?: boolean;
} & XstyleProp;

function BreadcrumbArray({
  density = "default",
  items,
  label = "Breadcrumb",
  wrap = true,
  xstyle,
  ...props
}: BreadcrumbProps) {
  return (
    <Root
      xstyle={xstyle}
      {...props}
      aria-label={label}
      density={density}
      wrap={wrap}
    >
      <List>
        {items.map((item, index) => {
          const current = item.current ?? index === items.length - 1;
          // Breadcrumbs often repeat one route at different hierarchy levels
          // (for example, two placeholder ancestors with `href="#"`). The
          // position is part of a breadcrumb item's identity, so include it to
          // keep React keys unique without widening the public item contract.
          const key = `${item.href ?? "item"}:${index}`;

          const content = (
            <>
              {item.icon ? (
                <span className={sx(styles.icon)}>{item.icon}</span>
              ) : null}
              <span className={sx(styles.label)}>{item.label}</span>
            </>
          );

          return (
            <Fragment key={key}>
              {index > 0 ? <Separator /> : null}
              <Item>
                {current || !item.href ? (
                  <Page aria-current={current ? "page" : false}>{content}</Page>
                ) : (
                  <Link href={item.href} onClick={item.onClick}>
                    {content}
                  </Link>
                )}
              </Item>
            </Fragment>
          );
        })}
      </List>
    </Root>
  );
}

/**
 * Breadcrumb supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Breadcrumb items={[…]} />`
 * - **Compound (compositional):**
 *   `<Breadcrumb.Root><Breadcrumb.List><Breadcrumb.Item>…</Breadcrumb.Item></Breadcrumb.List></Breadcrumb.Root>`
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Breadcrumb` export.
 */
export const Breadcrumb = Object.assign(BreadcrumbArray, compoundParts);

const styles = stylex.create({
  // Content-sized, never greedy. This used to be `inline-size: 100%`, which is
  // a no-op in the block context of `PageHeader` and a layout bug everywhere
  // else: as a flex item beside another control — the `SidebarTrigger` in a
  // workspace header, an action beside a trail — it demanded the whole track,
  // left the sibling zero space, and a wrapping row pushed that sibling onto
  // its own line (the AppShell docs preview rendered the collapse button above
  // `Console › Operations`). Same failure the `ToggleGroup` field div had.
  // `max-inline-size` keeps it inside its container; `min-inline-size: 0` lets
  // it shrink so the crumb labels ellipsize instead of overflowing.
  root: {
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  list: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // `wrap={false}`: one line, and the crumb labels ellipsize (`label` already
  // carries the overflow rules, and every crumb part allows itself to shrink).
  listSingleLine: {
    flexWrap: "nowrap",
  },
  item: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  link: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    minBlockSize: vars["--ads-control-height-sm"],
    minInlineSize: 0,
    paddingInline: vars["--ads-space-8"],
    textDecoration: "none",
  },
  page: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    gap: vars["--ads-space-4"],
    minBlockSize: vars["--ads-control-height-sm"],
    minInlineSize: 0,
    paddingInline: vars["--ads-space-8"],
  },
  interactiveCompact: {
    minBlockSize: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-4"],
  },
  // A crumb that is non-navigable but not the current page reads as an
  // ancestor, so it takes the muted ink and weight of `link` rather than the
  // emphasis of the destination. Without this an intermediate crumb rendered
  // identically to the current one and a trail ended in two bold segments,
  // with nothing to say which one the reader was actually on.
  pageMuted: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  icon: {
    alignItems: "center",
    color: "currentColor",
    display: "inline-flex",
    flexShrink: 0,
  },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  separatorItem: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  separator: {
    color: vars["--ads-color-text-subtle"],
    flexShrink: 0,
  },
});

export { styles as breadcrumbStyles };
