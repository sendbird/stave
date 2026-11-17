import { revealFleetVirtualRow } from "./fleet-virtual-focus";
import { fleetSelectionRowMarker } from "./fleet-selection.stylex";
import { useEffect, type KeyboardEvent, type MouseEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { useFleetSelectionStore, type FleetSelectionTarget } from "@/store/fleet-selection-store";

const scopeVersions = new Map<string, number>();
export function useFleetSelectionRows(scope: string, rows: readonly FleetSelectionTarget[]) {
  useEffect(() => { useFleetSelectionStore.getState().setRows(scope, rows); }, [scope, rows]);
  useEffect(() => {
    const version = (scopeVersions.get(scope) ?? 0) + 1;
    scopeVersions.set(scope, version);
    // A layout switch registers the replacement before retiring the old scope.
    return () => queueMicrotask(() => {
      if (scopeVersions.get(scope) === version) useFleetSelectionStore.getState().removeScope(scope);
    });
  }, [scope]);
}
export function FleetSelectionCheckbox({ itemKey, title }: { itemKey: string; title: string }) {
  const { t } = useTranslation(["fleet"]);
  const checked = useFleetSelectionStore((state) => state.selectedKeys.has(itemKey));
  return <Checkbox controlOnly xstyle={[styles.checkbox, checked && styles.selected]} checked={checked} aria-label={t("fleet:selection.selectTask", { title })}
    onClick={(event) => { event.stopPropagation(); useFleetSelectionStore.getState().toggle(itemKey, event.shiftKey); }} />;
}
export function FleetSelectionStatus() {
  const { t } = useTranslation(["fleet"]);
  const count = useFleetSelectionStore((state) => state.selectedKeys.size);
  return <span role="status" aria-live="polite" className={sx(styles.status)}>{count ? t("fleet:selection.selected", { count }) : null}</span>;
}
function selectedRow(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>("[data-fleet-select-key]") : null;
}
/** Capture prevents an ordinary open/toggle action when the gesture selects instead. */
export function useFleetSelectionKeyboard() {
  return {
    onClickCapture(event: MouseEvent<HTMLElement>) {
      const row = selectedRow(event.target);
      if (!row || !(event.metaKey || event.ctrlKey || event.shiftKey)) return;
      event.preventDefault(); event.stopPropagation();
      useFleetSelectionStore.getState().toggle(row.dataset.fleetSelectKey!, event.shiftKey);
      row.querySelector<HTMLElement>("button,[tabindex='0'],input[type=checkbox]")?.focus();
    },
    onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-popup],[data-popover],[popover]')) return;
      const store = useFleetSelectionStore.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault(); event.stopPropagation(); store.selectAll(); return;
      }
      if (event.key === "Escape" && store.selectedKeys.size) {
        event.preventDefault(); event.stopPropagation(); store.clear(); return;
      }
      const row = selectedRow(event.target);
      const key = row?.dataset.fleetSelectKey;
      if (!key) return;
      if (event.key.toLowerCase() === "x" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); store.toggle(key); return;
      }
      if (event.shiftKey && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        const index = store.visibleTargets.findIndex((target) => target.key === key);
        const next = store.visibleTargets[index + (event.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        event.preventDefault(); event.stopPropagation();
        if (!store.anchor) store.toggle(key);
        useFleetSelectionStore.getState().toggle(next.key, true);
        revealFleetVirtualRow(next.key, true);
        const root = event.currentTarget;
        const nextRow = [...root.querySelectorAll<HTMLElement>("[data-fleet-select-key]")].find((item) => item.dataset.fleetSelectKey === next.key);
        (nextRow?.querySelector<HTMLElement>("button,[tabindex='0']") ?? nextRow)?.focus();
      }
    },
  };
}
const styles = stylex.create({
  checkbox: {
    flexShrink: 0, minInlineSize: vars["--aui-control-mark-size-lg"], minBlockSize: vars["--aui-control-mark-size-lg"],
    opacity: { default: 0, [stylex.when.ancestor(":is(:hover, :focus-within)", fleetSelectionRowMarker)]: 1, "@media (hover: none)": 1 },
  },
  selected: { opacity: 1 },
  // The selection bar's `xs` button type and line box, so the count and the actions share one centre line.
  status: { fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-control"] },
});
