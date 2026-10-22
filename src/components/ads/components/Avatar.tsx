import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import {
  AvatarFallback,
  AvatarImage,
  type AvatarImageProps,
  AvatarRoot,
  type AvatarRootProps,
} from "../headless/avatar";
import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  AvatarStatusDot,
  avatarStatusLabels,
  type AvatarStatus,
} from "./Avatar.presence";
import { Tooltip } from "./Tooltip";

/**
 * Avatar diameter. `sm` 28 / `md` 36 / `lg` 48 are the original three, and the
 * two new rungs are the ones consumers were reaching outside the component for:
 * `xs` 20px fits a `DataTable` cell, an inline mention, or a comment gutter,
 * where a 28px disc sets the row height; `xl` 64px is the profile/detail header,
 * where 48px reads as a list avatar that wandered onto a page title.
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * `circle` is a person. `square` is a rounded-square identity for a thing that
 * is not one — an app, a workspace, a bot integration, a repository — which
 * shipped as a hand-rolled `borderRadius` override at three call sites because
 * the component only knew how to be round. The radius is `radiusPanel`, the same
 * corner a small surface takes, not a private value.
 */
export type AvatarShape = "circle" | "square";

export type AvatarProps = Omit<AvatarRootProps, "className"> & {
  alt: string;
  className?: string;
  fallback: string;
  /** Disc silhouette: `circle` for a person, `square` for an app or workspace. @default "circle" */
  shape?: AvatarShape;
  size?: AvatarSize;
  src?: string;
  /** Image lifecycle signal for consumer-owned loading/error feedback. */
  onImageLoadingStatusChange?: AvatarImageProps["onLoadingStatusChange"];
  /**
   * Presence dot on the avatar edge. The convenience form of wrapping the
   * avatar in `AvatarBadge` — same dot, same labels, same implementation — so a
   * single avatar in an inbox row, a ticket header, or an assignee cell does not
   * have to reach for the wrapper (or hand-roll a dot, which is what six
   * consumer call sites did) to show that someone is online.
   */
  status?: AvatarStatus;
  /** Accessible label override for the status dot. */
  statusLabel?: string;
  /** Optional hover/focus content for identifying the person. */
  tooltip?: React.ReactNode;
  /**
   * What the disc's identity colour is derived from. Defaults to `alt`, which
   * already names the person or thing. Pass a stable id when the display name
   * can change and the colour should not.
   */
  colorKey?: string;
} & XstyleProp;

export function Avatar({
  alt,
  className,
  colorKey,
  fallback,
  shape = "circle",
  size = "md",
  src,
  status,
  statusLabel,
  onImageLoadingStatusChange,
  tooltip,
  xstyle,
  ...props
}: AvatarProps) {
  const theme = themeProps("avatar", { size });
  const disc = (
    <AvatarRoot
      {...props}
      {...theme}
      className={cx(
        sx(
          styles.root,
          identitySlotFor(colorKey ?? alt ?? fallback),
          sizeStyles[size],
          shape === "square" && styles.square,
          xstyle,
        ),
        theme.className,
        className,
      )}
    >
      {src ? (
        <AvatarImage
          alt={alt}
          className={sx(styles.image)}
          src={src}
          onLoadingStatusChange={onImageLoadingStatusChange}
        />
      ) : null}
      <AvatarFallback className={sx(styles.fallback)} delay={80}>
        {fallback}
      </AvatarFallback>
    </AvatarRoot>
  );

  /*
   * The dot is a SIBLING of the disc, not a child of it. The disc carries
   * `overflow: hidden` + `radiusFull` so a photo is clipped to a circle; a dot
   * placed inside it would be clipped by both, losing the part that is supposed
   * to sit on the edge. This is the same structure `AvatarBadge` uses, and the
   * wrapper only appears when a status is asked for, so an avatar without one
   * keeps its exact previous DOM.
   */
  const avatar = status ? (
    <span className={sx(styles.statusWrap)}>
      {disc}
      <AvatarStatusDot
        label={statusLabel ?? avatarStatusLabels[status]}
        model="status"
        value={status}
      />
    </span>
  ) : (
    disc
  );

  return tooltip ? <Tooltip content={tooltip}>{avatar}</Tooltip> : avatar;
}

/*
 * Identity colours: chart slots 1, 2, 4, 5 and 6, the nominal palette minus
 * its green (3) and red (7), because a green or red disc beside a name reads as
 * the person's state rather than as them.
 *
 * Every disc used to be `colorAccentSoft`, and the accent ramp is nearly
 * achromatic, so a column of avatars was a column of identical grey discs that
 * said nothing about whose row it was. It also vanished on a hovered row: the
 * `colorMixInk 6%` wash sits at ~1.03:1 against `accentSoft`. A hue clears the
 * wash at any lightness, because the wash has no hue to collide with.
 *
 * Each slot is a pair mixed from theme tokens (14% of the hue into
 * `colorSurface` for the disc, 60% into `colorText` for the initials), so one
 * declaration serves light, dark and high contrast. `in oklab`, never
 * `in oklch`: both endpoints are achromatic, and oklch would drag every mix
 * toward hue 0 (red).
 */
const identity = stylex.create({
  slot0: {
    backgroundColor: `color-mix(in oklab, ${vars["--ads-chart-1"]} 14%, ${vars["--ads-color-surface"]})`,
    color: `color-mix(in oklab, ${vars["--ads-chart-1"]} 60%, ${vars["--ads-color-text"]})`,
  },
  slot1: {
    backgroundColor: `color-mix(in oklab, ${vars["--ads-chart-2"]} 14%, ${vars["--ads-color-surface"]})`,
    color: `color-mix(in oklab, ${vars["--ads-chart-2"]} 60%, ${vars["--ads-color-text"]})`,
  },
  slot2: {
    backgroundColor: `color-mix(in oklab, ${vars["--ads-chart-4"]} 14%, ${vars["--ads-color-surface"]})`,
    color: `color-mix(in oklab, ${vars["--ads-chart-4"]} 60%, ${vars["--ads-color-text"]})`,
  },
  slot3: {
    backgroundColor: `color-mix(in oklab, ${vars["--ads-chart-5"]} 14%, ${vars["--ads-color-surface"]})`,
    color: `color-mix(in oklab, ${vars["--ads-chart-5"]} 60%, ${vars["--ads-color-text"]})`,
  },
  slot4: {
    backgroundColor: `color-mix(in oklab, ${vars["--ads-chart-6"]} 14%, ${vars["--ads-color-surface"]})`,
    color: `color-mix(in oklab, ${vars["--ads-chart-6"]} 60%, ${vars["--ads-color-text"]})`,
  },
});

const identitySlots = [
  identity.slot0,
  identity.slot1,
  identity.slot2,
  identity.slot3,
  identity.slot4,
] as const;

/**
 * Same key, same colour on every screen and in every session: the slot is a
 * pure function of the key, never of render order or of who else is shown.
 */
function avatarIdentitySlot(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash % identitySlots.length;
}

function identitySlotFor(key: string) {
  return identitySlots[avatarIdentitySlot(key)];
}

const styles = stylex.create({
  // §1.3: small inline objects are not ringed. No reference system outlines an
  // avatar, and these multiply per row (13 in one measured CRM viewport). The
  // identity signal is the image, or the tinted disc and initials `identity`
  // assigns from the key, not a perimeter line. `AvatarGroup` keeps its own
  // 2px `colorSurfaceRaised` ring — that is an overlap separator, not an
  // outline, and is unaffected.
  root: {
    alignItems: "center",
    // Theme-scoped media edge, the shape §1.3 authorised for the high contrast
    // case. `colorMediaEdge` is `transparent` in light and dark, so this is a
    // no-op there and the ringless avatar stands; in high contrast — where
    // `colorSurface` and `colorSurfaceRaised` are both pure white and the theme
    // leans on ink borders — it gives a pale photo the edge it otherwise lacks.
    boxShadow: `0 0 0 1px ${vars["--ads-color-media-edge"]}`,
    borderRadius: vars["--ads-radius-full"],
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: vars["--ads-font-weight-semibold"],
    justifyContent: "center",
    overflow: "hidden",
  },
  xs: {
    // 11px (`fontSizeMicro`) initials in a 20px disc hold the same 0.43 glyph
    // ratio the other rungs use, so a `xs` avatar reads as the same object
    // scaled rather than as a differently typeset one.
    fontSize: vars["--ads-font-size-micro"],
    // Literal, like every other rung here: a `space*` token would let the density
    // theme resize the avatar (`space20` is 1rem under compact).
    blockSize: 20,
    inlineSize: 20,
    minBlockSize: 20,
  },
  sm: {
    fontSize: vars["--ads-font-size-caption"],
    blockSize: 28,
    inlineSize: 28,
    minBlockSize: 28,
  },
  md: {
    fontSize: vars["--ads-font-size-body"],
    blockSize: 36,
    inlineSize: 36,
    minBlockSize: 36,
  },
  lg: {
    fontSize: vars["--ads-font-size-lead"],
    blockSize: 48,
    inlineSize: 48,
    minBlockSize: 48,
  },
  xl: {
    fontSize: vars["--ads-font-size-heading"],
    blockSize: 64,
    inlineSize: 64,
    minBlockSize: 64,
  },
  // §7 owns the corner: a square identity takes `radiusPanel`, the small-surface
  // corner, instead of minting a per-component value.
  square: {
    borderRadius: vars["--ads-radius-panel"],
  },
  image: {
    /*
     * `blockSize: 100%` only resolves against a definite height, and the rungs
     * used to declare `minBlockSize` alone — so a portrait source fell back to
     * its intrinsic height and sat inside the disc with air above and below
     * instead of filling it. Each rung now states a definite `blockSize` too.
     */
    blockSize: "100%",
    inlineSize: "100%",
    objectFit: "cover",
  },
  fallback: {
    alignItems: "center",
    display: "inline-flex",
    justifyContent: "center",
  },
  statusWrap: {
    display: "inline-flex",
    flexShrink: 0,
    position: "relative",
  },
});

const sizeStyles = {
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
  xl: styles.xl,
  xs: styles.xs,
} as const satisfies Record<AvatarSize, unknown>;
