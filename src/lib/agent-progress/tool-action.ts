import type { ExternalAction, ExternalActionVerb } from "@/lib/external-sessions/external-sessions";
import { redactCredentials } from "@/lib/renderer-recovery/error-report";
import { isStaveToolName } from "@/lib/tool-display-name";

/**
 * A tool call as a verb and its object ("read" + "src/app.ts"). The main
 * process (sessions other apps run) and the renderer (Stave's own agents)
 * read calls through this one module, so a call is described the same way
 * wherever it is shown. Nothing here builds a sentence: `tool-sentence.ts`
 * words an action in the display language.
 *
 * React- and Node-free: the main process imports it.
 */
export type ToolAction = ExternalAction;
export type ToolActionVerb = ExternalActionVerb;

const TARGET_MAX = 120;

const str = (value: unknown) => (typeof value === "string" ? value : "");
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** One redacted line, clipped; a long path keeps its end (the file name). */
export function cleanTarget(value: string, keepEnd = false): string | undefined {
  const line = oneLine(redactCredentials(value));
  if (!line) return undefined;
  if (line.length <= TARGET_MAX) return line;
  return keepEnd ? `…${line.slice(-(TARGET_MAX - 1))}` : `${line.slice(0, TARGET_MAX - 1).trimEnd()}…`;
}

function isAbsolutePath(value: string) {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value);
}

/** `file` relative to `cwd` when it lies inside it; otherwise unchanged. */
export function relativeTo(file: string, cwd: string | undefined): string {
  if (!cwd || !file || !isAbsolutePath(file)) return file;
  const base = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const target = file.replace(/\\/g, "/");
  if (!base || !target.startsWith(`${base}/`)) return file;
  const relative = target.slice(base.length + 1);
  return relative || file;
}

/**
 * A path short enough for one line, keeping its end: the file name and as
 * many parent folders as fit, cut at a folder boundary (`…/session/Panel.tsx`).
 */
export function clipPathTail(value: string, max = 56): string {
  if (value.length <= max) return value;
  const tail = value.slice(-(max - 1));
  const slash = tail.indexOf("/");
  // Cut at a folder boundary unless that would leave only part of the name.
  const name = value.split("/").at(-1) ?? value;
  if (slash >= 0 && tail.length - slash - 1 >= Math.min(name.length, max - 2)) {
    return `…${tail.slice(slash)}`;
  }
  return `…${tail}`;
}

function action(verb: ToolActionVerb, target?: string, keepEnd = false, tool?: string): ToolAction {
  const cleaned = target ? cleanTarget(target, keepEnd) : undefined;
  return { verb, ...(cleaned ? { target: cleaned } : {}), ...(tool ? { tool: cleanTarget(tool) } : {}) };
}

/**
 * The tool's own part of a namespaced name: `mcp__github__create_issue`,
 * `github:create_issue` and `mcp:github:create_issue` all read `create_issue`.
 */
export function stripToolNamespace(name: string): string {
  const leaf = name.split("__").at(-1) || name;
  return leaf.split(":").at(-1) || leaf;
}

/** A tool's name as words: `create_issue` reads `create issue`. */
export function humanizeToolName(name: string): string {
  return stripToolNamespace(name).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || name;
}

/** A Claude Code tool call as a verb and object ("read" + "src/app.ts"). */
export function describeClaudeTool(name: string, input: Record<string, unknown>, cwd?: string): ToolAction {
  const file = relativeTo(str(input.file_path) || str(input.notebook_path) || str(input.path), cwd);
  switch (name) {
    case "Read":
      return action("read", file, true);
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return action("edit", file, true);
    case "Write":
      return action("write", file, true);
    case "Bash":
      return action("run", str(input.command) || str(input.description));
    case "Grep":
      return action("search", str(input.pattern));
    case "Glob":
      return action("find", str(input.pattern));
    case "LS":
      return action("list", file, true);
    case "WebFetch":
      return action("fetch", str(input.url));
    case "WebSearch":
      return action("webSearch", str(input.query));
    case "TodoWrite":
      return action("plan");
    case "Agent":
    case "Task":
      return action("agent", str(input.description) || str(input.subagent_type));
    case "SendMessage":
      return action("message", str(input.to) || str(input.recipient));
    case "Skill":
      return action("skill", str(input.skill));
    default: {
      // MCP tools are `mcp__<server>__<tool>`; the tool part reads best.
      const short = name.includes("__") ? name.split("__").at(-1) || name : name;
      return action("tool", file || str(input.command) || str(input.query) || str(input.url), false, short);
    }
  }
}

function patchTarget(patch: string) {
  return /^\*\*\* (?:Update|Add|Delete) File: (.+)$/m.exec(patch)?.[1];
}

function parseRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function commandText(command: unknown) {
  const text = Array.isArray(command) ? command.map(String).join(" ") : str(command);
  return text.split("\n")[0] ?? "";
}

/** A Codex function call (`exec_command`, `apply_patch`…) as a verb and object. */
export function describeCodexCall(name: string, rawArguments: unknown, cwd?: string): ToolAction {
  let args: Record<string, unknown> = {};
  if (typeof rawArguments === "string") {
    const parsed = parseRecord(rawArguments);
    if (parsed) args = parsed;
    // `apply_patch` sends the raw patch, not JSON.
    else if (name === "apply_patch") args = { input: rawArguments };
  } else if (parseRecord(rawArguments)) {
    args = rawArguments as Record<string, unknown>;
  }
  switch (name) {
    case "exec_command":
    case "shell":
    case "local_shell":
    case "container.exec":
      return action("run", commandText(args.cmd ?? args.command));
    case "apply_patch": {
      const target = patchTarget(str(args.input) || str(args.patch));
      return action("edit", target ? relativeTo(target, cwd) : undefined, true);
    }
    case "web_search":
      return action("webSearch", str(args.query));
    case "update_plan":
      return action("plan");
    case "view_image":
      return action("read", relativeTo(str(args.path), cwd), true);
    default: {
      const short = name.includes("__") ? name.split("__").at(-1) || name : name;
      return action("tool", undefined, false, short);
    }
  }
}

/** The first path a `fileChange` (Codex) or file tool names. */
function firstPath(record: Record<string, unknown>): string {
  if (Array.isArray(record.paths)) return str(record.paths[0]);
  if (Array.isArray(record.changes)) {
    const first = record.changes[0] as Record<string, unknown> | undefined;
    return str(first?.path);
  }
  return str(record.file_path) || str(record.path) || str(record.notebook_path);
}

/**
 * A tool call as Stave records it (`ToolUsePart`), from either provider: the
 * Claude names, the Codex names Stave maps its items to (`bash`, `fileChange`,
 * `web_search`, `server:tool`, `collaboration:spawn_agent`) and the Codex
 * function names a saved thread keeps. Stave's own tools keep their product
 * name, so the caller words them with `toStaveToolDisplayName`.
 */
export function describeToolCall(toolName: string, input: unknown, cwd?: string): ToolAction & { stave?: true } {
  const name = toolName.trim();
  if (isStaveToolName(name)) return { verb: "tool", tool: name, stave: true };
  const record = parseRecord(input) ?? {};
  const raw = typeof input === "string" ? input : "";
  const lower = name.toLowerCase();
  switch (lower) {
    case "bash":
    case "shell":
    case "exec_command":
    case "local_shell":
    case "commandexecution":
      return action("run", commandText(record.command ?? record.cmd) || (raw && !raw.startsWith("{") ? raw.split("\n")[0] : ""));
    case "filechange":
    case "file_change": {
      const path = relativeTo(firstPath(record), cwd);
      return action("edit", path, true);
    }
    case "web_search":
    case "websearch":
      return action("webSearch", str(record.query) || str(record.q) || (raw && !raw.startsWith("{") ? raw : ""));
    case "web_fetch":
    case "webfetch":
      return action("fetch", str(record.url));
    case "todowrite":
    case "update_plan":
    case "todo_list":
      return action("plan");
    case "apply_patch":
    case "view_image":
      return describeCodexCall(lower, input, cwd);
    case "search":
      return action("search", str(record.pattern) || str(record.query) || str(record.q));
    case "read":
    case "edit":
    case "write":
      return describeClaudeTool(capitalize(lower), record, cwd);
    default:
      break;
  }
  if (/^collaboration:spawn_?agent$/i.test(name)) {
    return action("agent", str(record.task_name) || str(record.description) || str(record.message) || str(record.prompt));
  }
  if (/^collaboration:/i.test(name)) {
    return action("message", str(record.receiver) || str(record.to));
  }
  const claude = describeClaudeTool(name, record, cwd);
  if (claude.verb !== "tool") return claude;
  // An MCP or unknown tool: its own name, namespace dropped, as words.
  return action("tool", claude.target, false, humanizeToolName(name));
}

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
