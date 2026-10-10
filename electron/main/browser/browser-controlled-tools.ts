import { captureLensPreview } from "./browser-capture-preview";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bindLensAutomation, runLensAutomation } from "./browser-automation-control";
import { resolvePreferredBrowserSession } from "./browser-manager";

const CAPTURE_TOOLS = new Set(["stave_lens_navigate", "stave_lens_reload", "stave_lens_click", "stave_lens_type", "stave_lens_evaluate", "stave_lens_set_style", "stave_lens_screenshot"]);

/** Apply one takeover boundary to every registered browser tool. */
export function controlledLensTools(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, property, receiver) {
      if (property !== "registerTool") return Reflect.get(target, property, receiver);
      return (name: string, config: unknown, handler: (...args: unknown[]) => Promise<unknown>) => {
        const wrapped = (...args: unknown[]) => {
          const input = args[0] as { workspaceId?: string; lensSessionId?: string } | undefined;
          let session = input?.workspaceId ? resolvePreferredBrowserSession(input.workspaceId, input.lensSessionId) : undefined;
          return runLensAutomation(name, async () => {
            if (session) bindLensAutomation(session);
            const result = await handler(...args);
            session ??= input?.workspaceId ? resolvePreferredBrowserSession(input.workspaceId, input.lensSessionId) : undefined;
            return result;
          }, async () => {
            if (!CAPTURE_TOOLS.has(name)) return;
            if (!session || session.webContents.isDestroyed()) return;
            return captureLensPreview(session);
          });
        };
        return Reflect.apply(target.registerTool, target, [name, config, wrapped]);
      };
    },
  });
}
