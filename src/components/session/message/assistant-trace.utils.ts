import { getTodoProgress, type TodoItem } from "@/components/ai-elements/todo";
import type { ToolUsePart } from "@/types/chat";

export type TraceToolSummary =
  | { kind: "command"; text: string }
  | { kind: "file"; text: string }
  | { kind: "search"; text: string }
  | { kind: "web"; text: string }
  | { kind: "text"; text: string };

const TRACE_SUMMARY_MAX_LENGTH = 160;
const TRACE_COMMAND_SUMMARY_MAX_LENGTH = 200;

const TRACE_TOOL_NAME_ALIASES: Record<string, string> = {
  web_search: "websearch",
  web_fetch: "webfetch",
};

function extractFileName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

function parseToolInputRecord(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getStringField(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function getFirstStringField(record: Record<string, unknown> | null): string | null {
  if (!record) {
    return null;
  }
  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function getTrimmedPreview(value: string, maxLength: number): string | null {
  const trimmed = (value.split("\n")[0] ?? "").trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

export function normalizeTraceToolName(toolName: string) {
  const normalized = toolName.trim().toLowerCase();
  return TRACE_TOOL_NAME_ALIASES[normalized] ?? normalized;
}

export function deriveTraceToolSummary(args: {
  toolName: string;
  input: string;
}): TraceToolSummary | null {
  const normalizedToolName = normalizeTraceToolName(args.toolName);
  const parsed = parseToolInputRecord(args.input);

  switch (normalizedToolName) {
    case "bash": {
      const command = getTrimmedPreview(
        getStringField(parsed, ["command"]) ?? args.input,
        TRACE_COMMAND_SUMMARY_MAX_LENGTH,
      );
      return command ? { kind: "command", text: command } : null;
    }
    case "read":
    case "write":
    case "edit": {
      const filePath = getStringField(parsed, ["file_path", "path"]);
      return filePath ? { kind: "file", text: extractFileName(filePath) } : null;
    }
    case "glob":
    case "grep": {
      const pattern = getTrimmedPreview(
        getStringField(parsed, ["pattern"]) ?? args.input,
        TRACE_SUMMARY_MAX_LENGTH,
      );
      return pattern ? { kind: "search", text: pattern } : null;
    }
    case "websearch": {
      const query = getTrimmedPreview(
        getStringField(parsed, ["query", "q"]) ?? args.input,
        TRACE_SUMMARY_MAX_LENGTH,
      );
      return query ? { kind: "web", text: query } : null;
    }
    case "webfetch": {
      const url = getTrimmedPreview(
        getStringField(parsed, ["url", "ref_id"]) ?? args.input,
        TRACE_SUMMARY_MAX_LENGTH,
      );
      return url ? { kind: "web", text: url } : null;
    }
    default: {
      const filePath = getStringField(parsed, ["file_path", "path"]);
      if (filePath) {
        return { kind: "file", text: extractFileName(filePath) };
      }

      const patternValue = getStringField(parsed, ["pattern"]);
      const pattern = patternValue ? getTrimmedPreview(patternValue, TRACE_SUMMARY_MAX_LENGTH) : null;
      if (pattern) {
        return { kind: "search", text: pattern };
      }

      const queryValue = getStringField(parsed, ["query", "q"]);
      const query = queryValue ? getTrimmedPreview(queryValue, TRACE_SUMMARY_MAX_LENGTH) : null;
      if (query) {
        return { kind: "web", text: query };
      }

      const urlValue = getStringField(parsed, ["url", "ref_id"]);
      const url = urlValue ? getTrimmedPreview(urlValue, TRACE_SUMMARY_MAX_LENGTH) : null;
      if (url) {
        return { kind: "web", text: url };
      }

      const description = getTrimmedPreview(
        getStringField(parsed, ["description", "prompt", "command"]) ?? getFirstStringField(parsed) ?? args.input,
        TRACE_SUMMARY_MAX_LENGTH,
      );
      return description ? { kind: "text", text: description } : null;
    }
  }
}

export function deriveTodoTraceStatus(args: {
  input: string;
  state?: ToolUsePart["state"];
}) {
  const progress = getTodoProgress({ input: args.input });

  if (progress.totalCount > 0 && progress.completedCount === progress.totalCount) {
    return "done" as const;
  }

  if (args.state === "output-available" || args.state === "output-error") {
    return "done" as const;
  }

  if (
    args.state === "input-streaming"
    || args.state === "input-available"
    || progress.hasInProgressTodos
    || progress.hasPendingTodos
  ) {
    return "active" as const;
  }

  return "pending" as const;
}

export function deriveTodoTraceItems(args: {
  input: string;
  state?: ToolUsePart["state"];
}): TodoItem[] {
  const progress = getTodoProgress({ input: args.input });
  if (args.state !== "input-streaming" && args.state !== "input-available") {
    return progress.todos;
  }
  if (progress.hasInProgressTodos) {
    return progress.todos;
  }

  const firstPendingIndex = progress.todos.findIndex((todo) => todo.status === "pending");
  if (firstPendingIndex === -1) {
    return progress.todos;
  }

  return progress.todos.map((todo, index) => (
    index === firstPendingIndex
      ? { ...todo, status: "in_progress" as const }
      : todo
  ));
}
