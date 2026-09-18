import { z } from "zod";

export const AgentHistoryRequestSchema = z.object({
  providerId: z.enum(["claude-code", "codex"]),
  sessionId: z.string().min(1).max(200),
  agentId: z.string().min(1).max(200),
  cwd: z.string().min(1).max(4096),
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(100).default(50),
  codexBinaryPath: z.string().max(4096).optional(),
}).strict();

export type AgentHistoryRequest = z.input<typeof AgentHistoryRequestSchema>;
export interface AgentHistoryEntry {
  id: string;
  title: string;
  text: string;
  model?: string;
  truncated?: boolean;
}
export interface AgentHistoryResponse {
  ok: boolean;
  detail: string;
  entries: AgentHistoryEntry[];
  nextOffset?: number;
  model?: string;
  effort?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/** Keep history as inert text. Never execute or interpret provider payloads. */
export function historyText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(historyText).filter(Boolean).join("\n");
  const r = record(value);
  if (r.type === "redacted_thinking") return "";
  if (typeof r.text === "string") return r.text;
  if (r.type === "thinking") return typeof r.thinking === "string" ? r.thinking : "";
  return JSON.stringify(value ?? "", null, 2);
}

export function mapAgentHistory(provider: "claude-code" | "codex", payload: unknown): AgentHistoryEntry[] {
  if (provider === "claude-code") {
    return (Array.isArray(payload) ? payload : []).map((value, i) => {
      const r = record(value);
      const message = record(r.message);
      return {
        id: String(r.uuid ?? i), title: String(r.type ?? "Message"),
        text: historyText(message.content ?? r.message),
        ...(typeof message.model === "string" ? { model: message.model } : {}),
      };
    });
  }
  const thread = record(payload);
  return (Array.isArray(thread.turns) ? thread.turns : []).flatMap((value, turnIndex) => {
    const turn = record(value);
    return (Array.isArray(turn.items) ? turn.items : []).map((value, i) => {
      const item = record(value);
      return {
        id: `${String(turn.id ?? turnIndex)}:${String(item.id ?? i)}`,
        title: String(item.type ?? "Event"),
        text: historyText(item.text ?? item.content ?? item),
      };
    });
  });
}

export function boundHistoryEntries(entries: AgentHistoryEntry[]): AgentHistoryEntry[] {
  return entries.map(entry => entry.text.length > 64_000
    ? { ...entry, text: entry.text.slice(0, 64_000), truncated: true }
    : entry);
}
