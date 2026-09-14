import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type * as React from "react";

import {
  TabsList,
  TabsPanel,
  TabsRoot,
  TabsTab,
  type TabsRootProps,
} from "../headless/tabs";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import {
  themeProps,
  themeSlotProps,
} from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { VisuallyHidden } from "./VisuallyHidden";
import { tabHeightBySize, type TabsSize } from "./Tabs.styles";
import {
  sessionActionSizeStyles,
  sessionTabStyles as styles,
} from "./Tabs.session.styles";

export type SessionTabItem = {
  /** Accessible close name when `label` is not plain text. */
  closeLabel?: string;
  closable?: boolean;
  content: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

export type SessionTabsProps = Omit<
  TabsRootProps,
  | "children"
  | "className"
  | "defaultValue"
  | "onValueChange"
  | "orientation"
  | "value"
> & {
  addLabel?: string;
  defaultValue?: string;
  items: SessionTabItem[];
  label?: string;
  onAdd?: () => void;
  onClose?: (value: string) => void;
  /** Controlled logical order emitted by mouse drag and keyboard moves. */
  onReorder?: (nextValues: string[]) => void;
  onValueChange?: (value: string) => void;
  size?: TabsSize;
  value?: string;
} & XstyleProp;

/**
 * Browser-style session tabs: close/add actions, controlled reordering, and
 * explicit overflow controls around one standards-compliant tablist.
 */
export function SessionTabs({
  addLabel = "Add tab",
  defaultValue,
  items,
  label = "Open sessions",
  onAdd,
  onClose,
  onReorder,
  onValueChange,
  size = "sm",
  value,
  xstyle,
  ...props
}: SessionTabsProps) {
  const firstEnabled = items.find((item) => !item.disabled)?.value ?? "";
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? firstEnabled,
  );
  const selectedValue = value ?? internalValue;
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLElement>());
  const draggedValue = useRef<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overflow, setOverflow] = useState({
    canBack: false,
    canForward: false,
    present: false,
  });
  const [announcement, setAnnouncement] = useState("");

  const select = useCallback(
    (nextValue: string) => {
      if (value === undefined) setInternalValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  useEffect(() => {
    if (items.some((item) => item.value === selectedValue)) return;
    const next = items.find((item) => !item.disabled)?.value ?? "";
    select(next);
  }, [items, select, selectedValue]);

  useLayoutEffect(() => {
    const next = pendingFocus.current;
    if (!next) return;
    const tab = tabRefs.current.get(next);
    if (!tab) return;
    tab.focus();
    pendingFocus.current = null;
  }, [items, selectedValue]);

  const measureOverflow = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const present = list.scrollWidth > list.clientWidth + 1;
    const rtl = getComputedStyle(list).direction === "rtl";
    const logicalScrollLeft = rtl ? Math.abs(list.scrollLeft) : list.scrollLeft;
    setOverflow({
      canBack: present && logicalScrollLeft > 1,
      canForward:
        present && logicalScrollLeft + list.clientWidth < list.scrollWidth - 1,
      present,
    });
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    measureOverflow();
    const resizeObserver = new ResizeObserver(measureOverflow);
    const mutationObserver = new MutationObserver(measureOverflow);
    resizeObserver.observe(list);
    mutationObserver.observe(list, { childList: true, subtree: true });
    list.addEventListener("scroll", measureOverflow, { passive: true });
    return () => {
      list.removeEventListener("scroll", measureOverflow);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [measureOverflow]);

  useLayoutEffect(() => {
    const selectedTab = tabRefs.current.get(selectedValue);
    if (!selectedTab) return;
    selectedTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    measureOverflow();
  }, [items, measureOverflow, selectedValue]);

  const reorder = (fromValue: string, toValue: string, after: boolean) => {
    if (!onReorder || fromValue === toValue) return;
    const current = items.map((item) => item.value);
    const next = current.filter((entry) => entry !== fromValue);
    const target = next.indexOf(toValue);
    if (target < 0) return;
    next.splice(target + (after ? 1 : 0), 0, fromValue);
    onReorder(next);
    const position = next.indexOf(fromValue) + 1;
    setAnnouncement(`Tab moved to position ${position} of ${next.length}.`);
    pendingFocus.current = fromValue;
  };

  const moveByKeyboard = (item: SessionTabItem, direction: -1 | 1) => {
    const index = items.findIndex(
      (candidate) => candidate.value === item.value,
    );
    const target = items[index + direction];
    if (!target) return;
    reorder(item.value, target.value, direction === 1);
  };

  const close = (item: SessionTabItem) => {
    const index = items.findIndex(
      (candidate) => candidate.value === item.value,
    );
    const remaining = items.filter(
      (candidate) => candidate.value !== item.value && !candidate.disabled,
    );
    const next =
      items.slice(index + 1).find((candidate) => !candidate.disabled) ??
      [...items.slice(0, index)]
        .reverse()
        .find((candidate) => !candidate.disabled) ??
      remaining[0];
    const closesSelectedTab = selectedValue === item.value;
    if (closesSelectedTab) select(next?.value ?? "");
    const focusTarget = closesSelectedTab
      ? next
      : items.find((candidate) => candidate.value === selectedValue);
    if (focusTarget) pendingFocus.current = focusTarget.value;
    onClose?.(item.value);
    setAnnouncement(
      closesSelectedTab && next
        ? `${itemLabel(item)} closed. ${itemLabel(next)} selected.`
        : `${itemLabel(item)} closed.`,
    );
  };

  const scroll = (direction: -1 | 1) => {
    const list = listRef.current;
    if (!list) return;
    const rtl = getComputedStyle(list).direction === "rtl";
    list.scrollBy({
      behavior: "auto",
      left:
        direction *
        (rtl ? -1 : 1) *
        Math.max(120, Math.round(list.clientWidth * 0.75)),
    });
  };

  const theme = themeProps("session-tabs", { size });
  const actionTheme = themeProps("session-tabs-action", { size });
  const tabTheme = themeProps("session-tabs-tab", { size });

  return (
    <TabsRoot
      {...props}
      {...theme}
      className={cx(sx(styles.root, xstyle), theme.className)}
      onValueChange={(next) => select(String(next))}
      orientation="horizontal"
      value={selectedValue}
    >
      <div className={sx(styles.bar)}>
        {overflow.present ? (
          <button
            aria-label="Scroll tabs backward"
            {...actionTheme}
            className={cx(
              sx(
                styles.action,
                sessionActionSizeStyles[size],
                focusRing.ring,
                transition.colors,
              ),
              actionTheme.className,
            )}
            disabled={!overflow.canBack}
            onClick={() => scroll(-1)}
            type="button"
          >
            <ChevronLeft aria-hidden size={14} />
          </button>
        ) : null}
        <div className={sx(styles.viewport)}>
          <TabsList
            aria-label={label}
            {...themeSlotProps("session-tabs", "list")}
            className={sx(styles.list)}
            ref={listRef}
          >
            {items.map((item) => (
              <div
                className={sx(
                  styles.item,
                  selectedValue === item.value && styles.itemActive,
                  dragging === item.value && styles.dragging,
                )}
                data-session-tab-item={item.value}
                draggable={Boolean(onReorder)}
                key={item.value}
                onDragEnd={() => {
                  draggedValue.current = null;
                  setDragging(null);
                }}
                onDragOver={(event) => {
                  if (!onReorder) return;
                  event.preventDefault();
                }}
                onDragStart={(event) => {
                  draggedValue.current = item.value;
                  setDragging(item.value);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.value);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = draggedValue.current;
                  if (!from) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const rtl =
                    getComputedStyle(event.currentTarget).direction === "rtl";
                  reorder(
                    from,
                    item.value,
                    rtl
                      ? event.clientX <= rect.left + rect.width / 2
                      : event.clientX >= rect.left + rect.width / 2,
                  );
                  draggedValue.current = null;
                  setDragging(null);
                }}
              >
                <TabsTab
                  aria-keyshortcuts={getKeyboardShortcuts(item, onReorder)}
                  {...tabTheme}
                  className={(state) =>
                    cx(
                      sx(
                        styles.tab,
                        tabHeightBySize[size],
                        focusRing.ringInset,
                        transition.colors,
                        state.active && styles.tabActive,
                        state.disabled && styles.tabDisabled,
                        state.disabled && controlChrome.disabled,
                      ),
                      tabTheme.className,
                    )
                  }
                  disabled={item.disabled}
                  onKeyDown={(event) => {
                    if (
                      item.closable &&
                      (event.key === "Delete" || event.key === "Backspace")
                    ) {
                      event.preventDefault();
                      close(item);
                      return;
                    }
                    if (!event.altKey || !event.shiftKey || !onReorder) return;
                    if (
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowRight"
                    ) {
                      event.preventDefault();
                      const physicalDirection: -1 | 1 =
                        event.key === "ArrowLeft" ? -1 : 1;
                      const rtl =
                        getComputedStyle(event.currentTarget).direction ===
                        "rtl";
                      const logicalDirection: -1 | 1 = rtl
                        ? physicalDirection === -1
                          ? 1
                          : -1
                        : physicalDirection;
                      moveByKeyboard(item, logicalDirection);
                    }
                  }}
                  ref={(node) => {
                    if (node) tabRefs.current.set(item.value, node);
                    else tabRefs.current.delete(item.value);
                  }}
                  value={item.value}
                >
                  {item.label}
                </TabsTab>
                {item.closable ? (
                  <button
                    aria-label={
                      item.closeLabel ?? `Close ${itemLabel(item)} tab`
                    }
                    {...actionTheme}
                    className={cx(
                      sx(
                        styles.action,
                        styles.close,
                        sessionActionSizeStyles[size],
                        focusRing.ring,
                        transition.colors,
                      ),
                      actionTheme.className,
                    )}
                    draggable={false}
                    onClick={() => close(item)}
                    onDragStart={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <X aria-hidden size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </TabsList>
        </div>
        {overflow.present ? (
          <button
            aria-label="Scroll tabs forward"
            {...actionTheme}
            className={cx(
              sx(
                styles.action,
                sessionActionSizeStyles[size],
                focusRing.ring,
                transition.colors,
              ),
              actionTheme.className,
            )}
            disabled={!overflow.canForward}
            onClick={() => scroll(1)}
            type="button"
          >
            <ChevronRight aria-hidden size={14} />
          </button>
        ) : null}
        {onAdd ? (
          <button
            aria-label={addLabel}
            {...actionTheme}
            className={cx(
              sx(
                styles.action,
                sessionActionSizeStyles[size],
                focusRing.ring,
                transition.colors,
              ),
              actionTheme.className,
            )}
            onClick={onAdd}
            type="button"
          >
            <Plus aria-hidden size={14} />
          </button>
        ) : null}
      </div>
      <div className={sx(styles.panelViewport)}>
        {items.map((item) => (
          <TabsPanel
            {...themeSlotProps("session-tabs", "panel")}
            className={sx(styles.panel)}
            key={item.value}
            value={item.value}
          >
            {item.content}
          </TabsPanel>
        ))}
      </div>
      <VisuallyHidden aria-live="polite" role="status">
        {announcement}
      </VisuallyHidden>
    </TabsRoot>
  );
}

function itemLabel(item: SessionTabItem) {
  return typeof item.label === "string" ? item.label : "Tab";
}

function getKeyboardShortcuts(
  item: SessionTabItem,
  onReorder: SessionTabsProps["onReorder"],
) {
  const shortcuts = [
    ...(onReorder ? ["Alt+Shift+ArrowLeft", "Alt+Shift+ArrowRight"] : []),
    ...(item.closable ? ["Delete", "Backspace"] : []),
  ];
  return shortcuts.length ? shortcuts.join(" ") : undefined;
}
