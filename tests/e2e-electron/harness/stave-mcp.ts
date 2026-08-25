import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The agent's own entry point into the running app.
 *
 * `stave_lens_*` are MCP tools on the local HTTP server main starts at boot, so
 * calling them over that server is the only way a test drives exactly what an
 * agent drives — session acquisition, presentation policy, the focus guard and
 * the CDP dispatch, in the order the tool puts them in. Reaching into the
 * modules instead would prove something about a copy of the code rather than
 * about the product.
 *
 * The transport is stateless (`sessionIdGenerator: undefined`,
 * `enableJsonResponse: true`), so a tool call is one POST with no handshake to
 * keep alive.
 */

export type StaveMcpEndpoint = { url: string; token: string };

export type McpToolResult = {
  isError: boolean;
  /** Concatenated text content, which is where tool errors surface. */
  text: string;
  content: Array<Record<string, unknown>>;
  structuredContent?: unknown;
};

/**
 * Read the endpoint from the manifest inside the launched app's own user-data
 * directory, never the one in `~/.stave`: the latter belongs to whichever Stave
 * the developer is really running.
 */
export async function readStaveMcpEndpoint(
  userDataDir: string,
): Promise<StaveMcpEndpoint> {
  const manifestPath = path.join(userDataDir, "stave-local-mcp.json");
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as { url?: string; token?: string };
  if (!manifest.url || !manifest.token) {
    throw new Error(`local MCP manifest at ${manifestPath} is incomplete`);
  }
  return { url: manifest.url, token: manifest.token };
}

/** Poll for the manifest, since the MCP server starts alongside the window. */
export async function waitForStaveMcpEndpoint(
  userDataDir: string,
  timeoutMs = 30_000,
): Promise<StaveMcpEndpoint> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const endpoint = await readStaveMcpEndpoint(userDataDir);
      const health = await fetch(endpoint.url.replace(/\/mcp$/, "/health"));
      if (health.ok) {
        return endpoint;
      }
      lastError = new Error(`health check returned ${health.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `the local MCP server never became reachable: ${String(lastError)}`,
  );
}

let requestId = 0;

/**
 * Call a tool and hand back its result without throwing on a tool error.
 *
 * A refused `stave_lens_type` is a measurement, not a test-harness failure, so
 * the caller decides what an error means.
 */
export async function callStaveMcpTool(
  endpoint: StaveMcpEndpoint,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  requestId += 1;
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${endpoint.token}`,
      "content-type": "application/json",
      // The transport rejects a POST that does not accept both.
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `MCP ${name} failed with HTTP ${response.status}: ${bodyText}`,
    );
  }

  const payload = JSON.parse(bodyText) as {
    error?: { message?: string };
    result?: {
      isError?: boolean;
      content?: Array<Record<string, unknown>>;
      structuredContent?: unknown;
    };
  };
  if (payload.error) {
    throw new Error(`MCP ${name} returned a protocol error: ${bodyText}`);
  }

  const content = payload.result?.content ?? [];
  return {
    isError: payload.result?.isError === true,
    text: content
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("\n"),
    content,
    structuredContent: payload.result?.structuredContent,
  };
}

/** The base64 PNG a `stave_lens_screenshot` result carries. */
export function readScreenshotBase64(result: McpToolResult): string {
  const image = result.content.find((part) => part.type === "image");
  if (!image || typeof image.data !== "string") {
    throw new Error(
      `stave_lens_screenshot returned no image: ${result.text || JSON.stringify(result.content)}`,
    );
  }
  return image.data;
}
