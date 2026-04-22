/**
 * stave-mcp-stdio-proxy
 *
 * Standalone Node.js script (no Electron APIs).
 * Bridges the MCP stdio transport to the stave-local HTTP MCP server so that
 * runtimes such as Codex — which cannot reach 127.0.0.1 loopback endpoints —
 * can use stave-local MCP via a stdio subprocess instead.
 *
 * Usage (invoked by Agentize / MCP host):
 *   node stave-mcp-stdio-proxy.mjs
 *
 * The script locates the running server by reading the manifest file that the
 * Stave Electron app writes to the user's `.stave/local-mcp.json` manifest on startup.
 *
 * Protocol:
 *   stdin  → newline-delimited JSON-RPC 2.0 requests / notifications
 *   stdout → newline-delimited JSON-RPC 2.0 responses
 *   stderr → diagnostic messages (never part of the MCP stream)
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Utf8LineBuffer } from "../shared/utf8-line-buffer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaveManifest {
  url: string;
  token: string;
}

// ---------------------------------------------------------------------------
// Manifest resolution
// ---------------------------------------------------------------------------

const MANIFEST_CANDIDATES = [
  path.join(homedir(), ".stave", "local-mcp.json"),
];
const MCP_PROXY_STDIN_BUFFER_MAX_BYTES = 2 * 1024 * 1024;
const MCP_PROXY_STDIN_LINE_MAX_BYTES = 1 * 1024 * 1024;

function writeLine(stream: NodeJS.WriteStream, line: string) {
  return new Promise<void>((resolve, reject) => {
    stream.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readManifest(): Promise<StaveManifest> {
  for (const candidatePath of MANIFEST_CANDIDATES) {
    try {
      const raw = await fs.readFile(candidatePath, "utf8");
      const data = JSON.parse(raw) as Partial<StaveManifest>;
      if (typeof data.url === "string" && typeof data.token === "string") {
        return { url: data.url, token: data.token };
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "stave-local MCP manifest not found. Make sure Stave is running and the local MCP server is enabled.",
  );
}

// ---------------------------------------------------------------------------
// HTTP forwarding
// ---------------------------------------------------------------------------

/**
 * POST a single JSON-RPC message to the HTTP endpoint.
 * Returns the parsed response body, or null for 202 / empty-body responses
 * (used for notifications that the server acknowledges without a payload).
 */
async function postToMcp(
  url: string,
  token: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "application/json, text/event-stream",
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // 202 Accepted → notification acknowledged, no body to forward
  if (response.status === 202) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let pendingRequests = 0;
  let stdinClosed = false;

  const maybeExit = () => {
    if (stdinClosed && pendingRequests === 0) {
      process.stderr.write("[stave-mcp-stdio-proxy] stdin closed, exiting.\n");
      process.exit(0);
    }
  };

  let manifest: StaveManifest;
  try {
    manifest = await readManifest();
  } catch (error) {
    process.stderr.write(`[stave-mcp-stdio-proxy] ${String(error)}\n`);
    process.exit(1);
  }

  const { url, token } = manifest;
  process.stderr.write(`[stave-mcp-stdio-proxy] connected → ${url}\n`);

  const stdinLineBuffer = new Utf8LineBuffer({
    label: "stave-mcp-stdio-proxy stdin",
    maxBufferBytes: MCP_PROXY_STDIN_BUFFER_MAX_BYTES,
    maxLineBytes: MCP_PROXY_STDIN_LINE_MAX_BYTES,
  });

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    let lines: string[];
    try {
      lines = stdinLineBuffer.append(chunk);
    } catch (error) {
      process.stderr.write(`[stave-mcp-stdio-proxy] ${String(error)}\n`);
      process.exit(1);
      return;
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      void (async () => {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          // Silently drop unparseable lines — not valid JSON-RPC
          return;
        }

        pendingRequests += 1;
        try {
          const result = await postToMcp(url, token, body);
          if (result !== null) {
            await writeLine(process.stdout, JSON.stringify(result));
          }
        } catch (error) {
          // Only emit an error response for requests (messages that carry an id).
          // Notifications (no id) must not receive a response per JSON-RPC spec.
          if ("id" in body) {
            const errorResponse = {
              jsonrpc: "2.0",
              error: { code: -32603, message: String(error) },
              id: body.id ?? null,
            };
            await writeLine(process.stdout, JSON.stringify(errorResponse));
          } else {
            process.stderr.write(`[stave-mcp-stdio-proxy] notification error: ${String(error)}\n`);
          }
        } finally {
          pendingRequests -= 1;
          maybeExit();
        }
      })();
    }
  });

  process.stdin.on("close", () => {
    stdinClosed = true;
    maybeExit();
  });
}

void main();
