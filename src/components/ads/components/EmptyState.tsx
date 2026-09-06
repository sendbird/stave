import type { StyleXValue } from "../utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { isValidElement } from "react";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Button, type ButtonProps } from "./Button";

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
};

export type EmptyStateTone =
  | "accent"
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type EmptyStateRootProps = React.ComponentProps<"section"> & {
  /** Container treatment. Use plain when a parent already owns the surface. @default "card" */
  variant?: "card" | "plain";
};

/** Root surface for a composed empty state. */
export function EmptyStateRoot({
  className,
  variant = "card",
  ...props
}: EmptyStateRootProps) {
  return (
    <section
      {...props}
      className={cx(
        sx(styles.root, variant === "plain" ? styles.plain : undefined),
        className,
      )}
    />
  );
}

export type EmptyStateHeaderProps = React.ComponentProps<"div"> & { xstyle?: StyleXValue };

/** Groups the title and description into one readable copy block. */
export function EmptyStateHeader({
  className,
  xstyle,
  ...props
}: EmptyStateHeaderProps) {
  return <div {...props} className={cx(sx(styles.header, xstyle), className)} />;
}

export type EmptyStateMediaProps = React.ComponentProps<"div"> & {
  /** Semantic color family for an icon medallion. @default "accent" */
  tone?: EmptyStateTone;
};

/** Decorative media slot. Use a semantic tone only when the state warrants it. */
export function EmptyStateMedia({
  className,
  tone = "accent",
  ...props
}: EmptyStateMediaProps) {
  return (
    <div
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={cx(sx(styles.media, toneStyles[tone]), className)}
    />
  );
}

export type EmptyStateTitleProps = Omit<React.ComponentProps<"h3">, "as"> & {
  /** Heading element used in the surrounding page hierarchy. @default "h3" */
  as?: "h2" | "h3" | "h4";
};

/** Heading slot with explicit page-hierarchy control. */
export function EmptyStateTitle({
  as: Title = "h3",
  className,
  ...props
}: EmptyStateTitleProps) {
  return <Title {...props} className={cx(sx(styles.title), className)} />;
}

export type EmptyStateDescriptionProps = React.ComponentProps<"p"> & { xstyle?: StyleXValue };

/** Supporting explanation that adds the next useful piece of context. */
export function EmptyStateDescription({
  className,
  xstyle,
  ...props
}: EmptyStateDescriptionProps) {
  return <p {...props} className={cx(sx(styles.description, xstyle), className)} />;
}

export type EmptyStateContentProps = React.ComponentProps<"div"> & { xstyle?: StyleXValue };

/** Action, field, link, or other next-step content below the copy block. */
export function EmptyStateContent({
  className,
  xstyle,
  ...props
}: EmptyStateContentProps) {
  return <div {...props} className={cx(sx(styles.content, xstyle), className)} />;
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
  ...props
}: EmptyStateProps) {
  const titleElement =
    headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";

  return (
    <EmptyStateRoot {...props} className={className} variant={variant}>
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
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"): a
    // static container that groups content in flow does not leave its plane, so
    // it carries no shadow. `elevation1` now means pressable, movable, or
    // docked. Depth against the canvas comes from the surface step + hairline.
    boxShadow: vars.elevationFlat,
    color: vars.colorText,
    display: "grid",
    gap: vars.space16,
    inlineSize: "100%",
    justifyItems: "center",
    minInlineSize: 0,
    padding: vars.space32,
    textAlign: "center",
  },
  plain: {
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: "none",
    padding: vars.space20,
  },
  media: {
    alignItems: "center",
    borderRadius: vars.radiusFull,
    display: "inline-flex",
    inlineSize: 48,
    justifyContent: "center",
    minBlockSize: 48,
  },
  toneAccent: {
    // selection-ok: this tint identifies a decorative accent medallion, not a
    // selected/current surface.
    backgroundColor: vars.colorAccentSoft,
    color: vars.colorAccent,
  },
  toneNeutral: {
    backgroundColor: vars.colorCanvasSubtle,
    color: vars.colorTextMuted,
  },
  toneInfo: {
    backgroundColor: vars.colorInfoSoft,
    color: vars.colorInfo,
  },
  toneSuccess: {
    backgroundColor: vars.colorSuccessSoft,
    color: vars.colorSuccess,
  },
  toneWarning: {
    backgroundColor: vars.colorWarningSoft,
    color: vars.colorWarning,
  },
  toneDanger: {
    backgroundColor: vars.colorDangerSoft,
    color: vars.colorDanger,
  },
  header: {
    display: "grid",
    gap: vars.space8,
    maxInlineSize: 360,
    minInlineSize: 0,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightLead,
    margin: 0,
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    overflowWrap: "anywhere",
  },
  content: {
    display: "grid",
    gap: vars.space8,
    justifyItems: "center",
    maxInlineSize: 360,
    minInlineSize: 0,
  },
});

const toneStyles = {
  accent: styles.toneAccent,
  danger: styles.toneDanger,
  info: styles.toneInfo,
  neutral: styles.toneNeutral,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
} as const;

export { styles as emptyStateStyles };
