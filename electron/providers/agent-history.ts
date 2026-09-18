import { isAbsolute } from "node:path";
import {
  AgentHistoryRequestSchema, boundHistoryEntries, mapAgentHistory,
  type AgentHistoryRequest, type AgentHistoryResponse,
} from "../../src/lib/providers/agent-history";
import { readCodexThread } from "./codex-app-server-runtime";

/** History reads must not resume, fork, or start an agent. */
export async function readAgentHistory(input: AgentHistoryRequest): Promise<AgentHistoryResponse> {
  const parsed = AgentHistoryRequestSchema.safeParse(input);
  if (!parsed.success || !isAbsolute(parsed.data.cwd)) {
    return { ok: false, detail: "Invalid agent history request.", entries: [] };
  }
  const args = parsed.data;
  try {
    if (args.providerId === "claude-code") {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      const agents = await sdk.listSubagents(args.sessionId, { dir: args.cwd });
      if (!agents.includes(args.agentId)) {
        return { ok: false, detail: "This agent's saved transcript is not available in this session.", entries: [] };
      }
      const messages = await sdk.getSubagentMessages(args.sessionId, args.agentId, {
        dir: args.cwd, offset: args.offset, limit: args.limit + 1,
      });
      return {
        ok: true, detail: "Saved subagent conversation",
        entries: boundHistoryEntries(mapAgentHistory("claude-code", messages.slice(0, args.limit))),
        ...(messages.length > args.limit ? { nextOffset: args.offset + args.limit } : {}),
      };
    }
    const response = await readCodexThread({
      threadId: args.agentId, includeTurns: true,
      runtimeOptions: args.codexBinaryPath ? { codexBinaryPath: args.codexBinaryPath } : undefined,
    });
    if (!response.ok || !response.thread) return { ok: false, detail: response.detail, entries: [] };
    const raw = response.thread.raw;
    // The parent may be an ancestor for nested agents. Compare the provider's
    // working directory; do not accept arbitrary transcript paths from a row.
    if (response.thread.cwd !== args.cwd) return { ok: false, detail: "The agent belongs to another working directory.", entries: [] };
    const entries = mapAgentHistory("codex", raw);
    return {
      ok: true, detail: "Saved thread history. Model and effort describe the current or last saved configuration.",
      entries: boundHistoryEntries(entries.slice(args.offset, args.offset + args.limit)),
      ...(entries.length > args.offset + args.limit ? { nextOffset: args.offset + args.limit } : {}),
      ...(typeof raw.model === "string" ? { model: raw.model } : {}),
      ...(typeof raw.reasoningEffort === "string" ? { effort: raw.reasoningEffort } : {}),
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Could not read agent history.", entries: [] };
  }
}
