import { buildMcpAppCsp, EMPTY_MCP_APP_CSP } from "../../../src/lib/mcp-app/mcp-app-csp";
import { parseMcpAppViewUrl } from "../../../src/lib/mcp-app/mcp-app-view";
import { MCP_APP_VIEW_DOCUMENT_PRELUDE } from "../../../src/lib/mcp-app/mcp-app-view-document";
import type { McpAppViewStore } from "./mcp-app-view-store";

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

function refuse(status: number): Response {
  return new Response(null, {
    status,
    headers: { ...BASE_HEADERS, "Content-Security-Policy": buildMcpAppCsp(EMPTY_MCP_APP_CSP) },
  });
}

const LEADING_DOCTYPE_PATTERN = /^﻿?\s*<!doctype[^>]*>/i;

/**
 * Answers one request for an MCP App view on the inline render scheme. The
 * view is served as the server returned it, after a doctype (added when
 * missing, so it renders in standards mode) and the document prelude
 * (`mcp-app-view-document.ts`), under a CSP built from the domains its
 * resource declared, never from anything in the URL.
 */
export async function respondToMcpAppViewRequest(args: {
  url: string;
  method: string;
  store: Pick<McpAppViewStore, "read">;
}): Promise<Response> {
  if (args.method !== "GET") return refuse(405);
  const target = parseMcpAppViewUrl(args.url);
  if (!target) return refuse(404);
  const view = await args.store.read(target.viewId);
  if (!view) return refuse(404);
  const doctype = LEADING_DOCTYPE_PATTERN.exec(view.html)?.[0] ?? "";
  const html = `${doctype || "<!doctype html>"}${MCP_APP_VIEW_DOCUMENT_PRELUDE}${view.html.slice(doctype.length)}`;
  return new Response(html, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildMcpAppCsp(view.record.csp),
    },
  });
}
