import { useEffect, useRef, type ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
function focusTask(key: string) {
  const row = document.querySelector<HTMLElement>(`[data-task-key="${CSS.escape(key)}"]`);
  row?.focus({ preventScroll: true });
  return Boolean(row);
}

/** Expanded task disclosure retains its logical selection beyond the viewport. */
export function FleetVirtualCardTasks<T>({ rows, keyOf, render }: { rows: readonly T[]; keyOf: (row: T) => string; render: (row: T, index: number) => ReactNode }) {
  const list = useRef<VirtuosoHandle | null>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const reveal = (event: Event) => {
      const { key, focus } = (event as CustomEvent<{ key: string; focus: boolean }>).detail;
      const index = rows.findIndex((row) => keyOf(row) === key);
      if (index < 0) return;
      if (focus) pending.current = key;
      list.current?.scrollToIndex({ index, align: "center" });
    };
    window.addEventListener("fleet-reveal-row", reveal);
    return () => window.removeEventListener("fleet-reveal-row", reveal);
  }, [rows, keyOf]);
  return <div onKeyDownCapture={(event) => {
    const target = event.target as HTMLElement;
    const key = target.closest<HTMLElement>("[data-fleet-select-key]")?.dataset.fleetSelectKey;
    const current = rows.findIndex((row) => keyOf(row) === key);
    if (current < 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const index = event.key === "End" ? rows.length - 1 : event.key === "Home" ? 0
      : event.key === "ArrowDown" || event.key === "j" ? Math.min(rows.length - 1, current + 1)
      : event.key === "ArrowUp" || event.key === "k" ? Math.max(0, current - 1) : null;
    if (index === null) return;
    event.preventDefault();
    pending.current = keyOf(rows[index]!);
    list.current?.scrollToIndex({ index, align: "center" });
  }}>
    <Virtuoso ref={list} data={rows as T[]} className={sx(styles.viewport)} computeItemKey={(_, row) => keyOf(row)}
      rangeChanged={() => requestAnimationFrame(() => { if (pending.current && focusTask(pending.current)) pending.current = null; })}
      itemContent={(index, row) => render(row, index)} />
  </div>;
}
const styles = stylex.create({ viewport: { blockSize: "36vh", minBlockSize: "12rem" } });
