import * as stylex from "@stylexjs/stylex";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "@/i18n";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "@/components/ads/utils/stylex";
import {
  findProviderIdentity,
  providerInkColor,
} from "@/lib/providers/provider-identity";
import type { ProviderId } from "@/lib/providers/provider.types";

/** 10px on an avatar's corner, 14px beside a name, 16px in a row or a picker. */
export type ProviderMarkSize = "xs" | "sm" | "md";

export interface ProviderMarkProps extends XstyleProp {
  providerId: ProviderId;
  size?: ProviderMarkSize;
  /**
   * Names the provider for this mark alone: a hover title plus visually hidden
   * text. Leave it out where the provider is already named beside the mark;
   * the mark itself is decorative (`alt=""`, `aria-hidden`).
   */
  label?: string;
  /** Sizing from a caller's own StyleX class (the `ModelIcon` call sites). */
  className?: string;
}

/**
 * A provider's mark: the vendor's SVG where Stave ships one, otherwise its
 * monogram in the provider's ink on a tint of the same ink. Both come from the
 * provider identity registry, so a new provider needs no new mark code.
 */
export function ProviderMark({
  providerId,
  size = "md",
  label,
  className,
  xstyle,
}: ProviderMarkProps) {
  useTranslation();
  const [failed, setFailed] = useState(false);
  const identity = findProviderIdentity(providerId);
  if (!identity) {
    return null;
  }
  const mark =
    identity.markUrl && !failed ? (
      <img
        src={identity.markUrl}
        alt=""
        aria-hidden
        className={cx(sx(styles.image, sizeStyles[size], xstyle), className)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    ) : (
      <span
        aria-hidden
        data-provider-monogram={identity.providerId}
        className={cx(
          sx(styles.monogram, sizeStyles[size], monogramTextStyles[size], xstyle),
          className,
        )}
        style={{ "--provider-mark-ink": providerInkColor(providerId) } as CSSProperties}
      >
        {/* A 10px mark has room for one letter only. */}
        {size === "xs" ? identity.monogram.slice(0, 1) : identity.monogram}
      </span>
    );
  if (!label) {
    return mark;
  }
  return (
    <span className={sx(styles.labelled)} title={label}>
      {mark}
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}

const styles = stylex.create({
  image: {
    display: "block",
    flexShrink: 0,
    objectFit: "contain",
  },
  // The provider's own ink on a tint of it, so the letters read as that
  // provider in every theme without a token of their own.
  monogram: {
    alignItems: "center",
    backgroundColor:
      "color-mix(in oklch, var(--provider-mark-ink) 16%, transparent)",
    borderRadius: vars["--ads-radius-mark"],
    color: "var(--provider-mark-ink)",
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: vars["--ads-font-weight-semibold"],
    justifyContent: "center",
    letterSpacing: "-0.02em",
    lineHeight: 1,
    overflow: "hidden",
    userSelect: "none",
  },
  labelled: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
});

// `width`/`height`, the properties the `ModelIcon` call sites size the mark
// with, so a caller's class overrides these the way it always has.
const sizeStyles = stylex.create({
  xs: { height: 10, width: 10 },
  sm: { height: 14, width: 14 },
  md: { height: 16, width: 16 },
});

// The 16px mark keeps the type ramp's smallest step; below it the letters are
// sized to the box, since two of them have to fit a 14px square.
const monogramTextStyles = stylex.create({
  xs: { fontSize: 7 },
  sm: { fontSize: 9 },
  md: { fontSize: vars["--ads-font-size-micro"] },
});
