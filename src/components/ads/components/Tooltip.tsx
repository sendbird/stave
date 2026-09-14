import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import {
  TooltipArrow,
  TooltipPortal,
  TooltipPositioner,
  TooltipPopup,
  TooltipProvider as HeadlessTooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "../headless/tooltip";
import { controlIconSizes } from "../recipes/control-metrics";
import {
  PortalProductThemeScope,
  usePortalProductThemeProps,
} from "../theming/ProductThemeProvider";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import {
  TooltipGroup,
  TooltipGroupBoundary,
  tooltipCloseDelay,
  tooltipOpenDelay,
} from "./Tooltip.group";

export type TooltipIconButtonProps = {
  "aria-label": string;
  children: React.ReactNode;
  /**
   * Disable the button. Forwarded to the rendered `Button`, never to
   * `Tooltip.Trigger` — Base UI's own `disabled` there only silences the
   * tooltip and explicitly does not disable the trigger element.
   */
  disabled?: boolean;
  label: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Optional keyboard binding shown with the shared `Kbd` keycap. */
  shortcut?: React.ReactNode;
} & XstyleProp;

export type TooltipProviderProps = React.ComponentProps<
  typeof HeadlessTooltipProvider
>;

/**
 * Groups neighbouring tooltips and gives them ADS interaction timing.
 *
 * Base UI defaults a standalone tooltip to 600ms; ADS opens the first hint of a
 * group after {@link tooltipOpenDelay}ms of pointer rest and closes it
 * immediately. Base UI's group `timeout` (400ms) then opens every neighbour
 * instantly once one hint has been read, so a reader pays the dwell once per
 * visit to a toolbar rather than once per button. Explicit values still win.
 *
 * Rendering this is now optional for grouping: `Tooltip` and
 * `TooltipIconButton` join the nearest ADS group and start one only where
 * there is none. Render it to widen a group across a subtree, or to give that
 * subtree a different dwell.
 */
export function TooltipProvider({
  closeDelay = tooltipCloseDelay,
  delay = tooltipOpenDelay,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipGroupBoundary>
      <HeadlessTooltipProvider
        {...props}
        closeDelay={closeDelay}
        delay={delay}
      />
    </TooltipGroupBoundary>
  );
}

export type TooltipProps = {
  children: React.ReactElement;
  content: React.ReactNode;
  /**
   * 열리기까지 포인터가 멈춰 있어야 하는 시간(ms). ADS 기본값은 150ms.
   * 그룹이 이미 열려 있는 동안(400ms 창)에는 이웃 툴팁이 즉시 뜨므로 무시된다.
   */
  delay?: number;
  /** 닫히기까지 지연(ms). ADS 기본값은 0ms. */
  closeDelay?: number;
  /**
   * 자체 그룹을 만들지 않는다 — `@delightai/ads/headless`의 Base UI
   * `TooltipProvider` 아래에서 쓰는 이스케이프 해치. ADS `TooltipProvider`
   * 아래에서는 자동으로 합류하므로 더는 필요 없다.
   */
  grouped?: boolean;
  /** 팝업이 뜨는 방향. 기본 top — 뷰포트에 부딪히면 자동으로 뒤집힌다. */
  side?: React.ComponentProps<typeof TooltipPositioner>["side"];
  sideOffset?: number;
  /** Optional keyboard binding shown after the label with the shared `Kbd`. */
  shortcut?: React.ReactNode;
  /**
   * 포지셔너 z-index 오버라이드 — 소비 앱의 고정 크롬이 DS z-스케일
   * (`vars["--ads-z-index-dropdown"]`)보다 높은 레이어(z 900+ 등)를 쓸 때 툴팁이
   * 크롬 뒤에 깔리지 않게 한다.
   */
  zIndex?: number;
} & XstyleProp;

export function Tooltip({
  children,
  closeDelay,
  content,
  delay,
  grouped = false,
  side,
  sideOffset = 8,
  shortcut,
  zIndex,
  xstyle,
}: TooltipProps) {
  // The popup portals out of the provider's subtree, so it carries the brand.
  const portalTheme = usePortalProductThemeProps();
  const theme = themeProps("tooltip");
  const core = (
    <TooltipRoot>
      {/*
       * The delays ride on the trigger, not on a private provider. A per-call
       * provider would be a `FloatingDelayGroup` of one, which is exactly what
       * used to stop the group's instant-follow window from ever applying;
       * Base UI reads a trigger-level `delay` ahead of the group's own, and
       * still overrides both with 0 while the group is in its instant phase.
       */}
      <TooltipTrigger
        closeDelay={closeDelay}
        closeOnClick
        delay={delay}
        render={children}
      />
      <TooltipPortal>
        <PortalProductThemeScope>
          <TooltipPositioner
            className={sx(styles.positioner)}
            side={side}
            sideOffset={sideOffset}
            style={zIndex !== undefined ? { zIndex } : undefined}
          >
            <TooltipPopup
              {...portalTheme}
              {...theme}
              className={cx(
                sx(styles.popup, xstyle),
                theme.className,
                "atelier-motion-tooltip",
              )}
              role="tooltip"
            >
              <TooltipArrow
                {...themeSlotProps("tooltip", "arrow")}
                className={sx(styles.arrow)}
              />
              <TooltipContent content={content} shortcut={shortcut} />
            </TooltipPopup>
          </TooltipPositioner>
        </PortalProductThemeScope>
      </TooltipPortal>
    </TooltipRoot>
  );
  if (grouped) return core;
  return <TooltipGroup>{core}</TooltipGroup>;
}

export function TooltipIconButton({
  children,
  disabled,
  label,
  shortcut,
  xstyle,
  ...props
}: TooltipIconButtonProps) {
  // The popup portals out of the provider's subtree, so it carries the brand.
  const portalTheme = usePortalProductThemeProps();
  const theme = themeProps("tooltip");
  return (
    <TooltipGroup>
      <TooltipRoot>
        {/*
         * Composes `Button` rather than hand-rolling a look-alike trigger —
         * the same rule `Dialog`'s close and `EmptyState`'s action follow.
         *
         * The hand-rolled version was the one icon button in the system
         * outside the icon-button contract: it published neither
         * `data-ads-control-icon-button` nor `--ads-control-icon-size`, so the
         * shared glyph rule in `styles.css` never normalized its child and a
         * lucide icon painted at its intrinsic 24px inside a 40px box — visibly
         * heavier than the identical-looking close buttons beside it. It also
         * had no disabled treatment at all. `Button` publishes the control
         * attributes, the 32px quiet square (`iconSm`) with the shared 16px
         * glyph, and the one disabled language, for free.
         */}
        <TooltipTrigger
          {...props}
          render={
            <Button
              disabled={disabled}
              iconSize={controlIconSizes.md}
              size="iconSm"
              variant="quiet"
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipPortal>
          <PortalProductThemeScope>
            <TooltipPositioner className={sx(styles.positioner)} sideOffset={8}>
              <TooltipPopup
                {...portalTheme}
                {...theme}
                className={cx(
                  sx(styles.popup, xstyle),
                  theme.className,
                  "atelier-motion-tooltip",
                )}
                role="tooltip"
              >
                <TooltipArrow
                  {...themeSlotProps("tooltip", "arrow")}
                  className={sx(styles.arrow)}
                />
                <TooltipContent content={label} shortcut={shortcut} />
              </TooltipPopup>
            </TooltipPositioner>
          </PortalProductThemeScope>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipGroup>
  );
}

function TooltipContent({
  content,
  shortcut,
}: {
  content: React.ReactNode;
  shortcut?: React.ReactNode;
}) {
  return (
    <span
      {...themeSlotProps("tooltip", "content")}
      className={sx(styles.content)}
    >
      <span>{content}</span>
      {shortcut == null ? null : (
        <span className={sx(styles.shortcut)}>
          {typeof shortcut === "string" || typeof shortcut === "number" ? (
            <Kbd size="sm">{shortcut}</Kbd>
          ) : (
            shortcut
          )}
        </span>
      )}
    </span>
  );
}

const styles = stylex.create({
  positioner: {
    zIndex: vars["--ads-z-index-dropdown"],
  },
  popup: {
    backgroundColor: vars["--ads-color-text"],
    borderRadius: vars["--ads-radius-control"],
    // elevationLift — a tooltip is a small hint *attached* to its trigger, not a
    // floating panel: it belongs with the "objects lifted within a surface"
    // step, one below the menu/popover band. It shipped on elevationOverlay, so a
    // two-word label cast the same 15px shadow as a full dropdown
    // (tokens.stylex.ts elevation policy).
    boxShadow: vars["--ads-elevation-lift"],
    color: vars["--ads-color-text-inverted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    // Inline clamp against the anchored space Base UI reports. This is the
    // overflow guard for a tooltip: long content has to WRAP, because the
    // alternative — a block clamp plus `overflow` — would clip the Arrow, which
    // paints outside the popup's border box (the same reason `menu.popupClamp`
    // is opt-in). Base UI flips/shifts the popup on the block axis.
    maxInlineSize: `min(280px, var(--available-width, calc(100dvw - ${vars["--ads-space-32"]})))`,
    // Tooltip padding step: one below Popover's content gutter. A hint that is
    // mostly a single line does not need a panel's margin.
    padding: vars["--ads-space-8"],
  },
  arrow: {
    color: vars["--ads-color-text"],
  },
  content: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  shortcut: {
    display: "inline-flex",
    flexShrink: 0,
  },
});

// Host modification: `../../ui/tooltip` composes Tooltip's canonical keys for
// its compound API, so the style object stays exported.
export { styles as tooltipStyles };
