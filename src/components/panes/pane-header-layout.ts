import { useEffect, useRef, useState, type RefObject } from "react";
import type { DockviewGroupPanelApi } from "dockview-react";
import { i18n } from "@/i18n";

/**
 * Below this group width the header's own actions go icon-only, so the tab
 * strip keeps its room and the Conversation/Review switch never wraps onto a
 * second line over the tabs. A 1024px window with a side panel open leaves a
 * task group of about 420px; the same window without one leaves about 730px.
 */
export const PANE_HEADER_COMPACT_MAX_WIDTH = 640;

export function isPaneHeaderCompact(groupWidth: number): boolean {
  return groupWidth > 0 && groupWidth < PANE_HEADER_COMPACT_MAX_WIDTH;
}

/** Whether the group's header is narrow, tracking the group's resizes. */
export function usePaneHeaderCompact(api: DockviewGroupPanelApi): boolean {
  const [compact, setCompact] = useState(() => isPaneHeaderCompact(api.width ?? 0));
  useEffect(() => {
    setCompact(isPaneHeaderCompact(api.width ?? 0));
    // Optional: a header rendered outside a Dockview group has no group api.
    const disposable = api.onDidDimensionsChange?.((event) => {
      setCompact(isPaneHeaderCompact(event.width));
    });
    return () => disposable?.dispose();
  }, [api]);
  return compact;
}

/** The accessible name of the overflowed-tabs count: "2 more tasks". */
export function describeOverflowedTabs(args: { count: number; allTasks: boolean }): string {
  return args.allTasks
    ? i18n.t("panes:paneHeaderActions.moreTasks", { count: args.count })
    : i18n.t("panes:paneHeaderActions.moreTabs", { count: args.count });
}

const OVERFLOW_TRIGGER = ".dv-tabs-overflow-dropdown-root";

/**
 * Dockview draws the overflowed-tabs trigger itself, as a bare `div` holding a
 * chevron and a number. The theme turns its look into a "+2" count; this names
 * it ("2 more tasks"), makes it a button in the tab order, and opens its list
 * from Enter or Space as a click would.
 */
export function useOverflowedTabsTrigger(
  rootRef: RefObject<HTMLElement | null>,
  args: { allTasks: boolean },
) {
  const allTasksRef = useRef(args.allTasks);
  allTasksRef.current = args.allTasks;
  useEffect(() => {
    const container = rootRef.current?.closest(".dv-right-actions-container");
    if (!container) {
      return;
    }
    const label = () => {
      const trigger = container.querySelector<HTMLElement>(OVERFLOW_TRIGGER);
      if (!trigger) {
        return;
      }
      const count = Number.parseInt(trigger.textContent?.trim() ?? "", 10);
      if (Number.isFinite(count)) {
        trigger.setAttribute(
          "aria-label",
          describeOverflowedTabs({ count, allTasks: allTasksRef.current }),
        );
      }
      // Marked on the element, so a re-run of this effect never adds a second
      // key handler (two would open and close the list in one press).
      if (trigger.dataset.paneOverflowTrigger === "true") {
        return;
      }
      trigger.dataset.paneOverflowTrigger = "true";
      trigger.setAttribute("role", "button");
      trigger.setAttribute("aria-haspopup", "true");
      trigger.tabIndex = 0;
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        // After the key's own dispatch, which would otherwise reach the list
        // Dockview just opened and dismiss it. The list opens where the click
        // landed; anchor it under the count.
        window.requestAnimationFrame(() => {
          const rect = trigger.getBoundingClientRect();
          trigger.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              clientX: rect.left,
              clientY: rect.bottom,
            }),
          );
        });
      });
    };
    label();
    // Only structure and text: the labels written here are attributes, so
    // observing them would wake this observer with its own writes.
    const observer = new MutationObserver(label);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [rootRef, args.allTasks]);
}
