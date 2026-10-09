import {
  MCP_APP_RESOURCE_TIMEOUT_MS,
  normalizeMcpAppToolInput,
  normalizeMcpAppToolResult,
  selectMcpAppHtmlContent,
  type McpAppToolDescriptor,
  type McpAppViewProvider,
  type McpAppViewReference,
} from "../../src/lib/mcp-app/mcp-app-view";
import { normalizeMcpAppCsp } from "../../src/lib/mcp-app/mcp-app-csp";
import {
  getMcpAppViewStore,
  type McpAppViewStore,
} from "../main/mcp-app/mcp-app-view-store";
import type { BridgeEvent } from "./types";

/**
 * Captures one tool call's MCP App view when the call completes: reads the
 * `ui://` resource from the call's own server, keeps it with the call's input
 * and result in the view store, and returns the reference the tool part
 * carries. Shared by the Codex and Claude runtimes, which differ only in how
 * they read the resource and list the server's tools.
 *
 * Any failure (no such resource, wrong type, too large, too slow) leaves the
 * row as plain text. Log lines carry the server and the reason, never the
 * view's content.
 */
export async function captureMcpAppView(args: {
  provider: McpAppViewProvider;
  server: string;
  tool: string;
  toolUseId: string;
  resourceUri: string;
  workspaceId: string | null;
  taskId: string | null;
  threadId?: string | null;
  executablePath?: string | null;
  accountProfileId?: string | null;
  toolInput: unknown;
  toolResult: unknown;
  readResource: (uri: string) => Promise<unknown>;
  listAppTools: () => Promise<McpAppToolDescriptor[]>;
  store?: Pick<McpAppViewStore, "publish">;
  timeoutMs?: number;
}): Promise<McpAppViewReference | null> {
  const timeoutMs = args.timeoutMs ?? MCP_APP_RESOURCE_TIMEOUT_MS;
  try {
    const [resource, appTools] = await Promise.all([
      withTimeout(args.readResource(args.resourceUri), timeoutMs),
      withTimeout(args.listAppTools(), timeoutMs).catch(() => [] as McpAppToolDescriptor[]),
    ]);
    const contents =
      resource && typeof resource === "object"
        ? (resource as { contents?: unknown }).contents
        : undefined;
    const selection = selectMcpAppHtmlContent(contents, args.resourceUri);
    if (!selection.ok) {
      console.warn("[mcp-app] view not captured", {
        provider: args.provider,
        server: args.server,
        reason: selection.reason,
      });
      return null;
    }
    const store = args.store ?? getMcpAppViewStore();
    return await store.publish({
      provider: args.provider,
      server: args.server,
      tool: args.tool,
      resourceUri: args.resourceUri,
      toolUseId: args.toolUseId,
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      threadId: args.threadId ?? null,
      executablePath: args.executablePath ?? null,
      accountProfileId: args.accountProfileId ?? null,
      csp: normalizeMcpAppCsp(selection.meta.csp),
      permissions: selection.meta.permissions,
      prefersBorder: selection.meta.prefersBorder,
      appTools,
      toolInput: normalizeMcpAppToolInput(args.toolInput),
      toolResult: normalizeMcpAppToolResult(args.toolResult),
      html: selection.html,
    });
  } catch (error) {
    console.warn("[mcp-app] view not captured", {
      provider: args.provider,
      server: args.server,
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Captures still running in a turn. The runtime holds the turn's `done`
 * until they settle, so a view is never attached after the turn ended.
 */
export function createMcpAppViewCaptureTracker() {
  const pending = new Set<Promise<unknown>>();
  return {
    track(promise: Promise<unknown>) {
      const tracked = promise.catch(() => undefined).finally(() => pending.delete(tracked));
      pending.add(tracked);
    },
    hasPending() {
      return pending.size > 0;
    },
    async settle() {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}

/** The follow-up result that attaches a captured view to its tool part. */
export function buildMcpAppViewToolResultEvent(args: {
  toolUseId: string;
  output: string;
  reference: McpAppViewReference;
}): Extract<BridgeEvent, { type: "tool_result" }> {
  return {
    type: "tool_result",
    tool_use_id: args.toolUseId,
    output: args.output,
    mcpAppView: args.reference,
  };
}
