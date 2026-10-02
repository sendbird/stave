import { useSyncExternalStore } from "react";
import { AGENT_COLOR_CHART_INDEX, agentAvatarPalette, type AgentAvatarTone } from "@/lib/agents/agent-appearance";
import type { AgentColor } from "@/lib/agents/schema";
import { parseCssColor } from "@/lib/themes/contrast";

/**
 * The active theme's avatar palette, read once per theme change and shared by
 * every avatar on the page.
 *
 * The avatar's ink has to be measured against its fill, and both depend on the
 * theme's resolved surface and body ink, which CSS `color-mix` cannot clamp.
 * This reads the resolved `--ads-color-surface`, `--ads-color-text` and
 * `--ads-chart-*` from `<html>` and recomputes when a theme is applied: the
 * `.dark` / `theme-changing` class, the inline token mapping, or the custom
 * theme and override `<style>` elements change. Null until the document can be
 * read, which keeps the CSS fallback in `agentAvatarTone`.
 */

type Palette = Record<AgentColor, AgentAvatarTone> | null;

const CHART_INDICES = [...new Set(Object.values(AGENT_COLOR_CHART_INDEX))];

let palette: Palette = null;
let paletteKey: string | null = null;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * A resolved colour in a notation `parseCssColor` reads. Registered colour
 * tokens resolve to `lab(...)`, and user themes may use `rgb()`/`hsl()`; a
 * 1px canvas paints any of them and hands back sRGB.
 */
function normalizeColor(value: string): string {
  if (!value || parseCssColor(value)) return value;
  if (probe === undefined) probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return value;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function readPalette(): boolean {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => normalizeColor(style.getPropertyValue(name).trim());
  const surface = read("--ads-color-surface");
  const text = read("--ads-color-text");
  const hues = new Map(CHART_INDICES.map((index) => [index, read(`--ads-chart-${index}`)]));
  const key = [surface, text, ...hues.values()].join("|");
  if (key === paletteKey) return false;
  paletteKey = key;
  palette = agentAvatarPalette({ surface, text, hues: (index) => hues.get(index) ?? "" });
  return true;
}

function handleThemeMutation() {
  if (!readPalette()) return;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(handleThemeMutation);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    // A theme applied between the first read and this subscription is not a mutation any more.
    handleThemeMutation();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
      paletteKey = null;
    }
  };
}

function getSnapshot(): Palette {
  if (paletteKey === null && typeof document !== "undefined") readPalette();
  return palette;
}

function getServerSnapshot(): Palette {
  return null;
}

/** The concrete fill and ink for each hue in the active theme, or null before it can be read. */
export function useAgentAvatarPalette(): Palette {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
