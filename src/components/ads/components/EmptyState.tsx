import * as stylex from "@stylexjs/stylex";
import { isValidElement } from "react";
import type * as React from "react";

import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button, type ButtonProps } from "./Button";
import { IconTile, type IconTileProps, type IconTileTone } from "./IconTile";

export type EmptyStateProps = Omit<React.ComponentProps<"section">, "title"> & {
  /**
   * Primary call to action. Pass a config object to get the default
   * small primary `Button`, or a ready element (e.g. your own `<Button>`)
   * to use as-is — triggers always compose `Button`, never restyle it.
   */
  action?:
    | React.ReactElement
    | Pick<ButtonProps, "children" | "disabled" | "loading" | "onClick">;
  description: React.ReactNode;
  /** Semantic heading level for the convenience title. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** Decorative icon rendered in a tone-aware medallion (hidden from assistive tech). */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Semantic color family for the icon medallion. @default "accent" */
  tone?: EmptyStateTone;
  /** Container treatment. Use plain when a parent already owns the surface. @default "card" */
  variant?: "card" | "plain";
} & XstyleProp;

/**
 * The shared tinted-object tone union. `EmptyState`'s medallion is an
 * `IconTile`, so the two families cannot disagree about what "danger" is.
 */
export type EmptyStateTone = IconTileTone;

export type EmptyStateRootProps = React.ComponentProps<"section"> & {
  /** Container treatment. Use plain when a parent already owns the surface. @default "card" */
  variant?: "card" | "plain";
} & XstyleProp;

/** Root surface for a composed empty state. */
export function EmptyStateRoot({
  className,
  variant = "card",
  xstyle,
  ...props
}: EmptyStateRootProps) {
  const theme = themeProps("empty-state", { variant });

  return (
    <section
      {...props}
      {...theme}
      className={cx(
        sx(styles.root, variant === "plain" ? styles.plain : undefined, xstyle),
        theme.className,
        className,
      )}
    />
  );
}

export type EmptyStateHeaderProps = React.ComponentProps<"div"> & XstyleProp;

/** Groups the title and description into one readable copy block. */
export function EmptyStateHeader({
  className,
  xstyle,
  ...props
}: EmptyStateHeaderProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("empty-state", "header")}
      className={cx(sx(styles.header, xstyle), className)}
    />
  );
}

export type EmptyStateMediaProps = Omit<IconTileProps, "shape" | "size"> & {
  /** Semantic color family for an icon medallion. @default "accent" */
  tone?: EmptyStateTone;
};

/**
 * Decorative media slot — the `xl` round `IconTile`. Use a semantic tone only
 * when the state warrants it, and size the glyph with
 * `iconTileGlyphSizes.xl`.
 */
export function EmptyStateMedia({
  className,
  tone = "accent",
  xstyle,
  ...props
}: EmptyStateMediaProps) {
  return (
    <IconTile
      {...props}
      {...themeSlotProps("empty-state", "media")}
      className={className}
      shape="round"
      size="xl"
      tone={tone}
      xstyle={xstyle}
    />
  );
}

export type EmptyStateTitleProps = Omit<React.ComponentProps<"h3">, "as"> & {
  /** Heading element used in the surrounding page hierarchy. @default "h3" */
  as?: "h2" | "h3" | "h4";
} & XstyleProp;

/** Heading slot with explicit page-hierarchy control. */
export function EmptyStateTitle({
  as: Title = "h3",
  className,
  xstyle,
  ...props
}: EmptyStateTitleProps) {
  return (
    <Title
      {...props}
      {...themeSlotProps("empty-state", "title")}
      className={cx(sx(styles.title, xstyle), className)}
    />
  );
}

export type EmptyStateDescriptionProps = React.ComponentProps<"p"> & XstyleProp;

/** Supporting explanation that adds the next useful piece of context. */
export function EmptyStateDescription({
  className,
  xstyle,
  ...props
}: EmptyStateDescriptionProps) {
  return (
    <p
      {...props}
      {...themeSlotProps("empty-state", "description")}
      className={cx(sx(styles.description, xstyle), className)}
    />
  );
}

export type EmptyStateContentProps = React.ComponentProps<"div"> & XstyleProp;

/** Action, field, link, or other next-step content below the copy block. */
export function EmptyStateContent({
  className,
  xstyle,
  ...props
}: EmptyStateContentProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("empty-state", "content")}
      className={cx(sx(styles.content, xstyle), className)}
    />
  );
}

/**
 * Empty placeholder for lists/tables/searches with no content: icon chip,
 * title, description, and an optional action. Extra content (a secondary
 * link, keyboard hint) can be passed as `children` and renders below the
 * action.
 */
function EmptyStateConvenience({
  action,
  children,
  className,
  description,
  headingLevel = 3,
  icon,
  title,
  tone = "accent",
  variant = "card",
  xstyle,
  ...props
}: EmptyStateProps) {
  const titleElement =
    headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";

  return (
    <EmptyStateRoot
      {...props}
      className={className}
      xstyle={xstyle}
      variant={variant}
    >
      {icon ? <EmptyStateMedia tone={tone}>{icon}</EmptyStateMedia> : null}
      <EmptyStateHeader>
        <EmptyStateTitle as={titleElement}>{title}</EmptyStateTitle>
        <EmptyStateDescription>{description}</EmptyStateDescription>
      </EmptyStateHeader>
      {action || children ? (
        <EmptyStateContent>
          {action ? (
            isValidElement(action) ? (
              action
            ) : (
              <Button
                disabled={action.disabled || !action.onClick}
                loading={action.loading}
                onClick={action.onClick}
                size="sm"
              >
                {action.children}
              </Button>
            )
          ) : null}
          {children}
        </EmptyStateContent>
      ) : null}
    </EmptyStateRoot>
  );
}

/**
 * Empty placeholder for lists, tables, searches, and first-run surfaces.
 *
 * Use the convenience props for the common icon/title/description/action
 * shape, or compose `Root`, `Media`, `Header`, `Title`, `Description`, and
 * `Content` when the next step needs multiple controls or a field.
 */
export const EmptyState = Object.assign(EmptyStateConvenience, {
  Content: EmptyStateContent,
  Description: EmptyStateDescription,
  Header: EmptyStateHeader,
  Media: EmptyStateMedia,
  Root: EmptyStateRoot,
  Title: EmptyStateTitle,
});

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"): a
    // static container that groups content in flow does not leave its plane, so
    // it carries no shadow. `elevation1` now means pressable, movable, or
    // docked. Depth against the canvas comes from the surface step + hairline.
    boxShadow: vars["--ads-elevation-flat"],
    color: vars["--ads-color-text"],
    display: "grid",
    gap: vars["--ads-space-16"],
    inlineSize: "100%",
    justifyItems: "center",
    minInlineSize: 0,
    padding: vars["--ads-space-32"],
    textAlign: "center",
  },
  plain: {
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: "none",
    padding: vars["--ads-space-20"],
  },
  header: {
    display: "grid",
    gap: vars["--ads-space-8"],
    justifyItems: "center",
    maxInlineSize: 360,
    minInlineSize: 0,
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-lead"],
    margin: 0,
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  content: {
    display: "grid",
    gap: vars["--ads-space-8"],
    justifyItems: "center",
    maxInlineSize: 360,
    minInlineSize: 0,
  },
});

export { styles as emptyStateStyles };
