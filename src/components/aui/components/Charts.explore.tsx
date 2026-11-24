import { useCallback, useId, useState } from "react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { focusRing } from "../recipes/focus-ring";
import { sx } from "../utils/stylex";
import { styles } from "./Charts.styles";
import { VisuallyHidden } from "./VisuallyHidden";

/*
 * Keyboard exploration for the axis charts.
 *
 * recharts' own `accessibilityLayer` steps with ArrowLeft/ArrowRight only, has
 * no Home/End, draws no focus ring and announces nothing, so AUI keeps it off
 * and owns the model: the plot is one Tab stop, the arrows move an active
 * category, and the active category drives the tooltip (so sighted keyboard
 * users see what a pointer would) and a polite live readout (so a screen
 * reader hears the same values the tooltip shows).
 */

export type ChartExplorer = {
  /** Category index the keyboard has made active, or null. */
  activeIndex: number | null;
  enabled: boolean;
  onBlur: () => void;
  /** Enter/Space on the active point calls this (see `onSelectPoint`). */
  selectable: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Text announced for the active category. */
  readout: string;
};

export function useChartExplorer({
  count,
  describe,
  enabled,
  onSelect,
}: {
  count: number;
  /** One sentence for a category: label and every value the tooltip shows. */
  describe: (index: number) => string;
  enabled: boolean;
  /** Enter or Space on the active category (drill-down). */
  onSelect?: (index: number) => void;
}): ChartExplorer {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const clamp = useCallback(
    (index: number) => Math.max(0, Math.min(count - 1, index)),
    [count],
  );
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (count === 0) return;
      let next: number | null | undefined;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = activeIndex == null ? 0 : clamp(activeIndex + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = activeIndex == null ? count - 1 : clamp(activeIndex - 1);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = count - 1;
          break;
        case "Enter":
        case " ":
          if (activeIndex == null || !onSelect) return;
          event.preventDefault();
          onSelect(activeIndex);
          return;
        case "Escape":
          // Only consume Escape while a point is active; otherwise it belongs
          // to the enclosing Dialog or PeekPanel.
          if (activeIndex == null) return;
          next = null;
          break;
        default:
          return;
      }
      event.preventDefault();
      setActiveIndex(next);
    },
    [activeIndex, clamp, count, onSelect],
  );
  const onBlur = useCallback(() => setActiveIndex(null), []);
  const index = activeIndex != null && activeIndex < count ? activeIndex : null;
  return {
    activeIndex: enabled ? index : null,
    enabled,
    onBlur,
    onKeyDown,
    readout: enabled && index != null ? describe(index) : "",
    selectable: onSelect != null,
  };
}

/** The focusable plot surface and its live readout. */
export function ChartExploreSurface({
  children,
  explorer,
  label,
  labelledBy,
}: {
  children: React.ReactNode;
  explorer: ChartExplorer;
  label?: string;
  /** Heading id naming the plot when the title is not plain text. */
  labelledBy?: string;
}) {
  useTranslation();
  const hintId = `atelier-chart-hint-${useId()}`;
  if (!explorer.enabled) return <>{children}</>;
  return (
    <div
      aria-describedby={hintId}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-roledescription={i18n.t("ui:chart.roleDescription")}
      className={sx(styles.explore, focusRing.ring)}
      onBlur={explorer.onBlur}
      onKeyDown={explorer.onKeyDown}
      role="group"
      tabIndex={0}
    >
      {children}
      <VisuallyHidden id={hintId}>
        {explorer.selectable
          ? i18n.t("ui:chart.exploreHintSelectable")
          : i18n.t("ui:chart.exploreHint")}
      </VisuallyHidden>
      <VisuallyHidden aria-live="polite" data-chart-readout="">
        {explorer.readout}
      </VisuallyHidden>
    </div>
  );
}

/**
 * The `keyboard` default for the axis charts: on for a titled chart, off for an
 * untitled one. A title is what makes a plot a named thing a keyboard user can
 * be told they reached; an untitled plot is usually a figure inside another
 * control, where an extra Tab stop is a dead one.
 */
export function keyboardByDefault(title: React.ReactNode) {
  return title != null && title !== false && title !== "";
}

export { formatDelta } from "./Charts.format";

/**
 * The recharts `Tooltip` props that pin the tooltip to the keyboard-active
 * category. Pass `explorerTooltipKey` as the element's `key` beside them.
 */
export function explorerTooltipProps(explorer: ChartExplorer) {
  const active = explorer.activeIndex != null;
  return {
    active: active ? true : undefined,
    defaultIndex: active ? (explorer.activeIndex ?? undefined) : undefined,
  } as const;
}

/**
 * The `Tooltip` key that re-seeds recharts' index, which it reads only on
 * mount. Its own helper because a key must be written on the element: it
 * used to ride in `explorerTooltipProps`, and spreading an object holding
 * `key` is a React warning (every waterfall, pareto, box plot, candlestick,
 * violin and scatter chart logged one).
 */
export function explorerTooltipKey(explorer: ChartExplorer): string {
  return explorer.activeIndex != null
    ? `kbd-${explorer.activeIndex}`
    : "pointer";
}

/**
 * Keyboard exploration for the DOM-drawn row charts (Bullet, Dumbbell,
 * Slope): the list is one Tab stop, arrows move the active row, Home/End
 * reach the ends, Enter selects, Escape clears. Spread `containerProps` on
 * the list's wrapper and render `readout` in a polite live region.
 */
export function useRowExplorer({
  count,
  describe,
  label,
  onSelect,
}: {
  count: number;
  describe: (index: number) => string;
  label?: string;
  onSelect?: (index: number) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    const last = count - 1;
    let next: number | null | undefined;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = active == null ? 0 : Math.min(last, active + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = active == null ? last : Math.max(0, active - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Enter":
      case " ":
        if (active == null || !onSelect) return;
        event.preventDefault();
        onSelect(active);
        return;
      case "Escape":
        if (active == null) return;
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
  };
  const index = active != null && active < count ? active : null;
  return {
    active: index,
    containerProps: {
      "aria-label": label,
      "aria-roledescription": "chart",
      onBlur: () => setActive(null),
      onKeyDown,
      role: "group",
      tabIndex: 0,
    } as const,
    readout: index != null ? describe(index) : "",
  };
}
