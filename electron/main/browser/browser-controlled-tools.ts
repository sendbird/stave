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
            const documentId = session.documentId;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const image = await Promise.race([
              session.webContents.capturePage(),
              new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 1500); }),
            ]).finally(() => clearTimeout(timer));
            if (!image) return;
            if (image.isEmpty() || session.documentId !== documentId) return;
            const preview = image.resize({ width: Math.min(640, image.getSize().width) }).toJPEG(60);
            if (preview.byteLength > 256_000) return;
            return `data:image/jpeg;base64,${preview.toString("base64")}`;
          });
        };
        return Reflect.apply(target.registerTool, target, [name, config, wrapped]);
      };
    },
  });
}
