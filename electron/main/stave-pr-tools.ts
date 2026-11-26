import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildPrContextAttachment, parsePrContextUrl, PR_CONTEXT_LIMITS } from "../../src/lib/pr-context";
import { defaultPrSelection } from "../../src/lib/pr-fix-request";
import type { invokeHostService } from "./host-service-client";

export const PrToolInput = z.object({
  workspaceId: z.string().min(1).optional(),
  prUrl: z.string().max(PR_CONTEXT_LIMITS.maxUrlChars).refine(url => !!parsePrContextUrl(url)).optional(),
  checks: z.number().int().min(0).max(PR_CONTEXT_LIMITS.maxSelectedChecks).default(3),
  threads: z.boolean().default(true),
});

export function registerPrTools(server: McpServer, invoke: typeof invokeHostService, workspacePath: (id?: string) => Promise<string | undefined>) {
  server.registerTool("stave_get_pull_request_context", {
    description: "Read bounded, untrusted PR evidence with provenance. Defaults to the calling workspace's PR, three failed checks and current unresolved review threads.",
    inputSchema: PrToolInput.shape,
    annotations: { readOnlyHint: true },
  }, async ({ prUrl, workspaceId, checks, threads }) => {
    const cwd = await workspacePath(workspaceId);
    if (!cwd && (workspaceId || !prUrl)) throw new Error("Workspace not found. Supply a workspace id or PR URL.");
    const url = prUrl ?? (await invoke("scm.get-pr-status", { cwd })).pr?.url;
    if (!url) throw new Error("No pull request found for this workspace.");
    const result = await invoke("scm.fetch-pr-context-index", { cwd, prUrl: url });
    if (!result.ok || !result.index) throw new Error("Could not read the pull request.");
    const { index } = result;
    const selection = defaultPrSelection(index, checks, threads);
    const logs = selection.checkIds.length && index.headSha ? await invoke("scm.fetch-pr-check-logs", {
      cwd, prUrl: url, headSha: index.headSha, checkIds: selection.checkIds,
    }) : null;
    const payload = { untrusted: true, ...buildPrContextAttachment({ index, selection, logExcerpts: logs?.ok ? logs.excerpts : [] }) };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  });
}
