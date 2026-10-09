import { ipcMain } from "electron";
import { z } from "zod";
import { isInlineRenderId } from "../../../src/lib/inline-render/inline-render";
import type {
  McpAppViewDescribeResponse,
  McpAppViewRequestResponse,
} from "../../../src/lib/mcp-app/mcp-app-bridge";
import { invokeHostService } from "../host-service-client";
import { getMcpAppViewStore } from "../mcp-app/mcp-app-view-store";

const ViewIdSchema = z.string().refine(isInlineRenderId, "invalid view id");

export const McpAppDescribeArgsSchema = z.object({ viewId: ViewIdSchema }).strict();

/**
 * A view's request to its own server. The server and thread are not part of
 * it: the host service reads them from the view's stored record.
 */
export const McpAppRequestArgsSchema = z.discriminatedUnion("method", [
  z
    .object({
      viewId: ViewIdSchema,
      method: z.literal("tools/call"),
      params: z
        .object({
          name: z.string().min(1).max(200),
          arguments: z.record(z.string(), z.unknown()).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      viewId: ViewIdSchema,
      method: z.literal("resources/read"),
      params: z.object({ uri: z.string().min(1).max(2_048) }).strict(),
    })
    .strict(),
]);

/** The largest serialised arguments a view may send with one tool call. */
const MAX_REQUEST_CHARS = 256 * 1024;

export function registerMcpAppHandlers() {
  ipcMain.handle(
    "mcp-app:describe",
    async (_event, args: unknown): Promise<McpAppViewDescribeResponse> => {
      const parsed = McpAppDescribeArgsSchema.safeParse(args);
      if (!parsed.success) return { ok: false, error: "invalid arguments" };
      const record = await getMcpAppViewStore().describe(parsed.data.viewId);
      if (!record) return { ok: true, exists: false };
      // Only Codex keeps a thread to relay a view's requests through.
      const relays = record.provider === "codex" && record.threadId !== null;
      return {
        ok: true,
        exists: true,
        view: {
          provider: record.provider,
          server: record.server,
          tool: record.tool,
          resourceUri: record.resourceUri,
          csp: record.csp,
          permissions: record.permissions,
          prefersBorder: record.prefersBorder,
          appTools: record.appTools,
          toolInput: record.toolInput,
          toolResult: record.toolResult,
          capabilities: { serverTools: relays, serverResources: relays },
        },
      };
    },
  );

  ipcMain.handle(
    "mcp-app:request",
    async (_event, args: unknown): Promise<McpAppViewRequestResponse> => {
      const parsed = McpAppRequestArgsSchema.safeParse(args);
      if (!parsed.success || JSON.stringify(parsed.data).length > MAX_REQUEST_CHARS) {
        return { ok: false, error: "invalid arguments" };
      }
      return invokeHostService("provider.mcp-app-request", parsed.data);
    },
  );
}
