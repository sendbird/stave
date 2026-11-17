import { useEffect, useRef } from "react";
import { focusWhenMounted } from "@/hooks/use-windowed-list";

const REVEAL_EVENT = "fleet-reveal-row";

/**
 * Asks the mounted Fleet layout to scroll a logical task into view (the least
 * distance; nothing when it is visible). With `focus`, the task's control takes
 * focus once its row is mounted, unless focus moved elsewhere meanwhile.
 */
export function revealFleetVirtualRow(key: string, focus = false) {
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: { key } }));
  if (focus) focusWhenMounted(() => findFleetRowControl(key));
}

/** Calls `reveal` with each task key the board asks to show, through the latest closure. */
export function useFleetRevealListener(reveal: (key: string) => void, enabled = true) {
  const latest = useRef(reveal);
  latest.current = reveal;
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: Event) => latest.current((event as CustomEvent<{ key: string }>).detail.key);
    window.addEventListener(REVEAL_EVENT, listener);
    return () => window.removeEventListener(REVEAL_EVENT, listener);
  }, [enabled]);
}

/** The control that represents a task's row in the current layout. */
export function findFleetRowControl(key: string) {
  const row = document.querySelector<HTMLElement>(`[data-fleet-select-key="${CSS.escape(key)}"]`);
  if (!row) return null;
  if (row.matches("button,[tabindex='0']")) return row;
  return row.querySelector<HTMLElement>("button[id^='fleet-task-table-open-']")
    ?? row.querySelector<HTMLElement>("[data-agent-fleet-card]")
    ?? row.querySelector<HTMLElement>("[data-fleet-task-row]")
    ?? row.querySelector<HTMLElement>("button,[tabindex='0']");
}
