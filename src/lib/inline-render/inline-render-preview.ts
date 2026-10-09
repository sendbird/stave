/**
 * Inline render previews: `stave_preview_html` renders a page offscreen the
 * way `stave_render_html` would show it and hands the agent a screenshot and
 * what went wrong, so the agent can fix the page before the user sees it.
 *
 * The main process does the rendering. This module owns the rules around it
 * that are worth testing on their own: the context the renderer syncs (network
 * policy and theme), option defaults, the fallback palette, the caps on what
 * the page may report, the navigation rule, the viewport plan, and the tool
 * result. It is pure so the main process, the renderer, and the tests share it.
 */
import { PRESET_THEME_TOKENS } from "@/lib/themes/presets";
import {
  clampInlineRenderHeight,
  INLINE_RENDER_DEFAULT_HEIGHT,
  INLINE_RENDER_MAX_HEIGHT,
  INLINE_RENDER_MIN_HEIGHT,
  INLINE_RENDER_THEME_VARIABLES,
  isInlineRenderUrl,
  sanitizeInlineRenderTheme,
  type InlineRenderNetworkPolicy,
  type InlineRenderTheme,
} from "./inline-render";

export const INLINE_RENDER_PREVIEW_TOOL_NAME = "stave_preview_html";

/** A typical chat column; pages should be fluid, so narrower checks are cheap. */
export const INLINE_RENDER_PREVIEW_DEFAULT_WIDTH = 720;
export const INLINE_RENDER_PREVIEW_MIN_WIDTH = 320;
export const INLINE_RENDER_PREVIEW_MAX_WIDTH = 1_600;
/** The viewport a page first lays out in: the conversation frame's starting height. */
export const INLINE_RENDER_PREVIEW_INITIAL_HEIGHT = INLINE_RENDER_DEFAULT_HEIGHT;
export const INLINE_RENDER_PREVIEW_MAX_CAPTURE_HEIGHT = 4_000;
/**
 * The capture is returned as slices this tall. A model scales a tall image
 * down until it fits its own limits, which turns a 4,000 px page into
 * unreadable text; slices of a chat column's width stay legible.
 */
export const INLINE_RENDER_PREVIEW_SLICE_HEIGHT = 1_200;
/** How many times the viewport is grown to fit the content before capturing. */
export const INLINE_RENDER_PREVIEW_MAX_RESIZE_ROUNDS = 3;

export const INLINE_RENDER_PREVIEW_TIMEOUT_MS = 15_000;
/** A page still loading after this (a slow resource) is captured as it is. */
export const INLINE_RENDER_PREVIEW_LOAD_BUDGET_MS = 8_000;
export const INLINE_RENDER_PREVIEW_MAX_CONCURRENT = 2;
export const INLINE_RENDER_PREVIEW_MAX_WAITING = 4;

export const INLINE_RENDER_PREVIEW_MAX_CONSOLE_MESSAGES = 20;
export const INLINE_RENDER_PREVIEW_MAX_FAILED_REQUESTS = 10;
export const INLINE_RENDER_PREVIEW_MAX_BLOCKED_NAVIGATIONS = 5;
export const INLINE_RENDER_PREVIEW_MAX_MESSAGE_CHARS = 500;

export type InlineRenderPreviewAppearance = "light" | "dark";

/* ─── Context the renderer syncs ─────────────────────────────────── */

/**
 * What a preview needs from the renderer, which owns both: the user's network
 * policy, and the theme the app shows right now.
 */
export interface InlineRenderPreviewContext {
  networkPolicy: InlineRenderNetworkPolicy;
  theme: InlineRenderTheme | null;
}

/** Until the renderer reports the user's setting, a preview gets no network. */
export const INITIAL_INLINE_RENDER_PREVIEW_CONTEXT: InlineRenderPreviewContext = {
  networkPolicy: "blocked",
  theme: null,
};

/**
 * Reads a context the renderer sent. An unknown policy becomes `blocked`, not
 * the setting's default, so a malformed message can only take network access
 * away.
 */
export function normalizeInlineRenderPreviewContext(value: unknown): InlineRenderPreviewContext {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const policy = record.networkPolicy;
  const networkPolicy: InlineRenderNetworkPolicy =
    policy === "open" || policy === "cdn" ? policy : "blocked";
  return { networkPolicy, theme: readTheme(record.theme) };
}

function readTheme(value: unknown): InlineRenderTheme | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { appearance?: unknown; variables?: unknown };
  if (record.appearance !== "light" && record.appearance !== "dark") return null;
  const variables: Record<string, string> = {};
  if (record.variables && typeof record.variables === "object") {
    for (const [name, raw] of Object.entries(record.variables as Record<string, unknown>)) {
      if (typeof raw === "string") variables[name] = raw;
    }
  }
  return sanitizeInlineRenderTheme({ appearance: record.appearance, variables });
}

/* ─── Options ────────────────────────────────────────────────────── */

export interface InlineRenderPreviewOptions {
  width: number;
  appearance: InlineRenderPreviewAppearance;
}

/**
 * The width defaults to a chat column and is clamped to a sane range. The
 * appearance defaults to the one the user sees now, and to dark before the
 * renderer has said.
 */
export function normalizeInlineRenderPreviewOptions(
  input: { width?: unknown; appearance?: unknown },
  current: { appearance: InlineRenderPreviewAppearance | null },
): InlineRenderPreviewOptions {
  const width =
    typeof input.width === "number" && Number.isFinite(input.width)
      ? Math.min(
          INLINE_RENDER_PREVIEW_MAX_WIDTH,
          Math.max(INLINE_RENDER_PREVIEW_MIN_WIDTH, Math.round(input.width)),
        )
      : INLINE_RENDER_PREVIEW_DEFAULT_WIDTH;
  const appearance =
    input.appearance === "light" || input.appearance === "dark"
      ? input.appearance
      : (current.appearance ?? "dark");
  return { width, appearance };
}

/* ─── Theme ──────────────────────────────────────────────────────── */

/**
 * Role tokens that are not in the core presets, with the values `globals.css`
 * gives the default light and dark themes (a test keeps them in step).
 */
const EXTENDED_FALLBACK_VARIABLES: Record<InlineRenderPreviewAppearance, Record<string, string>> = {
  light: {
    "--success": "oklch(0.51 0.12 155)",
    "--success-foreground": "oklch(0.99 0.003 75)",
    "--warning": "oklch(0.672 0.14 78)",
    "--warning-foreground": "oklch(0.21 0.028 255)",
    "--info": "oklch(0.54 0.18 260)",
    "--info-foreground": "oklch(0.99 0.003 75)",
    "--chart-1": "oklch(0.54 0.18 260)",
    "--chart-2": "oklch(0.62 0.16 38)",
    "--chart-3": "oklch(0.66 0.13 78)",
    "--chart-4": "oklch(0.56 0.16 305)",
    "--chart-5": "oklch(0.53 0.09 185)",
    "--radius": "0.45rem",
  },
  dark: {
    "--success": "oklch(0.74 0.12 155)",
    "--success-foreground": "oklch(0.16 0.03 255)",
    "--warning": "oklch(0.8 0.13 78)",
    "--warning-foreground": "oklch(0.16 0.03 255)",
    "--info": "oklch(0.71 0.15 252)",
    "--info-foreground": "oklch(0.16 0.03 255)",
    "--chart-1": "oklch(0.71 0.15 252)",
    "--chart-2": "oklch(0.75 0.14 45)",
    "--chart-3": "oklch(0.8 0.13 78)",
    "--chart-4": "oklch(0.74 0.14 305)",
    "--chart-5": "oklch(0.73 0.11 185)",
    "--radius": "0.45rem",
  },
};

/** Variables that do not depend on light or dark, so a synced theme lends them. */
const APPEARANCE_INDEPENDENT_VARIABLES = ["--radius", "--font-sans", "--font-mono"] as const;

/** Stave's default light or dark theme, for when the user's own is not that appearance. */
export function buildInlineRenderPreviewFallbackTheme(
  appearance: InlineRenderPreviewAppearance,
): InlineRenderTheme {
  const presets = PRESET_THEME_TOKENS[appearance] as Record<string, string>;
  const extended = EXTENDED_FALLBACK_VARIABLES[appearance];
  const variables: Record<string, string> = {};
  for (const name of INLINE_RENDER_THEME_VARIABLES) {
    const value = presets[name.slice(2)] ?? extended[name];
    if (value) variables[name] = value;
  }
  return { appearance, variables };
}

/**
 * The theme a preview applies: the user's current theme when it has the
 * requested appearance, which is exactly what the conversation would show;
 * otherwise Stave's default theme for that appearance, keeping the user's
 * fonts and radius.
 */
export function resolveInlineRenderPreviewTheme(
  appearance: InlineRenderPreviewAppearance,
  synced: InlineRenderTheme | null,
): InlineRenderTheme {
  if (synced && synced.appearance === appearance) return sanitizeInlineRenderTheme(synced);
  const fallback = buildInlineRenderPreviewFallbackTheme(appearance);
  for (const name of APPEARANCE_INDEPENDENT_VARIABLES) {
    const value = synced?.variables[name];
    if (value) fallback.variables[name] = value;
  }
  return sanitizeInlineRenderTheme(fallback);
}

/* ─── What the page reports ──────────────────────────────────────── */

export interface InlineRenderPreviewMessageLog {
  add(text: string): void;
  list(): string[];
}

function truncate(text: string, maxChars: number): string {
  const collapsed = text.trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars - 1)}…` : collapsed;
}

/**
 * A capped, de-duplicated list. A repeated message (an error thrown on every
 * animation frame) counts once with a multiplier instead of crowding out the
 * rest, and anything past the cap is summarised in a last line.
 */
export function createInlineRenderPreviewMessageLog(options: {
  maxEntries: number;
  maxChars?: number;
}): InlineRenderPreviewMessageLog {
  const maxChars = options.maxChars ?? INLINE_RENDER_PREVIEW_MAX_MESSAGE_CHARS;
  const counts = new Map<string, number>();
  let omitted = 0;
  return {
    add(text) {
      const entry = truncate(text, maxChars);
      if (!entry) return;
      const count = counts.get(entry);
      if (count !== undefined) {
        counts.set(entry, count + 1);
      } else if (counts.size < options.maxEntries) {
        counts.set(entry, 1);
      } else {
        omitted += 1;
      }
    },
    list() {
      const entries = [...counts].map(([entry, count]) =>
        count > 1 ? `${entry} (×${count})` : entry,
      );
      // i18n-ignore: model-facing tool result, read by the agent, not the user
      if (omitted > 0) entries.push(`${omitted} more omitted`);
      return entries;
    },
  };
}

/**
 * Lines the page's own document reports are counted in the prepared document,
 * which has Stave's bootstrap in front of the page. This is how many lines to
 * take off so they match the HTML the agent wrote.
 */
export function inlineRenderPreviewLineOffset(html: string, prepared: string): number {
  return Math.max(0, countLines(prepared) - countLines(html));
}

function countLines(text: string): number {
  let lines = 1;
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    lines += 1;
  }
  return lines;
}

/**
 * Whether a console message is the page's problem: warnings and errors only,
 * and not Electron's own development notices, which come from its internal
 * scripts and never appear in a packaged app.
 */
export function shouldReportInlineRenderPreviewConsoleMessage(args: {
  level: string;
  sourceId: string;
}): args is { level: "warning" | "error"; sourceId: string } {
  if (args.level !== "warning" && args.level !== "error") return false;
  return !args.sourceId.startsWith("node:electron/");
}

/** One console line: level, message, and where it came from. */
export function formatInlineRenderPreviewConsoleMessage(args: {
  level: "warning" | "error";
  message: string;
  sourceId: string;
  lineNumber: number;
  documentLineOffset: number;
}): string {
  let location = "";
  if (isInlineRenderUrl(args.sourceId)) {
    const line = args.lineNumber - args.documentLineOffset;
    if (line > 0) location = ` (line ${line})`;
  } else if (args.sourceId) {
    location = args.lineNumber > 0 ? ` (${args.sourceId}:${args.lineNumber})` : ` (${args.sourceId})`;
  }
  return `${args.level}: ${args.message}${location}`;
}

/* ─── Navigation ─────────────────────────────────────────────────── */

/**
 * Whether the preview window must cancel a navigation. Stave's own load never
 * asks (programmatic loads raise no event), so every main-frame navigation is
 * the page trying to leave and is refused. A nested frame may load what the
 * page's CSP allows, as it could in the conversation, but never a render.
 */
export function shouldBlockInlineRenderPreviewNavigation(args: {
  isMainFrame: boolean;
  isSameDocument: boolean;
  targetUrl: string;
}): boolean {
  if (args.isSameDocument) return false;
  if (args.isMainFrame) return true;
  return isInlineRenderUrl(args.targetUrl);
}

/* ─── Viewport and capture ───────────────────────────────────────── */

/** The viewport height that shows `contentHeight`, within the capture cap. */
export function nextInlineRenderPreviewViewport(contentHeight: number): number {
  return Math.min(
    INLINE_RENDER_PREVIEW_MAX_CAPTURE_HEIGHT,
    Math.max(INLINE_RENDER_MIN_HEIGHT, Math.ceil(contentHeight)),
  );
}

/** How much of the page is captured: the content, at least the frame's minimum, at most the viewport. */
export function inlineRenderPreviewCaptureHeight(contentHeight: number, viewportHeight: number): number {
  return Math.min(Math.max(Math.ceil(contentHeight), INLINE_RENDER_MIN_HEIGHT), viewportHeight);
}

/** Top-to-bottom slices of the capture. */
export function planInlineRenderPreviewSlices(
  capturedHeight: number,
  sliceHeight: number = INLINE_RENDER_PREVIEW_SLICE_HEIGHT,
): Array<{ top: number; height: number }> {
  const slices: Array<{ top: number; height: number }> = [];
  for (let top = 0; top < capturedHeight; top += sliceHeight) {
    slices.push({ top, height: Math.min(sliceHeight, capturedHeight - top) });
  }
  return slices;
}

/* ─── Result ─────────────────────────────────────────────────────── */

export interface InlineRenderPreviewMeasurement {
  width: number;
  appearance: InlineRenderPreviewAppearance;
  networkPolicy: InlineRenderNetworkPolicy;
  /** Content height at the first viewport, before it grew to fit. */
  firstContentHeight: number;
  contentHeight: number;
  viewportHeight: number;
  capturedHeight: number;
  loadTimedOut: boolean;
  consoleMessages: string[];
  failedRequests: string[];
  blockedNavigations: string[];
}

export interface InlineRenderPreviewImage {
  /** Base64, no data URL prefix. */
  data: string;
  mimeType: "image/png" | "image/jpeg";
  top: number;
  height: number;
}

/** Hints for problems a screenshot does not make obvious. Model-facing. */
export function buildInlineRenderPreviewNotes(measurement: InlineRenderPreviewMeasurement): string[] {
  const notes: string[] = [];
  const { contentHeight, firstContentHeight, viewportHeight } = measurement;
  if (contentHeight > firstContentHeight && contentHeight >= viewportHeight) {
    notes.push(
      // i18n-ignore: model-facing tool result, read by the agent, not the user
      `The page grew from ${firstContentHeight} px to ${contentHeight} px as its viewport grew to ${viewportHeight} px, so it probably sizes itself to the viewport (vh units or height: 100%). In the conversation its frame would keep growing; let the content set the height.`,
    );
  }
  if (contentHeight > INLINE_RENDER_MAX_HEIGHT) {
    notes.push(
      // i18n-ignore: model-facing tool result, read by the agent, not the user
      `The conversation frame stops growing at ${INLINE_RENDER_MAX_HEIGHT} px; the rest of the page scrolls inside it.`,
    );
  }
  if (measurement.capturedHeight < contentHeight) {
    notes.push(
      // i18n-ignore: model-facing tool result, read by the agent, not the user
      `Only the top ${measurement.capturedHeight} px of ${contentHeight} px were captured.`,
    );
  }
  if (measurement.loadTimedOut) {
    notes.push(
      // i18n-ignore: model-facing tool result, read by the agent, not the user
      `The page was still loading after ${INLINE_RENDER_PREVIEW_LOAD_BUDGET_MS / 1000} s (a slow or unreachable resource) and was captured as it was.`,
    );
  }
  return notes;
}

/** The JSON summary the agent reads next to the images. */
export function buildInlineRenderPreviewSummary(
  measurement: InlineRenderPreviewMeasurement,
  images: readonly Pick<InlineRenderPreviewImage, "top" | "height">[],
) {
  const notes = buildInlineRenderPreviewNotes(measurement);
  return {
    width: measurement.width,
    appearance: measurement.appearance,
    networkPolicy: measurement.networkPolicy,
    contentHeight: measurement.contentHeight,
    /** The height the conversation frame will take before it scrolls. */
    frameHeight: clampInlineRenderHeight(measurement.contentHeight),
    capturedHeight: measurement.capturedHeight,
    images: images.map(({ top, height }) => ({ top, height })),
    consoleMessages: measurement.consoleMessages,
    ...(measurement.failedRequests.length > 0
      ? { failedRequests: measurement.failedRequests }
      : {}),
    ...(measurement.blockedNavigations.length > 0
      ? { blockedNavigations: measurement.blockedNavigations }
      : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/**
 * The MCP result: the summary first, so a host that shows tool output as text
 * leads with it, then the capture as images from top to bottom.
 */
export function buildInlineRenderPreviewToolResult(
  measurement: InlineRenderPreviewMeasurement,
  images: readonly InlineRenderPreviewImage[],
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(buildInlineRenderPreviewSummary(measurement, images), null, 2),
      },
      ...images.map((image) => ({
        type: "image" as const,
        data: image.data,
        mimeType: image.mimeType,
      })),
    ],
  };
}
