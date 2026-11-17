/** Ask the mounted layout to reveal a logical task before querying its DOM. */
export function revealFleetVirtualRow(key: string, focus = false) {
  window.dispatchEvent(new CustomEvent("fleet-reveal-row", { detail: { key, focus } }));
}
export function focusFleetVirtualRow(key: string) {
  const escaped = CSS.escape(key);
  const row = document.querySelector<HTMLElement>(`[data-fleet-select-key="${escaped}"]`);
  const target = row?.matches("button,[tabindex='0']") ? row : (row?.querySelector<HTMLElement>("button[id^='fleet-task-table-open-']") ?? row?.querySelector<HTMLElement>("[data-agent-fleet-card]") ?? row?.querySelector<HTMLElement>("[data-fleet-task-row]") ?? row?.querySelector<HTMLElement>("button,[tabindex='0']"));
  target?.focus({ preventScroll: true });
  return Boolean(target);
}
