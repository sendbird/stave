/**
 * MCP App views: the `ui://` HTML resource a third-party MCP tool names in its
 * metadata (MCP Apps UI extension, spec 2026-01-26), shown in that tool's row.
 *
 * This module is the contract the provider runtimes, the main process, and
 * the renderer share: the extension's names and limits, how a tool's and a
 * resource's `_meta.ui` are read, which resource content is the view, and
 * the reference a tool part carries so the conversation knows a row has a
 * view. It is pure so every process and the tests apply the same rules.
 *
 * A view is untrusted third-party HTML. It is served from the inline render
 * scheme under its own path, with a CSP built only from the domains the
 * resource declared (`mcp-app-csp.ts`), in a frame without
 * `allow-same-origin`.
 */
import {
  INLINE_RENDER_HOST,
  INLINE_RENDER_SCHEME,
  isInlineRenderId,
} from "@/lib/inline-render/inline-render";

export const MCP_APP_EXTENSION_ID = "io.modelcontextprotocol/ui";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MCP_APP_PROTOCOL_VERSION = "2026-01-26";

/** The largest view HTML Stave captures. */
export const MCP_APP_MAX_HTML_BYTES = 5 * 1024 * 1024;
/** How long a provider runtime waits for the view resource at call completion. */
export const MCP_APP_RESOURCE_TIMEOUT_MS = 20_000;
/** The largest tool input or result Stave keeps for a view, serialised. */
export const MCP_APP_MAX_TOOL_PAYLOAD_CHARS = 1_000_000;
/** Messages a view sends larger than this are refused. */
export const MCP_APP_MAX_MESSAGE_CHARS = 256 * 1024;
/** Requests a view may have waiting on the host at once. */
export const MCP_APP_MAX_IN_FLIGHT_REQUESTS = 16;
/** The most text a view may leave for the agent's next turn. */
export const MCP_APP_MAX_MODEL_CONTEXT_CHARS = 16 * 1024;
/** The most text a view may queue as a user message. */
export const MCP_APP_MAX_USER_MESSAGE_CHARS = 32 * 1024;

const MAX_URI_CHARS = 2_048;
const MAX_NAME_CHARS = 200;
const MAX_APP_TOOLS = 256;

export type McpAppViewProvider = "codex" | "claude-code";
export type McpAppVisibility = "model" | "app";
export type McpAppDisplayMode = "inline" | "fullscreen";

/* ─── Tool metadata ──────────────────────────────────────────────── */

export interface McpAppToolUiMeta {
  resourceUri: string;
  visibility: McpAppVisibility[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isMcpAppResourceUri(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > "ui://".length &&
    value.length <= MAX_URI_CHARS &&
    value.startsWith("ui://") &&
    !/[\s\u0000-\u001f]/.test(value)
  );
}

function readVisibility(value: unknown): McpAppVisibility[] {
  // Omitted visibility means both, per the extension.
  if (!Array.isArray(value)) return ["model", "app"];
  const visibility = value.filter(
    (entry): entry is McpAppVisibility => entry === "model" || entry === "app",
  );
  return [...new Set(visibility)];
}

/**
 * A tool's view, from its `_meta`: `_meta.ui.resourceUri`, or the deprecated
 * flat `_meta["ui/resourceUri"]`. Null when the tool declares no view.
 */
export function readMcpAppToolUiMeta(meta: unknown): McpAppToolUiMeta | null {
  if (!isRecord(meta)) return null;
  const ui = isRecord(meta.ui) ? meta.ui : null;
  const resourceUri = isMcpAppResourceUri(ui?.resourceUri)
    ? ui.resourceUri
    : isMcpAppResourceUri(meta["ui/resourceUri"])
      ? meta["ui/resourceUri"]
      : null;
  if (!resourceUri) return null;
  return { resourceUri, visibility: readVisibility(ui?.visibility) };
}

/** What a view may know about a tool on its own server, for `tools/call`. */
export interface McpAppToolDescriptor {
  name: string;
  title?: string;
  readOnlyHint: boolean;
  visibility: McpAppVisibility[];
}

/**
 * One tool from a provider's server status: MCP `annotations.readOnlyHint`
 * (Codex) or the SDK's `annotations.readOnly` (Claude).
 */
export function readMcpAppToolDescriptor(tool: unknown): McpAppToolDescriptor | null {
  if (!isRecord(tool) || typeof tool.name !== "string") return null;
  const name = tool.name.trim();
  if (!name || name.length > MAX_NAME_CHARS) return null;
  const annotations = isRecord(tool.annotations) ? tool.annotations : {};
  const ui = isRecord(tool._meta) && isRecord(tool._meta.ui) ? tool._meta.ui : null;
  return {
    name,
    ...(typeof tool.title === "string" && tool.title.trim()
      ? { title: tool.title.trim().slice(0, MAX_NAME_CHARS) }
      : {}),
    readOnlyHint: annotations.readOnlyHint === true || annotations.readOnly === true,
    visibility: readVisibility(ui?.visibility),
  };
}

export function readMcpAppToolDescriptors(tools: unknown): McpAppToolDescriptor[] {
  const list = Array.isArray(tools) ? tools : isRecord(tools) ? Object.values(tools) : [];
  const seen = new Set<string>();
  const descriptors: McpAppToolDescriptor[] = [];
  for (const tool of list) {
    const descriptor = readMcpAppToolDescriptor(tool);
    if (!descriptor || seen.has(descriptor.name)) continue;
    seen.add(descriptor.name);
    descriptors.push(descriptor);
    if (descriptors.length >= MAX_APP_TOOLS) break;
  }
  return descriptors;
}

/** Descriptors as Stave stored them (not a server's tool list): malformed entries drop out. */
export function normalizeMcpAppToolDescriptors(value: unknown): McpAppToolDescriptor[] {
  if (!Array.isArray(value)) return [];
  const descriptors: McpAppToolDescriptor[] = [];
  for (const entry of value.slice(0, MAX_APP_TOOLS)) {
    if (!isRecord(entry) || !isName(entry.name) || !Array.isArray(entry.visibility)) continue;
    descriptors.push({
      name: entry.name,
      ...(isName(entry.title) ? { title: entry.title } : {}),
      readOnlyHint: entry.readOnlyHint === true,
      visibility: readVisibility(entry.visibility),
    });
  }
  return descriptors;
}

/* ─── Resource content ───────────────────────────────────────────── */

export interface McpAppCspDeclaration {
  connectDomains?: unknown;
  resourceDomains?: unknown;
  frameDomains?: unknown;
  baseUriDomains?: unknown;
}

export interface McpAppPermissions {
  camera?: boolean;
  microphone?: boolean;
  geolocation?: boolean;
  clipboardWrite?: boolean;
}

export interface McpAppResourceUiMeta {
  csp: McpAppCspDeclaration;
  permissions: McpAppPermissions;
  prefersBorder: boolean | null;
}

/** A view resource's `_meta.ui`: its declared CSP domains, permissions, and border preference. */
export function readMcpAppResourceUiMeta(meta: unknown): McpAppResourceUiMeta {
  const ui = isRecord(meta) && isRecord(meta.ui) ? meta.ui : {};
  const csp = isRecord(ui.csp) ? ui.csp : {};
  const declared = isRecord(ui.permissions) ? ui.permissions : {};
  const permissions: McpAppPermissions = {};
  for (const key of ["camera", "microphone", "geolocation", "clipboardWrite"] as const) {
    if (isRecord(declared[key])) permissions[key] = true;
  }
  return {
    csp: {
      connectDomains: csp.connectDomains,
      resourceDomains: csp.resourceDomains,
      frameDomains: csp.frameDomains,
      baseUriDomains: csp.baseUriDomains,
    },
    permissions,
    prefersBorder: typeof ui.prefersBorder === "boolean" ? ui.prefersBorder : null,
  };
}

function isMcpAppMimeType(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.replace(/\s+/g, "").toLowerCase() === MCP_APP_MIME_TYPE
  );
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function decodeBase64Utf8(blob: string): string | null {
  try {
    const binary = atob(blob);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export type McpAppHtmlSelection =
  | { ok: true; html: string; meta: McpAppResourceUiMeta }
  | { ok: false; reason: "missing" | "mime" | "too-large" | "invalid" };

/**
 * The view from a `resources/read` result: the content for the requested URI
 * (or the only content), with the extension's MIME type, as text or base64,
 * within the size bound. Anything else is not a view.
 */
export function selectMcpAppHtmlContent(
  contents: unknown,
  uri: string,
  maxBytes: number = MCP_APP_MAX_HTML_BYTES,
): McpAppHtmlSelection {
  const list = Array.isArray(contents) ? contents.filter(isRecord) : [];
  const content =
    list.find((entry) => entry.uri === uri) ?? (list.length === 1 ? list[0] : undefined);
  if (!content) return { ok: false, reason: "missing" };
  if (!isMcpAppMimeType(content.mimeType)) return { ok: false, reason: "mime" };
  let html: string | null = null;
  if (typeof content.text === "string") {
    html = content.text;
  } else if (typeof content.blob === "string") {
    // Base64 is 4/3 the size of its bytes; refuse before decoding a huge blob.
    if (content.blob.length > Math.ceil((maxBytes * 4) / 3) + 4) {
      return { ok: false, reason: "too-large" };
    }
    html = decodeBase64Utf8(content.blob);
  }
  if (html === null || html.trim().length === 0) return { ok: false, reason: "invalid" };
  if (html.length > maxBytes || utf8ByteLength(html) > maxBytes) {
    return { ok: false, reason: "too-large" };
  }
  return { ok: true, html, meta: readMcpAppResourceUiMeta(content._meta) };
}

/* ─── Tool part reference ────────────────────────────────────────── */

/**
 * What a tool part carries when its call produced a view. The runtime sets it
 * when it captured the view; the conversation identifies view rows by this
 * reference, never by tool name.
 */
export interface McpAppViewReference {
  version: 1;
  viewId: string;
  provider: McpAppViewProvider;
  server: string;
  tool: string;
  resourceUri: string;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_NAME_CHARS;
}

export function readMcpAppViewReference(value: unknown): McpAppViewReference | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!isInlineRenderId(value.viewId)) return null;
  if (value.provider !== "codex" && value.provider !== "claude-code") return null;
  if (!isName(value.server) || !isName(value.tool)) return null;
  if (!isMcpAppResourceUri(value.resourceUri)) return null;
  return {
    version: 1,
    viewId: value.viewId,
    provider: value.provider,
    server: value.server,
    tool: value.tool,
    resourceUri: value.resourceUri,
  };
}

/** Claude Code's name for an MCP server or tool inside `mcp__<server>__<tool>`. */
export function normalizeClaudeMcpNameSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildClaudeMcpToolName(server: string, tool: string): string {
  return `mcp__${normalizeClaudeMcpNameSegment(server)}__${normalizeClaudeMcpNameSegment(tool)}`;
}

/** The tool name each runtime reports for a server's tool. */
export function mcpAppToolNameFor(reference: Pick<McpAppViewReference, "provider" | "server" | "tool">): string {
  return reference.provider === "codex"
    ? `${reference.server}:${reference.tool}`
    : buildClaudeMcpToolName(reference.server, reference.tool);
}

/**
 * The view a tool part shows. The reference must name the part's own server
 * and tool, so a result that claims another server's view (or a row for a
 * different tool) shows none.
 */
export function readMcpAppViewFromToolPart(part: {
  toolName: string;
  mcpAppView?: unknown;
}): McpAppViewReference | null {
  const reference = readMcpAppViewReference(part.mcpAppView);
  if (!reference) return null;
  return mcpAppToolNameFor(reference) === part.toolName ? reference : null;
}

/* ─── URLs ───────────────────────────────────────────────────────── */

export const MCP_APP_VIEW_PATH = "mcp-app";

export function buildMcpAppViewUrl(viewId: string): string {
  return `${INLINE_RENDER_SCHEME}://${INLINE_RENDER_HOST}/${MCP_APP_VIEW_PATH}/${viewId}`;
}

export function parseMcpAppViewUrl(url: string): { viewId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${INLINE_RENDER_SCHEME}:` || parsed.host !== INLINE_RENDER_HOST) {
    return null;
  }
  const prefix = `/${MCP_APP_VIEW_PATH}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  const viewId = parsed.pathname.slice(prefix.length);
  return isInlineRenderId(viewId) ? { viewId } : null;
}

export function isMcpAppViewUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith(`/${MCP_APP_VIEW_PATH}/`);
  } catch {
    return false;
  }
}

/* ─── Tool payloads ──────────────────────────────────────────────── */

/** Tool arguments as the view's `tool-input` notification needs them: an object. */
export function normalizeMcpAppToolInput(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  return boundedJson(parsed) ? parsed : null;
}

/** A tool result as the view's `tool-result` notification needs it: a CallToolResult. */
export function normalizeMcpAppToolResult(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !Array.isArray(value.content)) return null;
  const result: Record<string, unknown> = { content: value.content };
  if ("structuredContent" in value && value.structuredContent !== undefined) {
    result.structuredContent = value.structuredContent;
  }
  if (typeof value.isError === "boolean") result.isError = value.isError;
  if (isRecord(value._meta)) result._meta = value._meta;
  return boundedJson(result) ? result : null;
}

function boundedJson(value: unknown): boolean {
  try {
    return JSON.stringify(value).length <= MCP_APP_MAX_TOOL_PAYLOAD_CHARS;
  } catch {
    return false;
  }
}
