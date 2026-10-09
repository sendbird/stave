import { useSyncExternalStore } from "react";
import {
  INLINE_RENDER_THEME_VARIABLES,
  type InlineRenderTheme,
} from "@/lib/inline-render/inline-render";

/**
 * The app's resolved theme as an inline render page sees it: the role token
 * values after built-in, custom, and override themes have applied, plus the
 * light/dark appearance. One observer serves every render on screen.
 */
export function readInlineRenderTheme(): InlineRenderTheme {
  if (typeof document === "undefined") {
    return { appearance: "light", variables: {} };
  }
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const variables: Record<string, string> = {};
  for (const name of INLINE_RENDER_THEME_VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) variables[name] = value;
  }
  return { appearance: root.classList.contains("dark") ? "dark" : "light", variables };
}

function sameTheme(left: InlineRenderTheme, right: InlineRenderTheme) {
  if (left.appearance !== right.appearance) return false;
  const leftKeys = Object.keys(left.variables);
  if (leftKeys.length !== Object.keys(right.variables).length) return false;
  return leftKeys.every((key) => left.variables[key] === right.variables[key]);
}

let current: InlineRenderTheme | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let frame = 0;

function refresh() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const next = readInlineRenderTheme();
    if (current && sameTheme(current, next)) return;
    current = next;
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== "undefined") {
    // Themes change through the root's class and inline style (dark mode,
    // font overrides) and through `<style>` elements in the head (custom and
    // override themes), so both are watched.
    observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
      cancelAnimationFrame(frame);
      // Nothing watched the theme meanwhile, so the next reader re-reads it.
      current = null;
    }
  };
}

function getSnapshot() {
  current ??= readInlineRenderTheme();
  return current;
}

export function useInlineRenderTheme(): InlineRenderTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
