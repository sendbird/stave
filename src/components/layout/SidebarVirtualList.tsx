import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { focusWhenMounted, useWindowedList } from "@/hooks/use-windowed-list";

interface RegisteredList {
  count: number;
  focus: (index: number) => void;
}
const lists = new WeakMap<HTMLElement, RegisteredList>();
const focusSelector = "[data-workspace-row-focus]";

/** Lists up to this many rows render every row, exactly as a plain list. */
export const SIDEBAR_WINDOW_THRESHOLD = 60;

/**
 * A sidebar workspace list. Short lists render every row with no box of their
 * own, so the parent's gap and alignment apply unchanged. Past the threshold
 * only rows near the sidebar's view render, with measured heights and the
 * parent's gap (`gap`, the same token) as padding between rows; the focused row
 * stays mounted. Workspace identity and logical order survive recycled rows,
 * and ↑/↓ (j/k), Home and End move across every list of the sidebar.
 */
export function SidebarVirtualList<T>(props: {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** The parent's row gap, in AUI space steps. */
  gap: keyof typeof gapStyles;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const keys = useMemo(() => props.items.map(props.itemKey), [props.items, props.itemKey]);
  const enabled = keys.length > SIDEBAR_WINDOW_THRESHOLD;
  const windowed = useWindowedList({
    keys,
    estimateSize: 40,
    // Lists with the same gap draw the same kind of row.
    sizeGroup: `sidebar-gap-${props.gap}`,
    enabled,
    overscan: 400,
    initialCount: 40,
    scrollOwner: (list) => list.closest<HTMLElement>("[data-sidebar-scroll]"),
  });
  const { listRef: setWindowedList } = windowed;
  const hostRef = useCallback((element: HTMLElement | null) => {
    setHost(element);
    setWindowedList(element);
  }, [setWindowedList]);
  const latest = useRef({ windowed, enabled });
  latest.current = { windowed, enabled };
  useEffect(() => {
    if (!host) return;
    lists.set(host, {
      count: keys.length,
      focus: (index) => {
        if (latest.current.enabled) latest.current.windowed.scrollToIndex(index);
        focusWhenMounted(() => host.querySelector<HTMLElement>(`[data-sidebar-virtual-index="${index}"] ${focusSelector}`));
      },
    });
    return () => { lists.delete(host); };
  }, [host, keys.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(focusSelector) || !host) return;
    const key = event.key;
    if (!["ArrowUp", "ArrowDown", "Home", "End", "j", "k"].includes(key)) return;
    const region = host.closest("[data-focus-region]") ?? host;
    const registered = [...region.querySelectorAll<HTMLElement>("[data-sidebar-virtual-list]")]
      .map((element) => ({ element, list: lists.get(element) }))
      .filter((entry): entry is { element: HTMLElement; list: RegisteredList } => !!entry.list);
    const currentList = registered.findIndex((entry) => entry.element === host);
    const currentIndex = Number(target.closest<HTMLElement>("[data-sidebar-virtual-index]")?.dataset.sidebarVirtualIndex);
    if (currentList < 0 || !Number.isInteger(currentIndex)) return;
    const count = registered.reduce((sum, entry) => sum + entry.list.count, 0);
    let next = registered.slice(0, currentList).reduce((sum, entry) => sum + entry.list.count, 0) + currentIndex;
    next = key === "Home" ? 0 : key === "End" ? count - 1 : next + (key === "ArrowUp" || key === "k" ? -1 : 1);
    if (next < 0 || next >= count) return;
    event.preventDefault();
    event.stopPropagation();
    for (const entry of registered) {
      if (next < entry.list.count) { entry.list.focus(next); return; }
      next -= entry.list.count;
    }
  };

  const listItem = (item: T, index: number) => ({
    role: "listitem",
    "aria-setsize": keys.length,
    "aria-posinset": index + 1,
    "data-sidebar-virtual-index": index,
    children: props.renderItem(item, index),
  });
  return <div ref={hostRef} data-sidebar-virtual-list="" role="list" className={sx(enabled ? styles.windowed : styles.plain)} onKeyDownCapture={onKeyDown}>
    {enabled
      ? windowed.slots.map((slot) => slot.kind === "gap"
        ? <div key={slot.key} aria-hidden="true" className={sx(styles.spacer)} style={{ blockSize: slot.size }} />
        : <div key={slot.key} ref={windowed.measureRef} data-windowed-key={slot.key} {...listItem(props.items[slot.index]!, slot.index)}
          className={sx(styles.windowedItem, slot.index > 0 && gapStyles[props.gap])} />)
      : props.items.map((item, index) => <div key={keys[index]} {...listItem(item, index)} className={sx(styles.plain)} />)}
  </div>;
}

const styles = stylex.create({
  // No box: rows are the parent's own flex items, as in a plain list.
  plain: { display: "contents" },
  // A column that keeps the parent's cross-axis alignment for its rows.
  windowed: {
    alignItems: "inherit",
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    minInlineSize: 0,
  },
  windowedItem: { minInlineSize: 0 },
  spacer: { flexShrink: 0 },
});

const gapStyles = stylex.create({
  2: { paddingBlockStart: vars["--aui-space-2"] },
  4: { paddingBlockStart: vars["--aui-space-4"] },
  8: { paddingBlockStart: vars["--aui-space-8"] },
});
