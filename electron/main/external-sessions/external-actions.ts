import path from "node:path";
import type { ExternalAction, ExternalActionVerb } from "../../../src/lib/external-sessions/external-sessions";
import { redactCredentials } from "../../../src/lib/renderer-recovery/error-report";

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

function relativeTo(file: string, cwd: string | undefined) {
  if (!cwd || !path.isAbsolute(file)) return file;
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

function action(verb: ExternalActionVerb, target?: string, keepEnd = false, tool?: string): ExternalAction {
  const cleaned = target ? cleanTarget(target, keepEnd) : undefined;
  return { verb, ...(cleaned ? { target: cleaned } : {}), ...(tool ? { tool: cleanTarget(tool) } : {}) };
}

/** A Claude Code tool call as a verb and object ("read" + "src/app.ts"). */
export function describeClaudeTool(name: string, input: Record<string, unknown>, cwd?: string): ExternalAction {
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

/** A Codex function call (`exec_command`, `apply_patch`…) as a verb and object. */
export function describeCodexCall(name: string, rawArguments: unknown, cwd?: string): ExternalAction {
  let args: Record<string, unknown> = {};
  if (typeof rawArguments === "string") {
    try {
      const parsed = JSON.parse(rawArguments) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      // `apply_patch` sends the raw patch, not JSON.
      if (name === "apply_patch") args = { input: rawArguments };
    }
  }
  switch (name) {
    case "exec_command":
    case "shell":
    case "local_shell":
    case "container.exec": {
      const command = args.cmd ?? args.command;
      const text = Array.isArray(command) ? command.map(String).join(" ") : str(command);
      return action("run", text.split("\n")[0]);
    }
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
