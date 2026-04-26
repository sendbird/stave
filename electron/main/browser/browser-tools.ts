// ---------------------------------------------------------------------------
// MCP browser tools – registered on the existing stave-mcp-server
//
// These tools let AI agents inspect and interact with the per-workspace
// built-in browser via the Chrome DevTools Protocol (CDP).
// ---------------------------------------------------------------------------

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getBrowserSession,
  getWebContentsForSession,
  listBrowserSessions,
} from "./browser-manager";
import { normalizeLensUrl } from "./browser-url";

const NAVIGATE_TIMEOUT_MS = 30_000;
import {
  captureScreenshot,
  clickElement,
  evaluateExpression,
  getAccessibilitySnapshot,
  getDocumentHTML,
  getTextContent,
  typeText,
} from "./browser-cdp";

// ---------------------------------------------------------------------------
// Helpers (same pattern as stave-mcp-server.ts)
// ---------------------------------------------------------------------------

function toStructuredResult<T>(value: T) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
    ],
    structuredContent: value,
  };
}

function requireSession(workspaceId: string) {
  const session = getBrowserSession(workspaceId);
  if (!session) {
    throw new Error(
      `No browser session for workspace "${workspaceId}". Open the Lens panel first.`,
    );
  }
  return session;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerBrowserTools(server: McpServer): void {
  // ---- Navigate ----
  server.registerTool(
    "stave_lens_navigate",
    {
      description:
        "Navigate the workspace Lens browser to a URL. The browser must be open in the right rail panel.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        url: z.string().describe("URL to navigate to"),
      },
    },
    async ({ workspaceId, url }) => {
      const session = requireSession(workspaceId);
      const wc = getWebContentsForSession(workspaceId);
      if (!wc) throw new Error("WebContents not available");

      const targetUrl = normalizeLensUrl(url);

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
        "Take a screenshot of the current page in the workspace Lens browser. Returns a base64-encoded PNG data URL.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        fullPage: z
          .boolean()
          .optional()
          .describe("Capture the full scrollable page (default: viewport only)"),
        selector: z
          .string()
          .optional()
          .describe(
            "CSS selector of an element to screenshot. Clips to its bounding box.",
          ),
      },
    },
    async ({ workspaceId, fullPage, selector }) => {
      if (fullPage && selector) {
        throw new Error(
          "fullPage and selector are mutually exclusive — use one or the other.",
        );
      }

      const session = requireSession(workspaceId);

      let clip: { x: number; y: number; width: number; height: number } | undefined;
      if (selector) {
        const box = (await evaluateExpression(session.view.webContents.id, `
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })()
        `)) as { x: number; y: number; width: number; height: number } | null;
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
        "Get the outerHTML of the page or a specific element in the workspace Lens browser.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        selector: z
          .string()
          .optional()
          .describe(
            "CSS selector. If omitted returns the full document HTML (truncated to 50 000 chars).",
          ),
      },
    },
    async ({ workspaceId, selector }) => {
      const session = requireSession(workspaceId);
      let html = await getDocumentHTML(session.view.webContents.id, selector);
      if (html.length > 50_000) {
        html = html.slice(0, 50_000) + "\n<!-- truncated -->";
      }
      return toStructuredResult({ ok: true, html });
    },
  );

  // ---- Get text content ----
  server.registerTool(
    "stave_lens_get_text",
    {
      description:
        "Get the text content of a specific element in the workspace Lens browser.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        selector: z.string().describe("CSS selector of the target element"),
      },
    },
    async ({ workspaceId, selector }) => {
      const session = requireSession(workspaceId);
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
        expression: z
          .string()
          .describe("JavaScript expression to evaluate (must be serialisable)"),
      },
    },
    async ({ workspaceId, expression }) => {
      const session = requireSession(workspaceId);
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
        "Get recent console messages from the workspace Lens browser (up to 200 buffered).",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        limit: z
          .number()
          .optional()
          .describe("Number of recent entries to return (default 50)"),
      },
    },
    async ({ workspaceId, limit }) => {
      const session = requireSession(workspaceId);
      const entries = session.consoleLog.toArray();
      const n = limit ?? 50;
      return toStructuredResult({
        ok: true,
        entries: entries.slice(-n),
        total: entries.length,
      });
    },
  );

  // ---- Network log ----
  server.registerTool(
    "stave_lens_get_network",
    {
      description:
        "Get recent network requests from the workspace Lens browser (up to 200 buffered).",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
        limit: z
          .number()
          .optional()
          .describe("Number of recent entries to return (default 50)"),
      },
    },
    async ({ workspaceId, limit }) => {
      const session = requireSession(workspaceId);
      const entries = session.networkLog.toArray();
      const n = limit ?? 50;
      return toStructuredResult({
        ok: true,
        entries: entries.slice(-n),
        total: entries.length,
      });
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
        selector: z.string().describe("CSS selector of the element to click"),
      },
    },
    async ({ workspaceId, selector }) => {
      const session = requireSession(workspaceId);
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
        text: z.string().describe("Text to type"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector of the element to focus before typing"),
      },
    },
    async ({ workspaceId, text, selector }) => {
      const session = requireSession(workspaceId);
      await typeText(session.view.webContents.id, text, selector);
      return toStructuredResult({ ok: true });
    },
  );

  // ---- Accessibility snapshot ----
  server.registerTool(
    "stave_lens_snapshot",
    {
      description:
        "Get an accessibility tree snapshot of the current page, useful for understanding page structure without reading raw HTML.",
      inputSchema: {
        workspaceId: z.string().describe("Target workspace ID"),
      },
    },
    async ({ workspaceId }) => {
      const session = requireSession(workspaceId);
      const tree = await getAccessibilitySnapshot(session.view.webContents.id);
      return toStructuredResult({ ok: true, tree });
    },
  );

  // ---- List sessions (workspace discovery) ----
  server.registerTool(
    "stave_lens_list_sessions",
    {
      description:
        "List all active Lens browser sessions. Use this to discover valid workspaceId values for other stave_lens_* tools. A session exists only while the Lens panel has been opened for that workspace.",
      inputSchema: {},
    },
    async () => {
      const sessions = listBrowserSessions();
      return toStructuredResult({ ok: true, sessions });
    },
  );
}
