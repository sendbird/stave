import * as stylex from "@stylexjs/stylex";

import {
  PreviewCardArrow,
  PreviewCardPopup,
  PreviewCardPortal,
  PreviewCardPositioner,
  PreviewCardRoot,
  PreviewCardTrigger,
  type PreviewCardRootProps,
} from "../headless/preview-card";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type RelativeTimeProps = Omit<PreviewCardRootProps, "children"> & {
  /** The instant to render. `Date`, epoch milliseconds, or ISO string. */
  date: Date | number | string;
  /**
   * Reference "current time" for the relative formatting. Pass a fixed value
   * for deterministic rendering (tests, SSR snapshots); defaults to `new
   * Date()` at render time. The component does not tick on its own.
   */
  now?: Date;
  /** Locale for the absolute timestamps in the card (defaults to `en-US`). */
  locale?: string;
  /**
   * The short relative phrase for `date` seen from `now` ("2m ago", "in 3h",
   * the date past a week). Host modification: the bundle's English phrase
   * moved to the host, which formats it in the display language.
   */
  formatRelative: (date: Date, now: Date) => string;
  /** The card's name for Coordinated Universal Time (host-supplied copy). */
  utcLabel: string;
} & XstyleProp;

function formatAbsolute(date: Date, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).format(date);
}

/**
 * Relative timestamp with an absolute-time hover card (a relative-time card).
 * The trigger renders a short relative phrase ("2m ago") — the canonical form
 * for scannable surfaces like table cells and activity feeds; hovering or focusing it opens a card with the absolute UTC
 * and local times, so nobody has to do timezone math in their head.
 *
 * Built on the Base UI preview-card (hover/focus open, dismiss, positioning —
 * nothing hand-rolled). Pass `now` for deterministic output.
 */
export function RelativeTime({
  date,
  formatRelative,
  locale = "en-US",
  now,
  utcLabel,
  xstyle,
  ...props
}: RelativeTimeProps) {
  const parsed = date instanceof Date ? date : new Date(date);
  const reference = now ?? new Date();
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const triggerTheme = themeProps("relative-time");
  const panelTheme = themeProps("relative-time-panel");

  return (
    <PreviewCardRoot {...props}>
      <PreviewCardTrigger
        {...triggerTheme}
        className={cx(
          sx(styles.trigger, transition.colors, focusRing.ring),
          triggerTheme.className,
        )}
        render={<button type="button" />}
      >
        <time dateTime={parsed.toISOString()}>
          {formatRelative(parsed, reference)}
        </time>
      </PreviewCardTrigger>
      <PreviewCardPortal>
        <PreviewCardPositioner className={sx(styles.positioner)} sideOffset={8}>
          <PreviewCardPopup
            {...panelTheme}
            className={cx(
              sx(styles.popup, xstyle),
              panelTheme.className,
              "atelier-motion-dropdown",
            )}
          >
            <PreviewCardArrow className={sx(styles.arrow)} />
            <dl className={sx(styles.rows)}>
              <div className={sx(styles.row)}>
                <dt
                  {...themeSlotProps("relative-time-panel", "zone")}
                  className={sx(styles.zone)}
                >
                  {utcLabel}
                </dt>
                <dd
                  {...themeSlotProps("relative-time-panel", "timestamp")}
                  className={sx(styles.timestamp)}
                >
                  {formatAbsolute(parsed, locale, "UTC")}
                </dd>
              </div>
              <div className={sx(styles.row)}>
                <dt
                  {...themeSlotProps("relative-time-panel", "zone")}
                  className={sx(styles.zone)}
                >
                  {localTimeZone}
                </dt>
                <dd
                  {...themeSlotProps("relative-time-panel", "timestamp")}
                  className={sx(styles.timestamp)}
                >
                  {formatAbsolute(parsed, locale)}
                </dd>
              </div>
            </dl>
          </PreviewCardPopup>
        </PreviewCardPositioner>
      </PreviewCardPortal>
    </PreviewCardRoot>
  );
}

const styles = stylex.create({
  /**
   * Inline text affordance, NOT a quiet trigger: this renders mid-sentence in
   * a table cell or activity feed, so `controlChrome.triggerQuiet`'s hover
   * wash would paint a block behind running text. It keeps the dotted-underline
   * language instead; only the transition moves to the shared recipe, which
   * carries the `prefers-reduced-motion` override the local triplet lacked.
   */
  trigger: {
    appearance: "none",
    backgroundColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 0,
    color: {
      default: vars["--ads-color-text-muted"],
      "@media (hover: hover)": {
        default: vars["--ads-color-text-muted"],
        ":hover": vars["--ads-color-text"],
      },
    },
    cursor: "default",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontVariantNumeric: "tabular-nums",
    padding: 0,
    textDecorationColor: vars["--ads-color-border-strong"],
    textDecorationLine: {
      default: "none",
      "@media (hover: hover)": {
        default: "none",
        ":hover": "underline",
      },
    },
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3,
  },
  positioner: {
    zIndex: vars["--ads-z-index-dropdown"],
  },
  popup: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // elevationOverlay — an anchored transient popup, the same band as Popover and
    // PreviewCard. Confirmed against the elevation policy in
    // `tokens.stylex.ts`; unchanged.
    boxShadow: vars["--ads-elevation-overlay"],
    color: vars["--ads-color-text"],
    transformOrigin: "var(--transform-origin)",
  },
  arrow: {
    color: vars["--ads-color-surface-raised"],
  },
  rows: {
    display: "grid",
    gap: vars["--ads-space-8"],
    margin: 0,
    padding: vars["--ads-space-12"],
  },
  row: {
    alignItems: "baseline",
    display: "flex",
    gap: vars["--ads-space-16"],
    justifyContent: "space-between",
  },
  zone: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  timestamp: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    margin: 0,
    whiteSpace: "nowrap",
  },
});
