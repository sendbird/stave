import * as React from "react";

/**
 * DOM and children helpers for `windowed-list.ts` — the parts of the seam that
 * read layout or walk a React tree, split out so the hook file stays about
 * windowing decisions.
 */

/** The attribute a windowed row carries; the value is its data index. */
export const WINDOWED_INDEX_ATTRIBUTE = "data-windowed-index";

export type ScrollOwner = HTMLElement | Window;

export function isWindow(owner: ScrollOwner): owner is Window {
  return typeof window !== "undefined" && owner === window;
}

/**
 * The owner's offset observer, with a scroll-end report that is read live.
 *
 * batch4-x2 (2026-11-14). The library's observer debounces a "scrolling
 * stopped" callback 150ms after the last scroll event, and that callback
 * replays the offset captured by that last event rather than reading the owner
 * again. `useWindowedList` moves the owner itself (rule 4: an insert above
 * the leading row scrolls by the inserted height), and the browser dispatches
 * that scroll's event a frame later. When the debounce landed inside that
 * frame it handed the virtualizer the offset from before the move; the next
 * measurement correction then scrolled the owner back to it, and a reader who
 * had just scrolled up lost their place when history was prepended (about one
 * load in eight in `virtualization.spec.ts`). A report that scrolling stopped
 * therefore carries where the owner is now.
 */
export function observeLiveOffset<Instance, Result>(
  observe: (
    instance: Instance,
    callback: (offset: number, isScrolling: boolean) => void,
  ) => Result,
  read: (instance: Instance) => number | null,
) {
  return (
    instance: Instance,
    callback: (offset: number, isScrolling: boolean) => void,
  ): Result =>
    observe(instance, (offset, isScrolling) =>
      callback(isScrolling ? offset : (read(instance) ?? offset), isScrolling),
    );
}

const SCROLLING = new Set(["auto", "overlay", "scroll"]);

/**
 * Nearest element at or above `from` that scrolls vertically, else the page.
 * `overflow: hidden` is not a scroll owner: it clips, and the reader cannot
 * scroll it.
 */
export function findScrollOwner(from: HTMLElement): ScrollOwner {
  const root = from.ownerDocument;
  let node: HTMLElement | null = from;
  while (node && node !== root.body && node !== root.documentElement) {
    if (SCROLLING.has(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return root.defaultView ?? window;
}

/** Top of the container's content box, in the owner's scroll coordinates. */
export function contentOffset(
  container: HTMLElement,
  owner: ScrollOwner,
): number {
  const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
  if (owner === container) return paddingTop;
  const top =
    container.getBoundingClientRect().top + container.clientTop + paddingTop;
  if (isWindow(owner)) return top + owner.scrollY;
  const ownerRect = owner.getBoundingClientRect();
  return top - ownerRect.top - owner.clientTop + owner.scrollTop;
}

export function ownerOffset(owner: ScrollOwner): number {
  return isWindow(owner) ? owner.scrollY : owner.scrollTop;
}

export function ownerRect(owner: ScrollOwner) {
  return isWindow(owner)
    ? { height: owner.innerHeight, width: owner.innerWidth }
    : { height: owner.clientHeight, width: owner.clientWidth };
}

/**
 * Index of the row that holds `target`: the outermost windowed row between the
 * target and the container, so a windowed list nested inside a row (a
 * transcript inside a turn) is not mistaken for this one.
 */
export function rowIndexOf(target: EventTarget | null, container: HTMLElement) {
  let node = target instanceof Element ? target : null;
  let row: Element | null = null;
  while (node && node !== container) {
    if (node.hasAttribute(WINDOWED_INDEX_ATTRIBUTE)) row = node;
    node = node.parentElement;
  }
  if (node !== container || !row) return null;
  const index = Number(row.getAttribute(WINDOWED_INDEX_ATTRIBUTE));
  return Number.isInteger(index) ? index : null;
}

/** One row of a compound list's children, with a key unique across fragments. */
export type WindowedChild = { key: string; node: React.ReactNode };

/**
 * Flatten compound children into rows. `Children.toArray` flattens arrays but
 * not fragments, and a fragment of turns is still several rows to window.
 */
export function flattenWindowedChildren(
  children: React.ReactNode,
  prefix = "",
): WindowedChild[] {
  const rows: WindowedChild[] = [];
  React.Children.toArray(children).forEach((child, position) => {
    const key =
      React.isValidElement(child) && child.key != null
        ? String(child.key)
        : `.${position}`;
    if (React.isValidElement(child) && child.type === React.Fragment) {
      const nested = (child.props as { children?: React.ReactNode }).children;
      rows.push(...flattenWindowedChildren(nested, `${prefix}${key}/`));
      return;
    }
    rows.push({ key: `${prefix}${key}`, node: child });
  });
  return rows;
}
