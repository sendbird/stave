// ---------------------------------------------------------------------------
// MCP browser tools – registered on the existing stave-mcp-server
//
// These tools let AI agents inspect and interact with the per-workspace
// built-in browser via the Chrome DevTools Protocol (CDP).
// ---------------------------------------------------------------------------

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  destroyBrowserSession,
  getBrowserSession,
  getWebContentsForSession,
  listBrowserSessions,
  setViewVisible,
} from "./browser-manager";
import { ensureBrowserSessionWithEvents } from "./browser-session-events";
import { normalizeLensUrl } from "./browser-url";

import {
  captureScreenshot,
  clickElement,
  evaluateExpression,
  getAccessibilitySnapshot,
  getDocumentHTML,
  getElementBoxModel,
  getTextContent,
  measureElements,
  setElementStyle,
  typeText,
} from "./browser-cdp";
import { triggerDownloadByUrl } from "./browser-downloads";
import { assertNavigationAllowed } from "./browser-security";

const NAVIGATE_TIMEOUT_MS = 30_000;
const DEFAULT_HTML_MAX_CHARS = 20_000;
const MAX_HTML_CHARS = 50_000;
const DEFAULT_LOG_LIMIT = 25;
const MAX_LOG_LIMIT = 200;

// ---------------------------------------------------------------------------
// Helpers (same pattern as stave-mcp-server.ts)
// ---------------------------------------------------------------------------

function toStructuredResult<T>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function requireSession(workspaceId: string, lensSessionId?: string) {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    throw new Error(
      `No browser session for workspace "${workspaceId}"${
        lensSessionId ? ` and lens session "${lensSessionId}"` : ""
      }. Open the Lens panel or call stave_lens_open_session first.`,
    );
  }
  return session;
}

function clampPositiveInteger(
  value: number | undefined,
  args: {
    defaultValue: number;
    maxValue: number;
  },
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return args.defaultValue;
  }
  return Math.max(1, Math.min(args.maxValue, Math.floor(value)));
}

function truncateWithMarker(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return { value, truncated: false };
  }
  return {
    value: `${value.slice(0, Math.max(0, maxChars))}\n<!-- truncated -->`,
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerBrowserTools(server: McpServer): void {
  // ---- Open session ----
  server.registerTool(
    "stave_lens_open_session",
    {
      description:
        "Open or reuse a hidden workspace Lens browser session so agents can inspect a live page without the user opening the right rail panel first.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        url: z
          .string()
          .optional()
          .describe("Optional URL to navigate to after opening the session"),
        sessionScope: z
          .enum(["project", "workspace"])
          .optional()
          .describe(
            "Optional Lens browser storage scope. Defaults to workspace when projectKey is omitted.",
          ),
        projectKey: z
          .string()
          .optional()
          .describe(
            "Stable project/repository identity used with sessionScope=project. Stave hashes this before selecting a partition.",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, url, sessionScope, projectKey }) => {
      const { session, created } = ensureBrowserSessionWithEvents(workspaceId, {
        managedByMcp: true,
        sessionScope,
        projectKey,
        lensSessionId,
      });
      if (created) {
        setViewVisible(workspaceId, false, session.lensSessionId);
      }

      if (url?.trim()) {
        const targetUrl = normalizeLensUrl(url);
        assertNavigationAllowed(targetUrl);
        await Promise.race([
          session.view.webContents.loadURL(targetUrl),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Navigation timed out after ${NAVIGATE_TIMEOUT_MS / 1000}s`,
                  ),
                ),
              NAVIGATE_TIMEOUT_MS,
            ),
          ),
        ]);
      }

      return toStructuredResult({
        ok: true,
        created,
        session: {
          workspaceId,
          lensSessionId: session.lensSessionId,
          url: session.view.webContents.getURL(),
          title: session.view.webContents.getTitle(),
          isLoading: session.view.webContents.isLoading(),
        },
      });
    },
  );

  // ---- Close session ----
  server.registerTool(
    "stave_lens_close_session",
    {
      description:
        "Close a workspace Lens browser session that was opened for MCP inspection. User-opened Lens panel sessions require force=true.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        force: z
          .boolean()
          .optional()
          .describe(
            "Close the session even if it is currently owned by the Lens panel UI",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, force }) => {
      const session = getBrowserSession(workspaceId, lensSessionId);
      const existed = Boolean(session);
      if (session && !session.managedByMcp && force !== true) {
        return toStructuredResult({
          ok: false,
          closed: false,
          message:
            "Lens session is owned by the UI panel. Pass force=true to close it.",
        });
      }
      destroyBrowserSession(workspaceId, lensSessionId);
      return toStructuredResult({ ok: true, closed: existed });
    },
  );

  // ---- Navigate ----
  server.registerTool(
    "stave_lens_navigate",
    {
      description:
        "Navigate the workspace Lens browser to a URL. Open a session first with stave_lens_open_session or the right rail Lens panel.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        url: z.string().describe("URL to navigate to"),
      },
    },
    async ({ workspaceId, lensSessionId, url }) => {
      requireSession(workspaceId, lensSessionId);
      const wc = getWebContentsForSession(workspaceId, lensSessionId);
      if (!wc) throw new Error("WebContents not available");

      const targetUrl = normalizeLensUrl(url);
      assertNavigationAllowed(targetUrl);

      await Promise.race([
        wc.loadURL(targetUrl),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Navigation timed out after ${NAVIGATE_TIMEOUT_MS / 1000}s`,
                ),
              ),
            NAVIGATE_TIMEOUT_MS,
          ),
        ),
      ]);

      return toStructuredResult({
        ok: true,
        url: wc.getURL(),
        title: wc.getTitle(),
      });
    },
  );

  // ---- Screenshot ----
  server.registerTool(
    "stave_lens_screenshot",
    {
      description:
        "Take a screenshot of the current page in the workspace Lens browser. Prefer selector screenshots for focused visual checks. Returns a base64-encoded PNG data URL.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        fullPage: z
          .boolean()
          .optional()
          .describe(
            "Capture the full scrollable page (default: viewport only)",
          ),
        selector: z
          .string()
          .optional()
          .describe(
            "CSS selector of an element to screenshot. Clips to its bounding box.",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, fullPage, selector }) => {
      if (fullPage && selector) {
        throw new Error(
          "fullPage and selector are mutually exclusive — use one or the other.",
        );
      }

      const session = requireSession(workspaceId, lensSessionId);

      let clip:
        { x: number; y: number; width: number; height: number } | undefined;
      if (selector) {
        const box = (await evaluateExpression(
          session.view.webContents.id,
          `
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })()
        `,
        )) as { x: number; y: number; width: number; height: number } | null;
        if (box) clip = box;
      }

      const dataUrl = await captureScreenshot(session.view.webContents.id, {
        fullPage,
        clip,
      });

      return {
        content: [
          {
            type: "image" as const,
            data: dataUrl.replace(/^data:image\/png;base64,/, ""),
            mimeType: "image/png" as const,
          },
        ],
      };
    },
  );

  // ---- Get HTML ----
  server.registerTool(
    "stave_lens_get_html",
    {
      description:
        "Get bounded outerHTML from the workspace Lens browser. Prefer stave_lens_snapshot or scoped stave_lens_get_text first; pass selector and maxChars when raw HTML is necessary.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        selector: z
          .string()
          .optional()
          .describe(
            "CSS selector. If omitted returns document HTML bounded by maxChars.",
          ),
        maxChars: z
          .number()
          .optional()
          .describe(
            "Maximum characters to return (default 20 000, capped at 50 000).",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, selector, maxChars }) => {
      const session = requireSession(workspaceId, lensSessionId);
      let html = await getDocumentHTML(session.view.webContents.id, selector);
      const resolvedMaxChars = clampPositiveInteger(maxChars, {
        defaultValue: DEFAULT_HTML_MAX_CHARS,
        maxValue: MAX_HTML_CHARS,
      });
      const truncated = truncateWithMarker(html, resolvedMaxChars);
      html = truncated.value;
      return toStructuredResult({
        ok: true,
        html,
        truncated: truncated.truncated,
        maxChars: resolvedMaxChars,
      });
    },
  );

  // ---- Get text content ----
  server.registerTool(
    "stave_lens_get_text",
    {
      description:
        "Get the text content of a specific element in the workspace Lens browser. This is the preferred low-token read path for page copy.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        selector: z.string().describe("CSS selector of the target element"),
      },
    },
    async ({ workspaceId, lensSessionId, selector }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const text = await getTextContent(session.view.webContents.id, selector);
      return toStructuredResult({ ok: true, text });
    },
  );

  // ---- Evaluate JS ----
  server.registerTool(
    "stave_lens_evaluate",
    {
      description:
        "Evaluate a JavaScript expression in the workspace Lens browser page context and return the result.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        expression: z
          .string()
          .describe("JavaScript expression to evaluate (must be serialisable)"),
      },
    },
    async ({ workspaceId, lensSessionId, expression }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const result = await evaluateExpression(
        session.view.webContents.id,
        expression,
      );
      return toStructuredResult({ ok: true, result });
    },
  );

  // ---- Console log ----
  server.registerTool(
    "stave_lens_get_console",
    {
      description:
        "Get recent console messages from the workspace Lens browser. Keep limit small unless debugging a specific console-heavy issue.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        limit: z
          .number()
          .optional()
          .describe(
            "Number of recent entries to return (default 25, capped at 200)",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, limit }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const entries = session.consoleLog.toArray();
      const n = clampPositiveInteger(limit, {
        defaultValue: DEFAULT_LOG_LIMIT,
        maxValue: MAX_LOG_LIMIT,
      });
      return toStructuredResult({
        ok: true,
        entries: entries.slice(-n),
        limit: n,
        total: entries.length,
      });
    },
  );

  // ---- Network log ----
  server.registerTool(
    "stave_lens_get_network",
    {
      description:
        "Get recent network requests from the workspace Lens browser. Keep limit small unless debugging request ordering or failures.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        limit: z
          .number()
          .optional()
          .describe(
            "Number of recent entries to return (default 25, capped at 200)",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, limit }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const entries = session.networkLog.toArray();
      const n = clampPositiveInteger(limit, {
        defaultValue: DEFAULT_LOG_LIMIT,
        maxValue: MAX_LOG_LIMIT,
      });
      return toStructuredResult({
        ok: true,
        entries: entries.slice(-n),
        limit: n,
        total: entries.length,
      });
    },
  );

  // ---- Download URL ----
  server.registerTool(
    "stave_lens_download",
    {
      description:
        "Download a URL through the workspace Lens browser session and return the saved file path.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        url: z.string().describe("HTTP(S) URL to download"),
        filename: z
          .string()
          .optional()
          .describe("Optional filename to use for the saved file"),
      },
    },
    async ({ workspaceId, lensSessionId, url, filename }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const targetUrl = normalizeLensUrl(url);
      assertNavigationAllowed(targetUrl);
      const entry = await triggerDownloadByUrl(
        session.view.webContents.id,
        targetUrl,
        filename,
      );
      return toStructuredResult({ ok: true, entry, savePath: entry.savePath });
    },
  );

  // ---- List downloads ----
  server.registerTool(
    "stave_lens_list_downloads",
    {
      description:
        "List recent files saved by the workspace Lens browser downloads and screenshot actions.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        limit: z
          .number()
          .optional()
          .describe(
            "Number of recent entries to return (default 25, capped at 200)",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, limit }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const entries = session.downloadLog.toArray();
      const n = clampPositiveInteger(limit, {
        defaultValue: DEFAULT_LOG_LIMIT,
        maxValue: MAX_LOG_LIMIT,
      });
      return toStructuredResult({
        ok: true,
        entries: entries.slice(-n),
        limit: n,
        total: entries.length,
      });
    },
  );

  // ---- Get annotations ----
  server.registerTool(
    "stave_lens_get_annotations",
    {
      description:
        "Read visual comments the user placed in the workspace Lens browser annotation mode.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
      },
    },
    async ({ workspaceId, lensSessionId }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const annotations = await session.view.webContents.executeJavaScript(
        "window.__staveGetAnnotations?.() ?? []",
      );
      return toStructuredResult({ ok: true, annotations });
    },
  );

  // ---- Set element style ----
  server.registerTool(
    "stave_lens_set_style",
    {
      description:
        "Apply a live inline style patch to an element in the workspace Lens browser and return before/after edits.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        selector: z.string().describe("CSS selector of the target element"),
        style: z
          .record(z.string(), z.string())
          .describe(
            "Style patch. Supported keys: fontSize, fontWeight, color, backgroundColor, padding, margin.",
          ),
      },
    },
    async ({ workspaceId, lensSessionId, selector, style }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const edits = await setElementStyle(
        session.view.webContents.id,
        selector,
        style,
      );
      return toStructuredResult({ ok: true, edits });
    },
  );

  // ---- Inspect box model ----
  server.registerTool(
    "stave_lens_inspect",
    {
      description:
        "Inspect an element's box model in the workspace Lens browser - like the Figma/DevTools inspector. Returns the border-box rect, content size, and per-side padding, border, and margin values (in CSS pixels).",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        selector: z.string().describe("CSS selector of the element to inspect"),
      },
    },
    async ({ workspaceId, lensSessionId, selector }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const box = await getElementBoxModel(
        session.view.webContents.id,
        selector,
      );
      return toStructuredResult({ ok: true, box });
    },
  );

  // ---- Measure distance between two elements ----
  server.registerTool(
    "stave_lens_measure",
    {
      description:
        "Measure the pixel gap between two elements in the workspace Lens browser (Figma-style spacing). Returns the horizontal and vertical gaps between their nearest facing edges plus each element's box model.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        selectorA: z.string().describe("CSS selector of the first element"),
        selectorB: z.string().describe("CSS selector of the second element"),
      },
    },
    async ({ workspaceId, lensSessionId, selectorA, selectorB }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const result = await measureElements(
        session.view.webContents.id,
        selectorA,
        selectorB,
      );
      return toStructuredResult({ ok: true, ...result });
    },
  );

  // ---- Click ----
  server.registerTool(
    "stave_lens_click",
    {
      description:
        "Click on an element in the workspace Lens browser by CSS selector.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        selector: z.string().describe("CSS selector of the element to click"),
      },
    },
    async ({ workspaceId, lensSessionId, selector }) => {
      const session = requireSession(workspaceId, lensSessionId);
      await clickElement(session.view.webContents.id, selector);
      return toStructuredResult({ ok: true });
    },
  );

  // ---- Type ----
  server.registerTool(
    "stave_lens_type",
    {
      description:
        "Type text into the currently focused element (or a specified element) in the workspace Lens browser.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
        text: z.string().describe("Text to type"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector of the element to focus before typing"),
      },
    },
    async ({ workspaceId, lensSessionId, text, selector }) => {
      const session = requireSession(workspaceId, lensSessionId);
      await typeText(session.view.webContents.id, text, selector);
      return toStructuredResult({ ok: true });
    },
  );

  // ---- Accessibility snapshot ----
  server.registerTool(
    "stave_lens_snapshot",
    {
      description:
        "Get a compact accessibility tree snapshot of the current page. Use this as the first Lens read before raw HTML, console, or network dumps.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        lensSessionId: z
          .string()
          .optional()
          .describe(
            'Lens session id within the workspace (defaults to "default", the session the Lens panel uses)',
          ),
      },
    },
    async ({ workspaceId, lensSessionId }) => {
      const session = requireSession(workspaceId, lensSessionId);
      const tree = await getAccessibilitySnapshot(session.view.webContents.id);
      return toStructuredResult({ ok: true, tree });
    },
  );

  // ---- List sessions (workspace discovery) ----
  server.registerTool(
    "stave_lens_list_sessions",
    {
      description:
        "List all active Lens browser sessions. Use this to discover valid workspaceId values for other stave_lens_* tools.",
      inputSchema: {},
    },
    async () => {
      const sessions = listBrowserSessions();
      return toStructuredResult({ ok: true, sessions });
    },
  );
}
