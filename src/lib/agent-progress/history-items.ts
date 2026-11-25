/**
 * A saved subagent transcript (Claude) or thread (Codex) as structural items:
 * what was said, thought and called, with no wording. The main process maps
 * the provider's payload with this module and the renderer words the items
 * (`from-history.ts`), so main never builds a user-facing sentence.
 *
 * React-, Node- and i18n-free: the main process imports it. Payloads are read
 * as inert data, never executed, and every text is bounded.
 */

export type AgentHistoryItemKind = "user" | "text" | "thinking" | "tool" | "tool_result";

export type AgentHistoryItemStatus = "running" | "done" | "error";

export interface AgentHistoryItem {
  id: string;
  kind: AgentHistoryItemKind;
  /** The words of `user`, `text` and `thinking` items. */
  text?: string;
  /** `tool`: the provider's tool name (`Read`, `bash`, `github:create_issue`). */
  toolName?: string;
  /** `tool` and `tool_result`: the call they belong to. */
  toolUseId?: string;
  /** `tool`: arguments as JSON text. */
  input?: string;
  /** `tool` (Codex, inline) and `tool_result` (Claude): what came back. */
  output?: string;
  isError?: boolean;
  /** `tool`: where the call stands, when the provider says. */
  status?: AgentHistoryItemStatus;
  durationMs?: number;
  /** `tool`: the agents a spawn started (Codex thread ids). */
  childAgentIds?: string[];
  /** A text was cut to `HISTORY_ITEM_MAX_CHARS`. */
  truncated?: boolean;
}

export const HISTORY_ITEM_MAX_CHARS = 16_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Content blocks as plain text; anything else as JSON data, never code. */
function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n");
  const block = record(value);
  if (block.type === "redacted_thinking" || block.type === "image") return "";
  if (typeof block.text === "string") return block.text;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

function json(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "";
  }
}

/** Bounds every text field and marks the item when one was cut. */
function bounded(item: AgentHistoryItem): AgentHistoryItem {
  let truncated = item.truncated ?? false;
  const cut = (value: string | undefined) => {
    if (value === undefined || value.length <= HISTORY_ITEM_MAX_CHARS) return value;
    truncated = true;
    return value.slice(0, HISTORY_ITEM_MAX_CHARS);
  };
  const next: AgentHistoryItem = {
    ...item,
    ...(item.text !== undefined ? { text: cut(item.text) } : {}),
    ...(item.input !== undefined ? { input: cut(item.input) } : {}),
    ...(item.output !== undefined ? { output: cut(item.output) } : {}),
  };
  return truncated ? { ...next, truncated } : next;
}

function mapClaude(payload: unknown): AgentHistoryItem[] {
  const items: AgentHistoryItem[] = [];
  (Array.isArray(payload) ? payload : []).forEach((value, messageIndex) => {
    const entry = record(value);
    const message = record(entry.message);
    const role = str(message.role) || str(entry.type);
    if (role !== "user" && role !== "assistant") return;
    const base = str(entry.uuid) || String(messageIndex);
    const content = message.content ?? entry.message;
    if (typeof content === "string") {
      if (content.trim()) items.push({ id: `${base}:0`, kind: role === "user" ? "user" : "text", text: content });
      return;
    }
    (Array.isArray(content) ? content : []).forEach((rawBlock, index) => {
      const block = record(rawBlock);
      const id = `${base}:${index}`;
      switch (block.type) {
        case "text":
          if (str(block.text).trim()) items.push({ id, kind: role === "user" ? "user" : "text", text: str(block.text) });
          return;
        case "thinking":
          if (str(block.thinking).trim()) items.push({ id, kind: "thinking", text: str(block.thinking) });
          return;
        case "tool_use":
          items.push({
            id: str(block.id) || id,
            kind: "tool",
            toolUseId: str(block.id) || id,
            toolName: str(block.name) || "tool",
            input: json(block.input),
          });
          return;
        case "tool_result":
          items.push({
            id: `${id}:result`,
            kind: "tool_result",
            toolUseId: str(block.tool_use_id),
            output: contentText(block.content),
            ...(block.is_error === true ? { isError: true } : {}),
          });
          return;
        default:
          return;
      }
    });
  });
  return items;
}

function codexStatus(value: unknown): AgentHistoryItemStatus | undefined {
  switch (str(value)) {
    case "inProgress":
    case "in_progress":
    case "running":
      return "running";
    case "completed":
      return "done";
    case "failed":
    case "declined":
    case "error":
      return "error";
    default:
      return undefined;
  }
}

function codexTool(item: Record<string, unknown>, id: string, args: {
  toolName: string;
  input: unknown;
  output?: string;
  isError?: boolean;
  childAgentIds?: string[];
}): AgentHistoryItem {
  const status = args.isError ? "error" : codexStatus(item.status);
  const duration = typeof item.durationMs === "number" && Number.isFinite(item.durationMs) ? item.durationMs : undefined;
  return {
    id,
    kind: "tool",
    toolUseId: id,
    toolName: args.toolName,
    input: json(args.input),
    ...(args.output ? { output: args.output } : {}),
    ...(status ? { status } : {}),
    ...(status === "error" ? { isError: true } : {}),
    ...(duration !== undefined ? { durationMs: duration } : {}),
    ...(args.childAgentIds?.length ? { childAgentIds: args.childAgentIds } : {}),
  };
}

function mapCodexItem(item: Record<string, unknown>, id: string): AgentHistoryItem | null {
  switch (str(item.type)) {
    case "userMessage": {
      const text = contentText(item.content);
      return text.trim() ? { id, kind: "user", text } : null;
    }
    case "agentMessage":
      return str(item.text).trim() ? { id, kind: "text", text: str(item.text) } : null;
    case "reasoning": {
      const summary = Array.isArray(item.summary) ? item.summary.map(contentText).join("\n") : "";
      const content = Array.isArray(item.content) ? item.content.map(contentText).join("\n") : "";
      const text = (summary || content).trim();
      return text ? { id, kind: "thinking", text } : null;
    }
    case "plan":
      return codexTool(item, id, { toolName: "update_plan", input: { plan: str(item.text) }, output: str(item.text) });
    case "commandExecution": {
      const exitCode = typeof item.exitCode === "number" ? item.exitCode : null;
      return codexTool(item, id, {
        toolName: "bash",
        input: { command: item.command },
        output: str(item.aggregatedOutput),
        isError: codexStatus(item.status) === "error" || (exitCode !== null && exitCode !== 0),
      });
    }
    case "fileChange": {
      const changes = Array.isArray(item.changes) ? item.changes.map(record) : [];
      return codexTool(item, id, {
        toolName: "fileChange",
        input: { paths: changes.map((change) => str(change.path)).filter(Boolean) },
        output: changes.map((change) => str(change.diff)).filter(Boolean).join("\n"),
      });
    }
    case "mcpToolCall": {
      const error = record(item.error);
      return codexTool(item, id, {
        toolName: `${str(item.server) || "mcp"}:${str(item.tool) || "tool"}`,
        input: item.arguments,
        output: str(error.message) || contentText(item.result),
        isError: Boolean(str(error.message)),
      });
    }
    case "webSearch":
      return codexTool(item, id, { toolName: "web_search", input: { query: str(item.query) } });
    case "imageView":
      return codexTool(item, id, { toolName: "view_image", input: { path: str(item.path) } });
    case "collabToolCall":
    case "collabAgentToolCall": {
      const receivers = Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds.map(str).filter(Boolean) : [];
      const tool = str(item.tool) || "spawn_agent";
      return codexTool(item, id, {
        toolName: `collaboration:${tool === "spawnAgent" ? "spawn_agent" : tool}`,
        input: { message: str(item.prompt), receiverThreadIds: receivers },
        childAgentIds: receivers,
      });
    }
    default:
      return null;
  }
}

function mapCodex(payload: unknown, window?: { offset: number; limit: number }): AgentHistoryItem[] {
  const thread = record(payload);
  const raw: { item: Record<string, unknown>; id: string }[] = [];
  (Array.isArray(thread.turns) ? thread.turns : []).forEach((rawTurn, turnIndex) => {
    const turn = record(rawTurn);
    (Array.isArray(turn.items) ? turn.items : []).forEach((rawItem, index) => {
      const item = record(rawItem);
      raw.push({ item, id: `${str(turn.id) || turnIndex}:${str(item.id) || index}` });
    });
  });
  const shown = window ? raw.slice(window.offset, window.offset + window.limit) : raw;
  return shown.flatMap(({ item, id }) => mapCodexItem(item, id) ?? []);
}

/**
 * A provider's saved agent transcript as bounded structural items, oldest
 * first. Claude pages by message (the caller passes the page); a Codex thread
 * pages by item through `window`, the same window its history entries use.
 */
export function mapAgentHistoryItems(
  provider: "claude-code" | "codex",
  payload: unknown,
  window?: { offset: number; limit: number },
): AgentHistoryItem[] {
  return (provider === "claude-code" ? mapClaude(payload) : mapCodex(payload, window)).map(bounded);
}
