import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { surfaceChrome } from "../recipes/surface-chrome";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { resolveToneRole, toneIcons } from "../utils/tone";
import { FeedbackDismiss } from "./feedback-dismiss";

export type BannerTone = "info" | "success" | "warning" | "danger";

type BannerSharedProps = Omit<React.ComponentProps<"section">, "children"> & {
  children?: React.ReactNode;
  /** Accessible name for the dismiss control; required for it to show. */
  dismissLabel?: string;
  onDismiss?: () => void;
  tone?: BannerTone;
};

export type BannerRootProps = BannerSharedProps & XstyleProp;

export function BannerTitle({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"strong"> & XstyleProp) {
  return (
    <strong
      {...props}
      {...themeSlotProps("banner", "title")}
      className={cx(sx(styles.title, xstyle), className)}
    />
  );
}

export function BannerDescription({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"div"> & XstyleProp) {
  return (
    <div
      {...props}
      {...themeSlotProps("banner", "description")}
      className={cx(sx(styles.body, xstyle), className)}
    />
  );
}

export function BannerAction({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"div"> & XstyleProp) {
  return (
    <div
      {...props}
      {...themeSlotProps("banner", "action")}
      className={cx(sx(styles.action, xstyle), className)}
    />
  );
}

/** Page-level feedback surface shared by both public call styles. */
export function BannerRoot({
  children,
  className,
  dismissLabel,
  onDismiss,
  role,
  tone = "info",
  xstyle,
  ...props
}: BannerRootProps) {
  const Icon = toneIcons[tone];
  const bannerRole = resolveToneRole(tone, role);
  const items = React.Children.toArray(children);
  const action = items.find(
    (item) => React.isValidElement(item) && item.type === BannerAction,
  );
  const copy = items.filter((item) => item !== action);
  const theme = themeProps("banner", { tone });

  return (
    <section
      {...props}
      {...theme}
      className={cx(
        sx(styles.root, onDismiss ? styles.rootDismissible : null, xstyle),
        theme.className,
        className,
      )}
      role={bannerRole}
    >
      <Icon
        aria-hidden
        {...themeSlotProps("banner", "media")}
        className={sx(surfaceChrome.leadingGlyphNudge, toneIconStyles[tone])}
        size={18}
      />
      <div className={sx(styles.copy)}>{copy}</div>
      {action}
      {onDismiss && dismissLabel ? (
        <div className={sx(styles.dismiss)}>
          <FeedbackDismiss label={dismissLabel} onDismiss={onDismiss} />
        </div>
      ) : null}
    </section>
  );
}

export type BannerProps = Omit<BannerSharedProps, "children"> & {
  action?: React.ReactNode;
  /**
   * Show a trailing dismiss control and call this when it is pressed. A
   * page-level banner is the surface most likely to need one — a maintenance
   * window or a rollout notice is read once — and the owner still decides
   * whether dismissal is remembered.
   */
  children?: React.ReactNode;
  title: React.ReactNode;
} & XstyleProp;

function BannerConvenience({
  action,
  children,
  className,
  dismissLabel,
  onDismiss,
  role,
  tone = "info",
  title,
  xstyle,
  ...props
}: BannerProps) {
  return (
    <BannerRoot
      {...props}
      className={className}
      xstyle={xstyle}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      role={role}
      tone={tone}
    >
      <BannerTitle>{title}</BannerTitle>
      {children ? <BannerDescription>{children}</BannerDescription> : null}
      {action ? <BannerAction>{action}</BannerAction> : null}
    </BannerRoot>
  );
}

/** Concise props remain callable; named parts support richer action notices. */
export const Banner = Object.assign(BannerConvenience, {
  Action: BannerAction,
  Description: BannerDescription,
  Root: BannerRoot,
  Title: BannerTitle,
});

const styles = stylex.create({
  /*
   * A filled notice, not a card. Three separate cues used to say "this is a
   * banner" at once — a `colorSurfaceTint` fill, a full perimeter, AND
   * `elevation1` — and the perimeter was drawn in `colorBorderStrong`, the 3:1
   * *interactive* border step, which is the heaviest line in the system on the
   * one surface that is not interactive at all. Stacked (a page can show four),
   * the result was the bordered-card wall this pass exists to remove.
   *
   * What remains is the fill and the tone icon. The fill is the grouping cue
   * (§1.5's temperature step), so the line and the shadow were both restating
   * it. `colorMediaEdge` puts the perimeter back in the high-contrast theme
   * only, where the tint collapses onto the canvas and a boundary is the only
   * thing left to read — the same mechanism `Avatar` uses for its ring.
   */
  root: {
    alignItems: "start",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-panel"],
    boxShadow: `0 0 0 ${vars["--ads-border-width-hairline"]} ${vars["--ads-color-media-edge"]}`,
    color: vars["--ads-color-text"],
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "20px minmax(0, 1fr)",
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-20"],
  },
  /*
   * The banner's action sits under its copy in column 2, so a third `auto`
   * track is free for the dismiss control at the top-right corner — no
   * responsive override needed, because the action never occupies it.
   */
  rootDismissible: {
    gridTemplateColumns: "20px minmax(0, 1fr) auto",
  },
  dismiss: {
    alignSelf: "start",
    display: "inline-flex",
    gridColumn: "3",
    gridRow: "1",
    // Same optical correction as `Alert`: the 32px control is taller than the
    // title row, so it is pulled back into the 16px block padding rather than
    // setting the banner's height.
    marginBlock: `calc(${vars["--ads-space-8"]} * -1)`,
  },
  // Tone lives on the icon; the banner stays a neutral surface with readable text.
  iconInfo: { color: vars["--ads-color-info"] },
  iconSuccess: { color: vars["--ads-color-success"] },
  iconWarning: { color: vars["--ads-color-warning"] },
  iconDanger: { color: vars["--ads-color-danger"] },
  copy: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    overflowWrap: "anywhere",
  },
  body: {
    color: "currentColor",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
  action: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    gridColumn: "2",
    justifySelf: "start",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
});

const toneIconStyles = {
  danger: styles.iconDanger,
  info: styles.iconInfo,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
} as const;
