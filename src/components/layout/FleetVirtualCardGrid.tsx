import { cloneElement, memo, useCallback, useLayoutEffect, useMemo, useState, type ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useWindowedList } from "@/hooks/use-windowed-list";
import { useFleetRevealListener } from "./fleet-virtual-focus";

interface CardEntry { key: string; card: ReactElement<{ mountTarget?: HTMLElement | null }>; taskKeys: readonly string[]; visible?: boolean }

const Slot = memo(function Slot({ itemKey, index, count, register }: { itemKey: string; index: number; count: number; register: (key: string, node: HTMLElement | null) => void }) {
  const ref = useCallback((node: HTMLDivElement | null) => register(itemKey, node), [itemKey, register]);
  return <div ref={ref} role="listitem" aria-setsize={count} aria-posinset={index + 1} className={sx(styles.slot)} />;
});

/** The number of tracks the grid's own `auto-fill` template resolves to. */
function readColumnCount(element: HTMLElement) {
  return Math.max(1, getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
}

/**
 * A repository's workspace cards past the windowing threshold. Every card stays
 * mounted as a component (its data and selection rows keep registering), but
 * only cards in rows near the board's view own DOM. Rows are windowed with
 * measured heights and scroll with the board; each row is a subgrid of the
 * same column template, so the cards in a row share one height.
 */
export function FleetVirtualCardGrid({ entries }: { entries: CardEntry[] }) {
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const visibleEntries = useMemo(() => entries.filter((entry) => entry.visible !== false), [entries]);
  const [grid, setGrid] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => setColumns(readColumnCount(grid));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid]);
  const rows = useMemo(() => {
    const result: CardEntry[][] = [];
    for (let index = 0; index < visibleEntries.length; index += columns) result.push(visibleEntries.slice(index, index + columns));
    return result;
  }, [columns, visibleEntries]);
  const rowKeys = useMemo(() => rows.map((row) => row.map((entry) => entry.key).join("\n")), [rows]);
  const windowed = useWindowedList({
    keys: rowKeys,
    estimateSize: 240,
    scrollOwner: (list) => list.closest<HTMLElement>("[data-fleet-board-scroll]"),
  });
  const register = useCallback((key: string, node: HTMLElement | null) => setSlots((previous) => {
    if ((previous.get(key) ?? null) === node) return previous;
    const next = new Map(previous);
    if (node) next.set(key, node); else next.delete(key);
    return next;
  }), []);
  useFleetRevealListener((key) => {
    const index = visibleEntries.findIndex((entry) => entry.taskKeys.includes(key));
    if (index >= 0) windowed.scrollToIndex(Math.floor(index / columns));
  });
  const { listRef: setWindowedList } = windowed;
  const listRef = useCallback((element: HTMLElement | null) => {
    setGrid(element);
    setWindowedList(element);
  }, [setWindowedList]);
  return <>
    {entries.map((entry) => cloneElement(entry.card, { key: entry.key, mountTarget: slots.get(entry.key) ?? null }))}
    <div ref={listRef} role="list" className={sx(styles.grid)}>
      {windowed.slots.map((slot) => slot.kind === "gap"
        ? <div key={slot.key} aria-hidden="true" className={sx(styles.gap)} style={{ blockSize: slot.size }} />
        : <div key={slot.key} ref={windowed.measureRef} data-windowed-key={slot.key} className={sx(styles.row, slot.index > 0 && styles.rowFollowing)}>
          {rows[slot.index]!.map((entry, column) => <Slot key={entry.key} itemKey={entry.key} index={slot.index * columns + column} count={visibleEntries.length} register={register} />)}
        </div>)}
    </div>
  </>;
}

const styles = stylex.create({
  // The board's card template (see `fleetStyles.cardGrid`); rows space
  // themselves so their measured height includes the gap.
  grid: {
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, max(17rem, calc((100% - 2 * 0.75rem) / 3))), 1fr))",
    rowGap: 0,
  },
  row: {
    alignItems: "stretch",
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
  },
  rowFollowing: { paddingBlockStart: vars["--aui-space-12"] },
  gap: { gridColumn: "1 / -1" },
  // The card fills its cell, so every card in a row takes the row's height.
  slot: { display: "grid", minInlineSize: 0 },
});
