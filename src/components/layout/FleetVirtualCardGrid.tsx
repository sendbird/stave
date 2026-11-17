import { cloneElement, memo, useCallback, useEffect, useState, type ReactElement } from "react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import { useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

interface CardEntry { key: string; card: ReactElement<{ mountTarget?: HTMLElement | null }>; taskKeys: readonly string[]; visible?: boolean }
const Slot = memo(function Slot({ itemKey, index, count, register }: { itemKey: string; index: number; count: number; register: (key: string, node: HTMLElement | null) => void }) {
  const ref = useCallback((node: HTMLDivElement | null) => register(itemKey, node), [itemKey, register]);
  return <div ref={ref} role="listitem" aria-setsize={count} aria-posinset={index + 1} />;
});

/** Keep the data/selection models mounted while only visible card views own DOM. */
export function FleetVirtualCardGrid({ entries }: { entries: CardEntry[] }) {
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const visibleEntries = entries.filter((entry) => entry.visible !== false);
  const list = useRef<VirtuosoGridHandle | null>(null);
  const register = useCallback((key: string, node: HTMLElement | null) => setSlots((previous) => {
    if ((previous.get(key) ?? null) === node) return previous;
    const next = new Map(previous);
    if (node) next.set(key, node); else next.delete(key);
    return next;
  }), []);
  useEffect(() => {
    const reveal = (event: Event) => {
      const { key } = (event as CustomEvent<{ key: string }>).detail;
      const index = visibleEntries.findIndex((entry) => entry.taskKeys.includes(key));
      if (index >= 0) list.current?.scrollToIndex({ index, align: "center" });
    };
    window.addEventListener("fleet-reveal-row", reveal);
    return () => window.removeEventListener("fleet-reveal-row", reveal);
  }, [visibleEntries]);
  return <>
    {entries.map((entry) => cloneElement(entry.card, { key: entry.key, mountTarget: slots.get(entry.key) ?? null }))}
    <VirtuosoGrid ref={list} data={visibleEntries} className={sx(styles.viewport)} listClassName={sx(styles.grid)} computeItemKey={(_, entry) => entry.key}
      itemContent={(index, entry) => <Slot itemKey={entry.key} index={index} count={visibleEntries.length} register={register} />} />
  </>;
}
const styles = stylex.create({
  viewport: { blockSize: "60vh", minBlockSize: "20rem" },
  grid: { display: "grid", gap: vars["--aui-space-12"], gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, max(17rem, calc((100% - 2 * 0.75rem) / 3))), 1fr))" },
});
