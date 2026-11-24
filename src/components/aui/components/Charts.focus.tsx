import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type * as React from "react";
import {
  Rectangle,
  type MouseHandlerDataParam,
  type RectangleProps,
} from "recharts";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

/*
 * Hover focus for bar marks (2026-11 refresh): while a category is hovered or
 * keyboard-active, every other category's bars fall back so the one being read
 * stands out — the focus-plus-context treatment every reference kit uses. The
 * active index lives in a small store each bar subscribes to, so a hover only
 * re-renders the bars, never the chart.
 */

/** The focused category, and whether the keyboard (not a pointer) put it there. */
type Focus = { index: number | null; keyboard: boolean };

type IndexStore = {
  get: () => Focus;
  set: (index: number | null, keyboard?: boolean) => void;
  subscribe: (listener: () => void) => () => void;
};

function createIndexStore(): IndexStore {
  let current: Focus = { index: null, keyboard: false };
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (index, keyboard = false) => {
      if (index === current.index && keyboard === current.keyboard) return;
      current = { index, keyboard };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type RootHandler = (
  state: MouseHandlerDataParam,
  event: React.MouseEvent<SVGGraphicsElement>,
) => void;
type RootHandlers = {
  onMouseLeave?: RootHandler;
  onMouseMove?: RootHandler;
} & Record<string, unknown>;

/** Ink the other categories keep while one is focused. */
export const UNFOCUSED_BAR_OPACITY = 0.35;

/**
 * The focus store plus recharts root handlers that feed it, merged over the
 * handlers the chart already spreads (`others`). The keyboard-active index
 * focuses the same way when the pointer is not over the plot.
 */
export function useBarFocus(
  keyboardIndex: number | null,
  others: RootHandlers = {},
) {
  const [store] = useState(createIndexStore);
  const pointer = useRef(false);
  useEffect(() => {
    if (!pointer.current) store.set(keyboardIndex, true);
  }, [keyboardIndex, store]);
  const handlers = {
    ...others,
    onMouseLeave: ((state, event) => {
      pointer.current = false;
      store.set(keyboardIndex, keyboardIndex != null);
      others.onMouseLeave?.(state, event);
    }) satisfies RootHandler,
    onMouseMove: ((state, event) => {
      const raw = state?.activeTooltipIndex;
      const index = raw == null ? NaN : Number(raw);
      pointer.current = Number.isInteger(index);
      if (Number.isInteger(index)) store.set(index);
      else store.set(keyboardIndex, keyboardIndex != null);
      others.onMouseMove?.(state, event);
    }) satisfies RootHandler,
  };
  return { handlers, store };
}

type FocusBarProps = RectangleProps & {
  focusStore: IndexStore;
  index?: number;
};

function FocusBar({ focusStore, index, ...props }: FocusBarProps) {
  // Each bar subscribes to its own reading ("on", "off" or "none", plus the
  // input), so moving focus re-renders only the bars whose state changed.
  const read = () => {
    const { index: active, keyboard } = focusStore.get();
    return `${active == null ? "none" : active === index ? "on" : "off"}:${keyboard ? "k" : "p"}`;
  };
  const state = useSyncExternalStore(focusStore.subscribe, read, read);
  const unfocusedNow = state.startsWith("off");
  const keyboard = state.endsWith(":k");
  const base = props.fillOpacity == null ? 1 : Number(props.fillOpacity);
  const unfocused = unfocusedNow;
  return (
    <Rectangle
      {...props}
      // A pointer fades the others over the fast step; a keyboard step is
      // instant (frequent and deliberate, so the frequency gate drops motion).
      className={cx(props.className, sx(!keyboard && styles.bar))}
      fillOpacity={unfocused ? base * UNFOCUSED_BAR_OPACITY : props.fillOpacity}
    />
  );
}

/** A recharts `shape` for `<Bar>` that falls back when another category is focused. */
export const focusBarShape = (store: IndexStore) =>
  function shape(props: unknown) {
    return <FocusBar {...(props as RectangleProps)} focusStore={store} />;
  };

const styles = stylex.create({
  bar: {
    transitionDuration: {
      default: vars["--aui-motion-duration-fast"],
      // Opacity only: reduced motion shortens the fade rather than removing it.
      "@media (prefers-reduced-motion: reduce)": "60ms",
    },
    transitionProperty: "fill-opacity",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
