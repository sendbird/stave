import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

interface RegisteredList {
  count: number;
  focus: (index: number) => void;
}
const lists = new WeakMap<HTMLElement, RegisteredList>();
const focusSelector = "[data-workspace-row-focus]";

/** Workspace identity and logical order survive recycled DOM rows. */
export function SidebarVirtualList<T>(props: {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const virtual = useRef<VirtuosoHandle>(null);
  const pending = useRef<number | null>(null);
  const [scrollParent, setScrollParent] = useState<HTMLElement>();
  const restoreFocus = () => {
    if (pending.current === null) return;
    const row = host.current?.querySelector<HTMLElement>(`[data-sidebar-virtual-index="${pending.current}"] ${focusSelector}`);
    if (!row) return;
    pending.current = null;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setScrollParent(element.closest<HTMLElement>("[data-sidebar-scroll]") ?? undefined);
    lists.set(element, {
      count: props.items.length,
      focus: (index) => {
        pending.current = index;
        virtual.current?.scrollToIndex({ index, align: "center" });
        requestAnimationFrame(restoreFocus);
      },
    });
    return () => { lists.delete(element); };
  }, [props.items.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(focusSelector)) return;
    const key = event.key;
    if (!["ArrowUp", "ArrowDown", "Home", "End", "j", "k"].includes(key)) return;
    const region = host.current?.closest("[data-focus-region]") ?? host.current;
    if (!region) return;
    const registered = [...region.querySelectorAll<HTMLElement>("[data-sidebar-virtual-list]")]
      .map((element) => ({ element, list: lists.get(element) }))
      .filter((entry): entry is { element: HTMLElement; list: RegisteredList } => !!entry.list);
    const currentList = registered.findIndex((entry) => entry.element === host.current);
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

  return <div ref={host} data-sidebar-virtual-list="" role="list" className={sx(styles.host)} onKeyDownCapture={onKeyDown}>
    {scrollParent ? <Virtuoso
      ref={virtual}
      customScrollParent={scrollParent}
      data={props.items as T[]}
      computeItemKey={(_index, item) => props.itemKey(item)}
      defaultItemHeight={40}
      increaseViewportBy={160}
      rangeChanged={() => requestAnimationFrame(restoreFocus)}
      itemContent={(index, item) => <div role="listitem" aria-setsize={props.items.length} aria-posinset={index + 1} data-sidebar-virtual-index={index} className={sx(props.compact ? styles.compactItem : styles.item)}>{props.renderItem(item, index)}</div>}
    /> : null}
  </div>;
}
const styles = stylex.create({
  host: { inlineSize: "100%", minInlineSize: 0 },
  item: { paddingBlockEnd: vars["--aui-space-4"] },
  compactItem: { paddingBlockEnd: vars["--aui-space-2"] },
});
