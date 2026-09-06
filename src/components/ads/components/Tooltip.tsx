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
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Button } from "./Button";

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
};

export type TooltipProviderProps = React.ComponentProps<
  typeof HeadlessTooltipProvider
>;

/**
 * Groups neighbouring tooltips and gives them ADS interaction timing.
 *
 * Base UI intentionally defaults a standalone tooltip to 600ms. That is a
 * conservative browser-wide default, but it made repeated inspection in ADS
 * toolbars and dense product chrome feel unresponsive. ADS uses 300ms for the
 * first hint, then keeps Base UI's grouped instant-follow behaviour for nearby
 * triggers. Explicit values still win.
 */
export function TooltipProvider({
  closeDelay = 0,
  delay = 300,
  ...props
}: TooltipProviderProps) {
  return (
    <HeadlessTooltipProvider
      {...props}
      closeDelay={closeDelay}
      delay={delay}
    />
  );
}

export type TooltipProps = {
  children: React.ReactElement;
  content: React.ReactNode;
  /** 열리기까지 지연(ms). ADS 기본값은 300ms. `grouped`면 무시된다. */
  delay?: number;
  /** 닫히기까지 지연(ms). `grouped`면 무시된다. */
  closeDelay?: number;
  /**
   * 조상 `TooltipProvider`의 지연/그룹핑(인접 툴팁 즉시 표시)에 합류한다 —
   * 자체 Provider를 만들지 않으므로 툴바처럼 버튼이 이웃한 표면에서 쓴다.
   */
  grouped?: boolean;
  /** 팝업이 뜨는 방향. 기본 top — 뷰포트에 부딪히면 자동으로 뒤집힌다. */
  side?: React.ComponentProps<typeof TooltipPositioner>["side"];
  sideOffset?: number;
  /**
   * 포지셔너 z-index 오버라이드 — 소비 앱의 고정 크롬이 DS z-스케일
   * (`vars.zIndexDropdown`)보다 높은 레이어(z 900+ 등)를 쓸 때 툴팁이
   * 크롬 뒤에 깔리지 않게 한다.
   */
  zIndex?: number;
};

export function Tooltip({
  children,
  closeDelay,
  content,
  delay,
  grouped = false,
  side,
  sideOffset = 8,
  zIndex,
}: TooltipProps) {
  const core = (
    <TooltipRoot>
      <TooltipTrigger closeOnClick render={children} />
      <TooltipPortal>
        <TooltipPositioner
          className={sx(styles.positioner)}
          side={side}
          sideOffset={sideOffset}
          style={zIndex !== undefined ? { zIndex } : undefined}
        >
          <TooltipPopup
            className={cx(sx(styles.popup), "atelier-motion-tooltip")}
          >
            <TooltipArrow className={sx(styles.arrow)} />
            {content}
          </TooltipPopup>
        </TooltipPositioner>
      </TooltipPortal>
    </TooltipRoot>
  );
  if (grouped) return core;
  return (
    <TooltipProvider closeDelay={closeDelay} delay={delay}>
      {core}
    </TooltipProvider>
  );
}

export function TooltipIconButton({
  children,
  disabled,
  label,
  ...props
}: TooltipIconButtonProps) {
  return (
    <TooltipProvider>
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
          <TooltipPositioner className={sx(styles.positioner)} sideOffset={8}>
            <TooltipPopup
              className={cx(sx(styles.popup), "atelier-motion-tooltip")}
            >
              <TooltipArrow className={sx(styles.arrow)} />
              {label}
            </TooltipPopup>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  );
}

const styles = stylex.create({
  positioner: {
    zIndex: vars.zIndexDropdown,
  },
  popup: {
    backgroundColor: vars.colorText,
    borderRadius: vars.radiusControl,
    // elevationLift — a tooltip is a small hint *attached* to its trigger, not a
    // floating panel: it belongs with the "objects lifted within a surface"
    // step, one below the menu/popover band. It shipped on elevationOverlay, so a
    // two-word label cast the same 15px shadow as a full dropdown
    // (tokens.stylex.ts elevation policy).
    boxShadow: vars.elevationLift,
    color: vars.colorTextInverted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    // Inline clamp against the anchored space Base UI reports. This is the
    // overflow guard for a tooltip: long content has to WRAP, because the
    // alternative — a block clamp plus `overflow` — would clip the Arrow, which
    // paints outside the popup's border box (the same reason `menu.popupClamp`
    // is opt-in). Base UI flips/shifts the popup on the block axis.
    maxInlineSize: `min(280px, var(--available-width, calc(100dvw - ${vars.space32})))`,
    // Tooltip padding step: one below Popover's content gutter. A hint that is
    // mostly a single line does not need a panel's margin.
    padding: vars.space8,
  },
  arrow: {
    color: vars.colorText,
  },
});

export { styles as tooltipStyles };
