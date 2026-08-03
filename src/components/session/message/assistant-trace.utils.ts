import { getTodoProgress, type TodoItem } from "@/components/ai-elements/todo";
import type { ToolUsePart } from "@/types/chat";

export type TraceToolSummaryKind = "command" | "file" | "search" | "web" | "text";

export interface TraceToolSummary {
  kind: TraceToolSummaryKind;
  text: string;
  /**
   * Input key the chip text came from, when it came from a parsed JSON field.
   * The expanded step strips this key so the same value is not rendered twice —
   * once as the header chip and again as raw JSON.
   */
  sourceKey?: string;
}

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

interface MatchedField {
  key: string;
  value: string;
}

function matchStringField(
  record: Record<string, unknown> | null,
  keys: string[],
): MatchedField | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return { key, value };
    }
  }
  return null;
}

function matchFirstStringField(record: Record<string, unknown> | null): MatchedField | null {
  if (!record) {
    return null;
  }
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value.trim()) {
      return { key, value };
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

  /*
   * `sourceKey` is only set when the chip text is the *whole* field value.
   * A truncated preview keeps `sourceKey` undefined so the expanded step still
   * shows the full value instead of silently dropping the tail.
   */
  function fromField(
    kind: TraceToolSummaryKind,
    match: MatchedField | null,
    maxLength: number,
  ): TraceToolSummary | null {
    const raw = match?.value ?? args.input;
    const text = getTrimmedPreview(raw, maxLength);
    if (!text) {
      return null;
    }
    return { kind, text, sourceKey: match && text === raw.trim() ? match.key : undefined };
  }

  /*
   * File chips show the basename for scannability, so the directory is only
   * recoverable from the expanded step. `sourceKey` is therefore withheld
   * unless the path *is* its own basename — otherwise de-duplicating would
   * throw the directory away, not just the repetition.
   */
  function fromFileField(match: MatchedField | null): TraceToolSummary | null {
    if (!match) {
      return null;
    }
    const name = extractFileName(match.value);
    return {
      kind: "file",
      text: name,
      sourceKey: name === match.value.trim() ? match.key : undefined,
    };
  }

  switch (normalizedToolName) {
    case "bash":
      return fromField(
        "command",
        matchStringField(parsed, ["command"]),
        TRACE_COMMAND_SUMMARY_MAX_LENGTH,
      );
    case "read":
    case "write":
    case "edit":
      return fromFileField(matchStringField(parsed, ["file_path", "path"]));
    case "glob":
    case "grep":
      return fromField("search", matchStringField(parsed, ["pattern"]), TRACE_SUMMARY_MAX_LENGTH);
    case "websearch":
      return fromField("web", matchStringField(parsed, ["query", "q"]), TRACE_SUMMARY_MAX_LENGTH);
    case "webfetch":
      return fromField("web", matchStringField(parsed, ["url", "ref_id"]), TRACE_SUMMARY_MAX_LENGTH);
    default: {
      const fileSummary = fromFileField(matchStringField(parsed, ["file_path", "path"]));
      if (fileSummary) {
        return fileSummary;
      }

      const patternMatch = matchStringField(parsed, ["pattern"]);
      if (patternMatch) {
        const pattern = fromField("search", patternMatch, TRACE_SUMMARY_MAX_LENGTH);
        if (pattern) {
          return pattern;
        }
      }

      const queryMatch = matchStringField(parsed, ["query", "q"]);
      if (queryMatch) {
        const query = fromField("web", queryMatch, TRACE_SUMMARY_MAX_LENGTH);
        if (query) {
          return query;
        }
      }

      const urlMatch = matchStringField(parsed, ["url", "ref_id"]);
      if (urlMatch) {
        const url = fromField("web", urlMatch, TRACE_SUMMARY_MAX_LENGTH);
        if (url) {
          return url;
        }
      }

      const descriptionMatch =
        matchStringField(parsed, ["description", "prompt", "command"]) ?? matchFirstStringField(parsed);
      return fromField("text", descriptionMatch, TRACE_SUMMARY_MAX_LENGTH);
    }
  }
}

/**
 * Input JSON with the chip's field removed, or `null` when nothing is left to
 * show. Single-argument tools (`Bash`, `Read`, `Grep`) therefore render no
 * INPUT panel at all — the header chip already carries the whole input.
 */
export function getResidualToolInput(args: {
  input: string;
  summary: TraceToolSummary | null;
}): string | null {
  const sourceKey = args.summary?.sourceKey;
  if (!sourceKey) {
    return args.input.trim() || null;
  }

  const parsed = parseToolInputRecord(args.input);
  if (!parsed || !(sourceKey in parsed)) {
    return args.input.trim() || null;
  }

  const residual = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key !== sourceKey),
  );
  return Object.keys(residual).length > 0 ? JSON.stringify(residual, null, 2) : null;
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
