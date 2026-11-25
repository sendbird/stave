import { RecentProgress } from "./recent-progress";
import type { ExternalAction } from "../../../src/lib/external-sessions/external-sessions";
import { cleanTarget, describeCodexCall } from "./external-actions";

/**
 * What a Codex rollout (`sessions/YYYY/MM/DD/rollout-*.jsonl`) says so far.
 * Fed one line at a time; pure. The format is undocumented: unknown lines
 * and malformed lines are ignored and nothing here throws.
 */

const MAX_LINE = 4 * 1024 * 1024;
/** Stave's own Codex App Server names itself so (`clientInfo.name`). */
export const STAVE_CODEX_ORIGINATOR = "stave";

const str = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * What a child rollout's `source.subagent` says it is. `thread_spawn` is a
 * sub-agent the parent started with `spawn_agent`; `internal` is any other
 * kind (`"guardian"` approval reviews) and is never shown.
 */
export interface CodexSubagentInfo {
  kind: "thread_spawn" | "internal";
  parentId?: string;
  nickname?: string;
  role?: string;
}

/** Reads `parent_thread_id` and `source.subagent`; unknown or malformed shapes give `undefined`. */
export function parseCodexSubagent(payload: Record<string, unknown>): CodexSubagentInfo | undefined {
  const source = payload.source;
  const subagent = source && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>).subagent : undefined;
  if (typeof subagent === "string") return subagent ? { kind: "internal" } : undefined;
  if (!subagent || typeof subagent !== "object" || Array.isArray(subagent)) return undefined;
  const fields = subagent as Record<string, unknown>;
  const spawn = fields.thread_spawn;
  if (spawn && typeof spawn === "object" && !Array.isArray(spawn)) {
    const detail = spawn as Record<string, unknown>;
    const parentId = (str(detail.parent_thread_id) || str(payload.parent_thread_id)).slice(0, 200);
    if (!parentId) return undefined;
    const nickname = firstLine(str(detail.agent_nickname))?.slice(0, 200);
    const role = firstLine(str(detail.agent_role))?.slice(0, 200);
    return { kind: "thread_spawn", parentId, ...(nickname ? { nickname } : {}), ...(role ? { role } : {}) };
  }
  return "other" in fields ? { kind: "internal" } : undefined;
}

export class CodexRolloutState {
  id?: string;
  originator?: string;
  cwd?: string;
  branch?: string;
  /** Set on a sub-agent's own rollout. */
  subagent?: CodexSubagentInfo;
  title?: string;
  model?: string;
  startedAt?: number;
  lastEntryAt?: number;
  action?: ExternalAction;
  steps = 0;
  readonly progress = new RecentProgress();
  private lastPrompt?: { source: "event" | "item"; text: string };

  private recordPrompt(value: string, source: "event" | "item") {
    const text = cleanTarget(value);
    if (!text || !this.progress.enabled) return;
    // CLI rollouts can represent a single prompt both as an item and as an event.
    if (this.lastPrompt && this.lastPrompt.source !== source && this.lastPrompt.text === text) {
      this.lastPrompt = undefined;
      return;
    }
    this.lastPrompt = { source, text };
    this.progress.message("user", text);
  }

  contextTokens?: number;
  /** The last turn finished (a `task_complete` after the last `task_started`). */
  final = false;

  feed(lines: readonly string[]) {
    for (const line of lines) {
      if (!line || line.length > MAX_LINE) continue;
      try {
        const entry = JSON.parse(line) as unknown;
        if (entry && typeof entry === "object" && !Array.isArray(entry)) this.feedEntry(entry as Record<string, unknown>);
      } catch {
        // Malformed or unexpected: skipped.
      }
    }
  }

  private feedEntry(entry: Record<string, unknown>) {
    const payload = (entry.payload && typeof entry.payload === "object" ? entry.payload : {}) as Record<string, unknown>;
    const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
    if (Number.isFinite(ts) && (this.lastEntryAt === undefined || ts > this.lastEntryAt)) this.lastEntryAt = ts;
    switch (entry.type) {
      case "session_meta": {
        if (str(payload.id)) this.id = str(payload.id).slice(0, 200);
        if (str(payload.originator)) this.originator = str(payload.originator);
        if (str(payload.cwd)) this.cwd ??= str(payload.cwd);
        this.subagent ??= parseCodexSubagent(payload);
        const started = str(payload.timestamp) ? Date.parse(str(payload.timestamp)) : ts;
        if (Number.isFinite(started)) this.startedAt ??= started;
        const git = payload.git as { branch?: unknown } | undefined;
        if (git && typeof git === "object" && str(git.branch)) this.branch = str(git.branch).slice(0, 400);
        return;
      }
      case "turn_context":
        if (str(payload.cwd)) this.cwd = str(payload.cwd);
        if (str(payload.model)) this.model = str(payload.model).slice(0, 200);
        return;
      case "event_msg":
        this.feedEvent(payload);
        return;
      case "response_item":
        this.feedItem(payload, Number.isFinite(ts) ? ts : undefined);
        return;
      default:
        return;
    }
  }

  private feedEvent(payload: Record<string, unknown>) {
    switch (payload.type) {
      case "user_message":
        this.title ??= firstLine(str(payload.message));
        this.recordPrompt(str(payload.message), "event");
        return;
      case "task_started":
        this.lastPrompt = undefined;
        this.final = false;
        return;
      case "task_complete":
      case "turn_aborted":
        this.final = true;
        return;
      case "token_count": {
        const info = payload.info as { last_token_usage?: Record<string, unknown> } | null | undefined;
        const usage = info?.last_token_usage;
        if (!usage || typeof usage !== "object") return;
        const n = (key: string) => (typeof usage[key] === "number" && Number.isFinite(usage[key]) ? (usage[key] as number) : 0);
        const total = n("total_tokens") || n("input_tokens") + n("output_tokens");
        if (total > 0) this.contextTokens = Math.round(total);
        return;
      }
      default:
        return;
    }
  }

  private feedItem(payload: Record<string, unknown>, ts: number | undefined) {
    switch (payload.type) {
      case "message":
        // The Codex app logs no `user_message` event: the first typed text,
        // not the instructions it sends ahead of it.
        if ((payload.role === "user" || payload.role === "assistant") && Array.isArray(payload.content)) {
          for (const part of payload.content as Array<{ type?: unknown; text?: unknown }>) {
            if (payload.role === "assistant" && payload.channel !== "analysis" && part?.type === "output_text") this.progress.message("text", str(part.text));
            const text = payload.role === "user" && part?.type === "input_text" ? str(part.text).trim() : "";
            if (text && !text.startsWith("<") && !text.startsWith("# AGENTS.md")) {
              this.title ??= firstLine(text);
              this.recordPrompt(text, "item");
              break;
            }
          }
        }
        return;
      case "function_call_output":
      case "custom_tool_call_output":
        this.progress.finish(payload.call_id, payload.status === "failed", ts);
        return;
      case "function_call":
      case "custom_tool_call":
        this.steps += 1;
        this.action = describeCodexCall(str(payload.name) || "tool", payload.arguments ?? payload.input, this.cwd);
        this.progress.tool(this.action, payload.call_id, ts);
        return;
      case "local_shell_call": {
        this.steps += 1;
        const action = payload.action as { command?: unknown } | undefined;
        this.action = describeCodexCall("local_shell", JSON.stringify({ command: action?.command ?? "" }), this.cwd);
        this.progress.tool(this.action, payload.call_id, ts);
        return;
      }
      case "web_search_call":
        this.steps += 1;
        this.action = { verb: "webSearch" };
        this.progress.tool(this.action, payload.id, ts);
        return;
      default:
        return;
    }
  }
}

function firstLine(text: string) {
  return cleanTarget(text.trim().split("\n")[0] ?? "");
}
