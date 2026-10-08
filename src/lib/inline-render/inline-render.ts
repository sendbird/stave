/**
 * Inline renders: HTML pages an agent publishes with `stave_render_html`,
 * shown inside the conversation in a sandboxed frame.
 *
 * The page is untrusted, so three layers keep it away from the app:
 *
 * - It is served from its own scheme, never from the renderer's origin.
 * - The frame omits `allow-same-origin`, so the document runs with an opaque
 *   origin and cannot reach the parent, its storage, or the preload bridge.
 * - Every response carries a CSP whose `sandbox` directive applies even when
 *   the URL is loaded outside the frame, plus the network directives of the
 *   user's chosen policy.
 *
 * This module is the contract the main process and the renderer share: ids,
 * URLs, limits, the CSP for each network policy, the bootstrap the page runs
 * before its own markup, the frame message vocabulary, and the tool result
 * shape the conversation recognises. It is pure so both processes and the
 * tests import the same rules.
 */

export const INLINE_RENDER_SCHEME = "stave-render";
export const INLINE_RENDER_HOST = "frame";

/**
 * `standard` gives the scheme real URL parsing and a host; `secure` makes the
 * page a secure context so https resources are not mixed content. Nothing
 * else: no fetch, CORS, or CSP bypass privileges for agent pages.
 */
export const INLINE_RENDER_SCHEME_PRIVILEGES = {
  standard: true,
  secure: true,
} as const;

export const INLINE_RENDER_MAX_HTML_CHARS = 512_000;
export const INLINE_RENDER_MAX_TITLE_CHARS = 120;
export const INLINE_RENDER_MIN_HEIGHT = 80;
export const INLINE_RENDER_MAX_HEIGHT = 2_000;
export const INLINE_RENDER_DEFAULT_HEIGHT = 360;

/** The frame's sandbox. Never `allow-same-origin`, `allow-popups`, or `allow-modals`. */
export const INLINE_RENDER_FRAME_SANDBOX = "allow-scripts allow-forms";

/* ─── Network policy ─────────────────────────────────────────────── */

export type InlineRenderNetworkPolicy = "open" | "cdn" | "blocked";

export const INLINE_RENDER_NETWORK_POLICIES = [
  "open",
  "cdn",
  "blocked",
] as const satisfies readonly InlineRenderNetworkPolicy[];

export const DEFAULT_INLINE_RENDER_NETWORK_POLICY: InlineRenderNetworkPolicy = "open";

export function normalizeInlineRenderNetworkPolicy(
  value: unknown,
): InlineRenderNetworkPolicy {
  return value === "cdn" || value === "blocked" || value === "open"
    ? value
    : DEFAULT_INLINE_RENDER_NETWORK_POLICY;
}

/** Script, style, and font hosts the `cdn` policy allows. */
export const INLINE_RENDER_CDN_ORIGINS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://cdnjs.cloudflare.com",
  "https://esm.sh",
] as const;

export const INLINE_RENDER_FONT_STYLE_ORIGIN = "https://fonts.googleapis.com";
export const INLINE_RENDER_FONT_FILE_ORIGIN = "https://fonts.gstatic.com";

/**
 * Directives every policy shares. Forms may run their submit handlers but can
 * never navigate, and `<base>` cannot redirect relative URLs.
 */
const COMMON_DIRECTIVES = [
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
];

function networkDirectives(policy: InlineRenderNetworkPolicy): string[] {
  const inline = "'unsafe-inline' 'unsafe-eval'";
  if (policy === "open") {
    return [
      `default-src * data: blob: ${inline}`,
      `script-src * data: blob: ${inline}`,
      "style-src * data: blob: 'unsafe-inline'",
      "img-src * data: blob:",
      "font-src * data:",
      "media-src * data: blob:",
      "connect-src * data: blob:",
      "frame-src *",
      "worker-src * data: blob:",
    ];
  }
  const cdn = policy === "cdn" ? ` ${INLINE_RENDER_CDN_ORIGINS.join(" ")}` : "";
  const fontStyles = policy === "cdn" ? ` ${INLINE_RENDER_FONT_STYLE_ORIGIN}` : "";
  const fontFiles = policy === "cdn" ? ` ${INLINE_RENDER_FONT_FILE_ORIGIN}` : "";
  return [
    "default-src 'none'",
    `script-src blob: ${inline}${cdn}`,
    `style-src 'unsafe-inline'${cdn}${fontStyles}`,
    "img-src data: blob:",
    `font-src data:${cdn}${fontFiles}`,
    "media-src data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src blob:",
  ];
}

/**
 * The CSP for one page. `delivery: "header"` adds the `sandbox` directive,
 * which only a response header can carry; a `<meta>` CSP (the browser-only
 * preview) relies on the frame's sandbox attribute instead.
 */
export function buildInlineRenderCsp(
  policy: InlineRenderNetworkPolicy,
  options?: { delivery?: "header" | "meta" },
): string {
  const directives = [...networkDirectives(policy), ...COMMON_DIRECTIVES];
  if ((options?.delivery ?? "header") === "header") {
    directives.unshift(`sandbox ${INLINE_RENDER_FRAME_SANDBOX}`);
  }
  return directives.join("; ");
}

/* ─── Ids and URLs ───────────────────────────────────────────────── */

const WORKSPACE_KEY_PATTERN = /^[0-9a-f]{16}$/;
const RENDER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A render id is `<workspace key>-<uuid>`: 16 hex characters that name the
 * workspace's render directory, then a random UUID that names the file. Both
 * halves are validated before either touches a path.
 */
export function isInlineRenderId(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 53 || value[16] !== "-") {
    return false;
  }
  return (
    WORKSPACE_KEY_PATTERN.test(value.slice(0, 16)) &&
    RENDER_UUID_PATTERN.test(value.slice(17))
  );
}

export function splitInlineRenderId(renderId: string): {
  workspaceKey: string;
  fileId: string;
} | null {
  if (!isInlineRenderId(renderId)) return null;
  return { workspaceKey: renderId.slice(0, 16), fileId: renderId.slice(17) };
}

export function buildInlineRenderUrl(args: {
  renderId: string;
  networkPolicy: InlineRenderNetworkPolicy;
}): string {
  return `${INLINE_RENDER_SCHEME}://${INLINE_RENDER_HOST}/${args.renderId}?net=${args.networkPolicy}`;
}

/**
 * Reads a render URL back. An unknown or missing `net` value resolves to the
 * most restrictive policy rather than the default, so a malformed URL can only
 * lose network access, never gain it.
 */
export function parseInlineRenderUrl(url: string): {
  renderId: string;
  networkPolicy: InlineRenderNetworkPolicy;
} | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== `${INLINE_RENDER_SCHEME}:` ||
    parsed.host !== INLINE_RENDER_HOST
  ) {
    return null;
  }
  const renderId = parsed.pathname.replace(/^\//, "");
  if (!isInlineRenderId(renderId)) return null;
  const net = parsed.searchParams.get("net");
  const networkPolicy: InlineRenderNetworkPolicy =
    net === "open" || net === "cdn" ? net : "blocked";
  return { renderId, networkPolicy };
}

export function isInlineRenderUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(`${INLINE_RENDER_SCHEME}:`);
}

/**
 * Whether the main process must cancel a frame navigation. A render may only
 * be loaded by the Stave app itself: a page that navigates its own frame, a
 * nested frame that points at a render, or a form that submits are all
 * initiated by a subframe and are refused. In-page (same-document) changes,
 * such as an anchor jump, stay allowed.
 */
export function shouldBlockInlineRenderFrameNavigation(args: {
  isMainFrame: boolean;
  isSameDocument: boolean;
  frameUrl: string | null | undefined;
  targetUrl: string;
  initiatedBySubframe: boolean;
}): boolean {
  if (args.isMainFrame || args.isSameDocument) return false;
  const involvesRender =
    isInlineRenderUrl(args.frameUrl) || isInlineRenderUrl(args.targetUrl);
  return involvesRender && args.initiatedBySubframe;
}

export function clampInlineRenderHeight(
  value: unknown,
  fallback: number = INLINE_RENDER_DEFAULT_HEIGHT,
): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(
    INLINE_RENDER_MAX_HEIGHT,
    Math.max(INLINE_RENDER_MIN_HEIGHT, Math.round(numeric)),
  );
}

export function normalizeInlineRenderTitle(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, INLINE_RENDER_MAX_TITLE_CHARS) || "HTML";
}

/** A file name for "Save as": the title reduced to a portable slug. */
export function buildInlineRenderFileName(title: string): string {
  const slug = title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${slug || "render"}.html`;
}

/* ─── Theme ──────────────────────────────────────────────────────── */

/**
 * Host theme variables a page may read. The names match the app's own role
 * tokens, so a page styled with them follows every built-in and custom theme.
 */
export const INLINE_RENDER_THEME_VARIABLES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--success",
  "--success-foreground",
  "--warning",
  "--warning-foreground",
  "--info",
  "--info-foreground",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--radius",
  "--font-sans",
  "--font-mono",
] as const;

export interface InlineRenderTheme {
  appearance: "light" | "dark";
  variables: Record<string, string>;
}

const THEME_VARIABLE_NAME_PATTERN = /^--[a-z0-9-]{1,64}$/;
const THEME_VALUE_MAX_CHARS = 400;

/** Drops names outside the allowlist and characters that could end a declaration. */
export function sanitizeInlineRenderTheme(theme: InlineRenderTheme): InlineRenderTheme {
  const allowed = new Set<string>(INLINE_RENDER_THEME_VARIABLES);
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.variables)) {
    if (!allowed.has(name) || !THEME_VARIABLE_NAME_PATTERN.test(name)) continue;
    const cleaned = sanitizeThemeValue(value);
    if (cleaned) variables[name] = cleaned;
  }
  return { appearance: theme.appearance === "dark" ? "dark" : "light", variables };
}

function sanitizeThemeValue(value: string): string {
  return String(value).replace(/[;{}<>\\]/g, "").trim().slice(0, THEME_VALUE_MAX_CHARS);
}

/** The fragment that carries the theme for the first paint, before any message. */
export function buildInlineRenderThemeFragment(theme: InlineRenderTheme): string {
  return `#theme=${encodeURIComponent(JSON.stringify(sanitizeInlineRenderTheme(theme)))}`;
}

/* ─── Frame messages ─────────────────────────────────────────────── */

/**
 * The frame speaks JSON-RPC 2.0 over `postMessage`, with the method names of
 * the MCP Apps UI extension, so one host bridge can later serve both these
 * pages and MCP App views.
 */
export const INLINE_RENDER_MESSAGE = {
  sizeChanged: "ui/notifications/size-changed",
  openLink: "ui/open-link",
  hostContextChanged: "ui/notifications/host-context-changed",
} as const;

export type InlineRenderFrameMessage =
  | { kind: "size"; height: number }
  | { kind: "open-link"; url: string };

/** Reads a message from a render frame. Anything unexpected is ignored. */
export function parseInlineRenderFrameMessage(data: unknown): InlineRenderFrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { jsonrpc?: unknown; method?: unknown; params?: unknown };
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") return null;
  const params =
    record.params && typeof record.params === "object"
      ? (record.params as Record<string, unknown>)
      : {};
  if (record.method === INLINE_RENDER_MESSAGE.sizeChanged) {
    const height = params.height;
    return typeof height === "number" && Number.isFinite(height) && height >= 0
      ? { kind: "size", height }
      : null;
  }
  if (record.method === INLINE_RENDER_MESSAGE.openLink) {
    const url = params.url;
    if (typeof url !== "string" || url.length > 4_096) return null;
    return isExternalHttpUrl(url) ? { kind: "open-link", url } : null;
  }
  return null;
}

export function isExternalHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildInlineRenderHostContextMessage(theme: InlineRenderTheme) {
  return {
    jsonrpc: "2.0" as const,
    method: INLINE_RENDER_MESSAGE.hostContextChanged,
    params: sanitizeInlineRenderTheme(theme),
  };
}

/* ─── Document preparation ───────────────────────────────────────── */

/**
 * Runs before any of the page's own markup. It applies the theme from the URL
 * fragment, keeps the theme current from host messages, reports the content
 * height, and turns link clicks and `window.open` into requests the host
 * answers only after a real user click. It never reads anything from the host.
 */
const BOOTSTRAP_SCRIPT = `(function () {
  "use strict";
  var NAME = /^--[a-z0-9-]{1,64}$/;
  var root = document.documentElement;
  var themeStyle = document.getElementById("stave-inline-render-theme");
  function post(message) { try { parent.postMessage(message, "*"); } catch (error) {} }
  function clean(value) { return String(value).replace(/[;{}<>\\\\]/g, "").slice(0, 400); }
  function applyTheme(theme) {
    if (!theme || typeof theme !== "object") return;
    var variables = theme.variables && typeof theme.variables === "object" ? theme.variables : {};
    var dark = theme.appearance === "dark";
    var declarations = [];
    for (var name in variables) {
      if (Object.prototype.hasOwnProperty.call(variables, name) && NAME.test(name)) {
        declarations.push(name + ":" + clean(variables[name]));
      }
    }
    declarations.push("color-scheme:" + (dark ? "dark" : "light"));
    if (themeStyle) themeStyle.textContent = ":root{" + declarations.join(";") + "}";
    root.classList.toggle("dark", dark);
    root.setAttribute("data-theme", dark ? "dark" : "light");
  }
  try {
    var match = /(?:^#|&)theme=([^&]*)/.exec(location.hash);
    if (match) applyTheme(JSON.parse(decodeURIComponent(match[1])));
  } catch (error) {}
  var lastHeight = -1;
  // Measured synchronously, never from an animation frame: Chromium pauses
  // animation frames in a cross-origin frame that is scrolled out of view, and
  // a page must still report its size before the reader scrolls to it.
  function measure() {
    var body = document.body;
    var height = Math.ceil(Math.max(root.getBoundingClientRect().height, body ? body.scrollHeight : 0));
    if (height !== lastHeight) {
      lastHeight = height;
      post({ jsonrpc: "2.0", method: "${INLINE_RENDER_MESSAGE.sizeChanged}", params: { height: height } });
    }
  }
  var observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  if (observer) observer.observe(root);
  document.addEventListener("DOMContentLoaded", function () {
    if (observer && document.body) observer.observe(document.body);
    measure();
  });
  window.addEventListener("load", function () {
    measure();
    // Late layout (web fonts, charts drawn after load) settles within a second.
    setTimeout(measure, 250);
    setTimeout(measure, 1000);
  });
  var nextId = 1;
  function openLink(url) {
    if (!/^https?:\\/\\//i.test(url)) return;
    post({ jsonrpc: "2.0", id: "open-link-" + nextId++, method: "${INLINE_RENDER_MESSAGE.openLink}", params: { url: url } });
  }
  document.addEventListener("click", function (event) {
    var target = event.target;
    var anchor = target && target.closest ? target.closest("a[href]") : null;
    if (!anchor) return;
    var href = anchor.getAttribute("href") || "";
    if (href.charAt(0) === "#") return;
    event.preventDefault();
    openLink(anchor.href);
  }, true);
  window.open = function (url) {
    try { if (url) openLink(String(new URL(String(url), document.baseURI))); } catch (error) {}
    return null;
  };
  window.addEventListener("message", function (event) {
    if (event.source !== parent) return;
    var data = event.data;
    if (data && data.jsonrpc === "2.0" && data.method === "${INLINE_RENDER_MESSAGE.hostContextChanged}") applyTheme(data.params);
  });
})();`;

/**
 * Base rules sit before the page's own styles, so any rule the page writes
 * wins. The page background stays transparent so the conversation shows
 * through.
 */
const BASE_STYLE =
  "html{background:transparent;color:var(--foreground,CanvasText);font-family:var(--font-sans,system-ui,sans-serif);-webkit-font-smoothing:antialiased}body{margin:0}a{color:var(--primary,LinkText)}";

const LEADING_DOCTYPE_PATTERN = /^﻿?\s*<!doctype[^>]*>/i;

/**
 * Puts the bootstrap ahead of the page's own markup. A missing doctype is
 * added so every page renders in standards mode; a `<meta>` CSP (preview
 * only) goes first so it governs every later script.
 */
export function prepareInlineRenderDocument(
  html: string,
  options?: { metaCsp?: string },
): string {
  const doctypeMatch = LEADING_DOCTYPE_PATTERN.exec(html);
  const doctype = doctypeMatch ? doctypeMatch[0].replace(/^﻿?\s*/, "") : "<!doctype html>";
  const rest = doctypeMatch ? html.slice(doctypeMatch[0].length) : html.replace(/^﻿/, "");
  const metaCsp = options?.metaCsp
    ? `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(options.metaCsp)}">`
    : "";
  const head = [
    metaCsp,
    '<meta charset="utf-8">',
    `<style id="stave-inline-render-base">${BASE_STYLE}</style>`,
    '<style id="stave-inline-render-theme"></style>',
    `<script>${BOOTSTRAP_SCRIPT}</script>`,
  ].join("");
  return `${doctype}${head}${rest}`;
}

/** The browser-only preview path: the same document, CSP delivered by `<meta>`. */
export function buildInlineRenderSrcdoc(
  html: string,
  policy: InlineRenderNetworkPolicy,
): string {
  return prepareInlineRenderDocument(html, {
    metaCsp: buildInlineRenderCsp(policy, { delivery: "meta" }),
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* ─── Tool result ────────────────────────────────────────────────── */

export const INLINE_RENDER_TOOL_NAME = "stave_render_html";

/**
 * Whether a provider-decorated tool name is this tool: Claude reports
 * `mcp__stave-local-mcp__stave_render_html`, Codex a dotted or bare name, and
 * ACP providers sometimes a title that contains it. The name is compared as a
 * whole segment, so a longer tool name that merely starts with it does not
 * match.
 */
export function isInlineRenderToolName(toolName: string): boolean {
  return toolName
    .trim()
    .toLowerCase()
    .split(/__|[./:\s]+/)
    .includes(INLINE_RENDER_TOOL_NAME);
}

export const INLINE_RENDER_RESULT_KEY = "staveInlineRender";

export interface InlineRenderReference {
  renderId: string;
  title: string;
  height: number;
}

export function buildInlineRenderToolResult(reference: InlineRenderReference) {
  return {
    [INLINE_RENDER_RESULT_KEY]: { version: 1 as const, ...reference },
    // i18n-ignore: model-facing tool result, read by the agent, not the user
    message:
      "Shown inline in the conversation. Refer to it in your reply instead of repeating its content.",
  };
}

const MAX_RESULT_SEARCH_DEPTH = 4;

/**
 * Finds the render reference in a tool's output text. Providers wrap MCP
 * results differently: Claude passes the text block, Codex serialises the
 * whole result with the text nested in `content[].text` and a copy in
 * `structuredContent`. The reference is matched by its shape, not by tool
 * name, so a renamed or wrapped tool call still renders.
 */
export function parseInlineRenderToolOutput(
  output: string | null | undefined,
): InlineRenderReference | null {
  if (!output || !output.includes(INLINE_RENDER_RESULT_KEY)) return null;
  return findReference(parseJson(output), 0);
}

function findReference(value: unknown, depth: number): InlineRenderReference | null {
  if (depth > MAX_RESULT_SEARCH_DEPTH || value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.includes(INLINE_RENDER_RESULT_KEY)
      ? findReference(parseJson(value), depth + 1)
      : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findReference(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = readReference(record[INLINE_RENDER_RESULT_KEY]);
  if (direct) return direct;
  for (const key of ["structuredContent", "content", "text", "result"]) {
    if (key in record) {
      const found = findReference(record[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function readReference(value: unknown): InlineRenderReference | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isInlineRenderId(record.renderId)) return null;
  const title =
    typeof record.title === "string" ? normalizeInlineRenderTitle(record.title) : "HTML";
  return {
    renderId: record.renderId,
    title,
    height: clampInlineRenderHeight(record.height),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The page HTML from a tool call's input, for the browser-only preview where
 * the render store is unreachable. Returns null when the input is not the
 * tool's arguments.
 */
export function readInlineRenderInputHtml(input: string | null | undefined): string | null {
  const parsed = input ? parseJson(input) : undefined;
  if (!parsed || typeof parsed !== "object") return null;
  const html = (parsed as { html?: unknown }).html;
  return typeof html === "string" && html.length > 0 && html.length <= INLINE_RENDER_MAX_HTML_CHARS
    ? html
    : null;
}
