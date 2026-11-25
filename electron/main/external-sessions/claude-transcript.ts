import { RecentProgress } from "./recent-progress";
import type { ExternalAction, ExternalAgentStatus } from "../../../src/lib/external-sessions/external-sessions";
import { isAbsolute } from "node:path";
import { cleanTarget, describeClaudeTool } from "./external-actions";

/**
 * What a Claude Code transcript (`<session>.jsonl`, or a sub-agent's
 * `agent-<id>.jsonl`) says so far. Fed one line at a time; pure, so tests
 * drive it with fixture lines. The format is undocumented: every field is
 * optional, unknown entry types and malformed lines are ignored, and nothing
 * here throws.
 */

/** Lines longer than this are images or dumps, not worth parsing. */
const MAX_LINE = 4 * 1024 * 1024;
/** Request logs Claude Code writes beside the conversation: large and irrelevant. */
const SKIP_PREFIX = /^\{"type":"(api-request|api-request-blob|api-request-shape)"/;
/** Text Claude Code adds itself (slash commands, hooks, reminders), not a prompt. */
const MACHINE_TEXT = /^\s*<(command-|local-command|system-reminder|user-prompt-submit-hook|bash-|task-notification)/;
const INTERRUPTED = /^\[Request interrupted by user[^\]]*\]$/;
const NOTICE = /<task-notification>([\s\S]*?)<\/task-notification>/g;
const AGENT_TOOLS = new Set(["Agent", "Task"]);

type Block = { type?: unknown; text?: unknown; name?: unknown; id?: unknown; input?: unknown; tool_use_id?: unknown; is_error?: unknown; content?: unknown };

export interface AgentLaunch {
  description?: string;
  agentType?: string;
}

export interface AgentResult {
  error: boolean;
  /** The agent went on in the background; this result is not its end. */
  async: boolean;
  ts: number;
}

export interface AgentNotice {
  status: string;
  ts: number;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

function parseLine(line: string): Record<string, unknown> | null {
  if (!line || line.length > MAX_LINE || SKIP_PREFIX.test(line)) return null;
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function blocksOf(content: unknown): Block[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter((block): block is Block => Boolean(block) && typeof block === "object") : [];
}

function timestampOf(entry: Record<string, unknown>) {
  const parsed = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

const tag = (body: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1]?.trim();

export class ClaudeTranscriptState {
  cwd?: string;
  branch?: string;
  /** Claude Code's own title (`ai-title`), then a `summary`, then the first prompt. */
  aiTitle?: string;
  summary?: string;
  firstPrompt?: string;
  startedAt?: number;
  lastEntryAt?: number;
  action?: ExternalAction;
  /** Tool calls seen (in the part of the file that was read). */
  steps = 0;
  readonly progress = new RecentProgress();
  contextTokens?: number;
  model?: string;
  /** true: the last answer ended its turn. */
  final = false;
  /** Any conversation entry was seen (a file with only bookkeeping lines shows nothing). */
  hasConversation = false;
  readonly launches = new Map<string, AgentLaunch>();
  readonly results = new Map<string, AgentResult>();
  readonly notices = new Map<string, AgentNotice>();

  get title() {
    return this.aiTitle ?? this.summary ?? this.firstPrompt;
  }

  feed(lines: readonly string[]) {
    for (const line of lines) {
      try {
        const entry = parseLine(line);
        if (entry) this.feedEntry(entry);
      } catch {
        // An entry shaped in a way this reader does not expect is skipped.
      }
    }
  }

  private feedEntry(entry: Record<string, unknown>) {
    const ts = timestampOf(entry);
    if (typeof entry.cwd === "string" && entry.cwd) this.cwd = entry.cwd;
    if (typeof entry.gitBranch === "string" && entry.gitBranch && entry.gitBranch !== "HEAD") this.branch = entry.gitBranch;
    switch (entry.type) {
      case "user":
        this.noteTime(ts);
        this.feedUser(entry, ts ?? 0);
        return;
      case "assistant":
        this.noteTime(ts);
        this.feedAssistant(entry);
        return;
      case "ai-title": {
        const title = cleanTitle(str(entry.aiTitle));
        if (title) this.aiTitle = title;
        return;
      }
      case "summary": {
        const title = cleanTitle(str(entry.summary));
        if (title) this.summary = title;
        return;
      }
      case "queue-operation":
        if (entry.operation === "enqueue") this.feedNotices(str(entry.content), ts ?? 0);
        return;
      case "attachment": {
        const attachment = entry.attachment as { type?: unknown; prompt?: unknown } | undefined;
        if (attachment?.type === "queued_command") this.feedNotices(str(attachment.prompt), ts ?? 0);
        return;
      }
      default:
        return;
    }
  }

  private noteTime(ts: number | undefined) {
    if (ts === undefined) return;
    this.hasConversation = true;
    if (this.startedAt === undefined || ts < this.startedAt) this.startedAt = ts;
    if (this.lastEntryAt === undefined || ts > this.lastEntryAt) this.lastEntryAt = ts;
  }

  private feedNotices(text: string, ts: number) {
    for (const match of text.matchAll(NOTICE)) {
      const body = match[1] ?? "";
      const toolUseId = tag(body, "tool-use-id");
      const status = tag(body, "status");
      if (toolUseId && status) this.notices.set(toolUseId, { status, ts });
    }
  }

  private feedUser(entry: Record<string, unknown>, ts: number) {
    const message = entry.message as { content?: unknown } | undefined;
    const blocks = blocksOf(message?.content);
    let sawResult = false;
    for (const block of blocks) {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
      sawResult = true;
      this.progress.finish(block.tool_use_id, block.is_error === true);
      const result = (entry.toolUseResult ?? {}) as { status?: unknown; isAsync?: unknown };
      const firstText = blocksOf(block.content).find((item) => item.type === "text");
      const async = result.status === "async_launched" || result.isAsync === true || /^Async agent launched/.test(str(firstText?.text));
      this.results.set(block.tool_use_id, { error: block.is_error === true, async, ts });
    }
    if (sawResult) {
      this.final = false;
      return;
    }
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => str(block.text))
      .join("\n")
      .trim();
    this.feedNotices(text, ts);
    if (!text || entry.isMeta === true || MACHINE_TEXT.test(text)) return;
    if (INTERRUPTED.test(text)) {
      this.final = true;
      return;
    }
    this.final = false;
    this.progress.message("user", cleanTitle(text) ?? "");
    this.firstPrompt ??= cleanTitle(text);
  }

  private feedAssistant(entry: Record<string, unknown>) {
    const message = (entry.message ?? {}) as { content?: unknown; model?: unknown; usage?: unknown; stop_reason?: unknown };
    const synthetic = message.model === "<synthetic>";
    let usedTool = false;
    const cwd = typeof entry.cwd === "string" ? entry.cwd : this.cwd;
    for (const block of blocksOf(message.content)) {
      if (!synthetic && block.type === "text") this.progress.message("text", str(block.text));
      if (block.type !== "tool_use" || typeof block.name !== "string") continue;
      usedTool = true;
      const input = block.input && typeof block.input === "object" ? (block.input as Record<string, unknown>) : {};
      this.steps += 1;
      this.action = describeClaudeTool(block.name, input, cwd);
      this.progress.tool(this.action, block.id);
      if (AGENT_TOOLS.has(block.name) && typeof block.id === "string") {
        this.launches.set(block.id, {
          ...(cleanTarget(str(input.description)) ? { description: cleanTarget(str(input.description)) } : {}),
          ...(str(input.subagent_type) ? { agentType: str(input.subagent_type).slice(0, 200) } : {}),
        });
      }
    }
    if (!synthetic) {
      if (typeof message.model === "string" && message.model) this.model = message.model.slice(0, 200);
      const usage = message.usage as Record<string, unknown> | undefined;
      if (usage && typeof usage === "object") {
        const n = (key: string) => (typeof usage[key] === "number" && Number.isFinite(usage[key]) ? (usage[key] as number) : 0);
        const total = n("input_tokens") + n("cache_read_input_tokens") + n("cache_creation_input_tokens") + n("output_tokens");
        if (total > 0) this.contextTokens = Math.round(total);
      }
    }
    const ended = message.stop_reason === "end_turn" || message.stop_reason === "stop_sequence";
    this.final = ended && !usedTool;
  }
}

function cleanTitle(value: string) {
  return cleanTarget(value.replace(/<(system_instruction|system-instruction)>[\s\S]*?<\/\1>/g, ""));
}

/** Writes this close after the session's word on an agent still count as before it. */
const RESULT_SLACK_MS = 3000;

/** Claude Code's word for how a background task ended, in ours. */
export function noticeAgentStatus(status: string): ExternalAgentStatus {
  const value = status.toLowerCase();
  if (value === "failed" || value === "error" || value === "errored") return "failed";
  if (["killed", "stopped", "cancelled", "canceled", "interrupted", "aborted"].includes(value)) return "stopped";
  return "finished";
}

/**
 * A sub-agent's status. The session's own word wins when it is not older than
 * the agent's last write (a resumed agent writes again); then the side file's
 * `finished` mark and the agent's final answer; otherwise how recently it wrote.
 */
export function deriveAgentStatus(args: {
  lastWriteAt: number;
  now: number;
  idleMs: number;
  final: boolean;
  markedFinished: boolean;
  result?: AgentResult;
  notice?: AgentNotice;
}): ExternalAgentStatus {
  if (args.notice && args.notice.ts + RESULT_SLACK_MS >= args.lastWriteAt) return noticeAgentStatus(args.notice.status);
  if (args.result && !args.result.async && args.result.ts + RESULT_SLACK_MS >= args.lastWriteAt) return args.result.error ? "failed" : "finished";
  if (args.final || args.markedFinished) return "finished";
  return args.now - args.lastWriteAt <= args.idleMs ? "running" : "idle";
}

/** A sub-agent's side file (`agent-<id>.meta.json`): only the fields shown. */
export interface ClaudeAgentMeta {
  agentType?: string;
  description?: string;
  toolUseId?: string;
  finished?: boolean;
  /** The worktree an agent started with worktree isolation works in. */
  worktreePath?: string;
}

export function parseClaudeAgentMeta(text: string): ClaudeAgentMeta {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const meta: ClaudeAgentMeta = {};
    if (typeof raw.agentType === "string" && raw.agentType.trim()) meta.agentType = raw.agentType.trim().slice(0, 200);
    const description = typeof raw.description === "string" ? cleanTarget(raw.description) : undefined;
    if (description) meta.description = description;
    if (typeof raw.toolUseId === "string" && raw.toolUseId) meta.toolUseId = raw.toolUseId.slice(0, 200);
    if (raw.finished === true) meta.finished = true;
    if (typeof raw.worktreePath === "string" && isAbsolute(raw.worktreePath) && raw.worktreePath.length <= 4096) meta.worktreePath = raw.worktreePath;
    return meta;
  } catch {
    return {};
  }
}
