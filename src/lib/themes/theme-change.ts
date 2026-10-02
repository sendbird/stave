/**
 * One shared watcher for "the resolved theme may have changed", for surfaces
 * that paint theme colors outside CSS (a canvas) and must repaint:
 *
 * - `<html>` class and inline style: light/dark (`applyThemeClass`), and the
 *   token bridge the design provider writes inline (`StaveDesignProvider`).
 * - `<style>` elements in `<head>`: custom themes and per-token overrides
 *   (`applyCustomTheme`, `applyThemeOverrides`).
 * - the OS color scheme, for the `system` mode.
 *
 * Listeners may be called more than once per change; coalesce the repaint.
 */

const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

const isStyleNode = (node: Node | null) =>
  node instanceof HTMLStyleElement || node?.parentElement instanceof HTMLStyleElement || node instanceof HTMLLinkElement;

function start(): () => void {
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver((records) => {
          const themed = records.some(
            (record) =>
              record.target === document.documentElement ||
              isStyleNode(record.target) ||
              [...record.addedNodes, ...record.removedNodes].some(isStyleNode),
          );
          if (themed) notify();
        });
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  observer?.observe(document.head, { childList: true, subtree: true, characterData: true });
  const scheme = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  scheme?.addEventListener("change", notify);
  return () => {
    observer?.disconnect();
    scheme?.removeEventListener("change", notify);
  };
}

/** Calls `listener` whenever the theme may have changed. Returns the unsubscribe. */
export function subscribeToThemeChanges(listener: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  listeners.add(listener);
  stop ??= start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop?.();
      stop = null;
    }
  };
}
