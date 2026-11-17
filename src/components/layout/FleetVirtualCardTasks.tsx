import { useMemo, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useWindowedList } from "@/hooks/use-windowed-list";
import { revealFleetVirtualRow, useFleetRevealListener } from "./fleet-virtual-focus";

/** Props a windowed task row spreads on its own root so the list can measure it. */
export interface FleetVirtualRowProps {
  ref: (element: HTMLElement | null) => void | (() => void);
  "data-windowed-key": string;
}

/**
 * A card's expanded task list past the windowing threshold: a bounded scroller
 * inside the card that renders only the rows near its view. The focused row
 * stays mounted, and ↑/↓ (j/k), Home and End move focus by logical row.
 */
export function FleetVirtualCardTasks<T>({ rows, keyOf, render }: {
  rows: readonly T[];
  keyOf: (row: T) => string;
  render: (row: T, index: number, measure: FleetVirtualRowProps) => ReactNode;
}) {
  const keys = useMemo(() => rows.map(keyOf), [rows, keyOf]);
  const windowed = useWindowedList({ keys, estimateSize: 44, overscan: 300, scrollOwner: (list) => list.parentElement });
  useFleetRevealListener((key) => {
    const index = keys.indexOf(key);
    if (index >= 0) windowed.scrollToIndex(index);
  });
  return <div className={sx(styles.viewport)} onKeyDownCapture={(event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const key = (event.target as HTMLElement).closest<HTMLElement>("[data-fleet-select-key]")?.dataset.fleetSelectKey;
    const current = key === undefined ? -1 : keys.indexOf(key);
    if (current < 0) return;
    const next = event.key === "End" ? keys.length - 1 : event.key === "Home" ? 0
      : event.key === "ArrowDown" || event.key === "j" ? Math.min(keys.length - 1, current + 1)
      : event.key === "ArrowUp" || event.key === "k" ? Math.max(0, current - 1) : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (next !== current) revealFleetVirtualRow(keys[next]!, true);
  }}>
    <div ref={windowed.listRef}>
      {windowed.slots.map((slot) => slot.kind === "gap"
        ? <div key={slot.key} aria-hidden="true" style={{ blockSize: slot.size }} />
        : render(rows[slot.index]!, slot.index, { ref: windowed.measureRef, "data-windowed-key": slot.key }))}
    </div>
  </div>;
}

const styles = stylex.create({ viewport: { blockSize: "36vh", minBlockSize: "12rem", overflowY: "auto" } });
