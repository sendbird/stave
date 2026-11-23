import { isLikelyWorkspaceFilePath } from "@/lib/message-file-links";
import { stripAnsiControlSequences } from "@/lib/workspace-scripts/ansi";

const MAX_PARSE_CHARS = 128 * 1024;
const MAX_PREVIEW_CHARS = 24 * 1024;
const MAX_MATCHES = 50;
const MAX_JSON_NODES = 300;
const MAX_JSON_DEPTH = 8;

export type ToolFileLocation = { path: string; line?: number };
type ReadDetail = ToolFileLocation & {
  offset?: number;
  limit?: number;
  endLine?: number;
  pages?: string;
};
type SearchDetail = {
  kind: "grep" | "glob";
  cwd?: string;
  file?: string;
  countOnly?: boolean;
};

export type ToolDetailInput = {
  command?: string;
  read?: ReadDetail;
  search?: SearchDetail;
  remainingInput?: string | null;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseJson(text: string): unknown {
  if (text.length > MAX_PARSE_CHARS) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown, min = 1) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min
    ? value
    : undefined;
}

function resolveCommandPath(path: string, cwd?: string) {
  if (!cwd || /^(?:[/\\]|[A-Za-z]:[/\\])/.test(path)) return path;
  return `${cwd.replace(/[/\\]+$/, "")}/${path.replace(/^\.\//, "")}`;
}

/** The transcript already serializes SDK arguments and App Server item input. */
export function normalizeToolDetailInput(toolName: string, input: string): ToolDetailInput {
  if (toolName === "bash") {
    const args = record(parseJson(input));
    const command = typeof args?.command === "string" ? args.command : input;
    const action = record(args?.fileAction);
    const cwd = textValue(action?.cwd);
    const path = textValue(action?.path);
    if (action?.kind === "read" && path) {
      return { command, read: { path: resolveCommandPath(path, cwd) }, remainingInput: null };
    }
    if (action?.kind === "grep" || action?.kind === "glob") {
      return {
        command,
        search: { kind: action.kind, cwd, file: path && isLikelyWorkspaceFilePath(path.replaceAll(" ", "_")) ? path : undefined },
        remainingInput: null,
      };
    }
    return { command };
  }

  const kind = toolName.split(/:|__/).at(-1)?.toLowerCase();
  if (kind !== "read" && kind !== "grep" && kind !== "glob") return {};
  const args = record(parseJson(input));
  if (kind !== "read") {
    const file = textValue(args?.path ?? args?.file_path);
    return {
      search: {
        kind,
        file: file && isLikelyWorkspaceFilePath(file.replaceAll(" ", "_")) ? file : undefined,
        countOnly: args?.output_mode === "count",
      },
    };
  }

  const path = textValue(args?.file_path ?? args?.path);
  if (!args || !path) return {};
  const offset = integer(args.offset, 0);
  const limit = integer(args.limit);
  const startLine = integer(args.start_line ?? args.startLine);
  const end = integer(args.end_line ?? args.endLine);
  const endLine = startLine !== undefined && end !== undefined && end >= startLine ? end : undefined;
  const pages = typeof args.pages === "string" && /^\d+(?:-\d+)?$/.test(args.pages) ? args.pages : undefined;
  const remaining = { ...args };
  delete remaining[args.file_path != null ? "file_path" : "path"];
  if (offset !== undefined) delete remaining.offset;
  if (limit !== undefined) delete remaining.limit;
  if (startLine !== undefined) delete remaining[args.start_line != null ? "start_line" : "startLine"];
  if (endLine !== undefined) delete remaining[args.end_line != null ? "end_line" : "endLine"];
  if (pages !== undefined) delete remaining.pages;
  return {
    read: { path, offset, limit, line: startLine ?? (offset === undefined ? undefined : Math.max(1, offset)), endLine, pages },
    remainingInput: Object.keys(remaining).length ? JSON.stringify(remaining, null, 2) : null,
  };
}

function looksLikeMatchPath(path: string, allowBare: boolean) {
  if (!path || /[\x00-\x1f<>|*?]/.test(path) || /:(?![/\\])|:\/\//.test(path)) return false;
  const portable = path.replaceAll("\\", "/");
  return (
    portable.includes("/") ||
    isLikelyWorkspaceFilePath(portable.replaceAll(" ", "_")) ||
    (allowBare && /^[\w.-]+$/.test(portable))
  );
}

type ToolMatch = ToolFileLocation & { snippet?: string };
type MatchList = { kind: "matches"; matches: ToolMatch[]; hidden: number };

function mcpTextBlocks(parsed: unknown): string[] | undefined {
  const content = record(parsed)?.content;
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const texts: string[] = [];
  for (const block of content) {
    const item = record(block);
    if (item?.type !== "text" || typeof item.text !== "string") return undefined;
    texts.push(item.text);
  }
  return texts;
}

function parseMatchList(output: string, search: SearchDetail): MatchList | undefined {
  if (search.countOnly) return undefined;
  const matches: ToolMatch[] = [];
  let total = 0;
  const lines = stripAnsiControlSequences(output).trim().split("\n");
  for (const [index, raw] of lines.entries()) {
    const row = raw.trim();
    if (!row || (index === 0 && /^Found \d+ files?$/.test(row))) continue;
    const located = /^(.+?):(\d+)(?::(.*))?$/.exec(row);
    const singleFile = search.file ? /^(\d+):(.*)$/.exec(row) : null;
    const path = (singleFile ? search.file : located?.[1]) ?? row;
    const line = integer(Number(singleFile ? singleFile[1] : located?.[2]));
    if (!looksLikeMatchPath(path, search.kind === "glob") || ((located || singleFile) && line === undefined)) {
      return undefined;
    }
    total += 1;
    if (matches.length < MAX_MATCHES) {
      matches.push({
        path: resolveCommandPath(path, search.cwd),
        line,
        snippet: singleFile ? singleFile[2] : located?.[3],
      });
    }
  }
  return total > 0 ? { kind: "matches", matches, hidden: total - matches.length } : undefined;
}

export type ToolJsonNode =
  | { key?: string; text: string }
  | { key?: string; array: boolean; children: ToolJsonNode[]; omitted: number };
type ToolOutputDetail =
  | MatchList
  | { kind: "json"; root: ToolJsonNode }
  | { kind: "text"; text: string; truncated: boolean };

function jsonTree(value: object): ToolJsonNode {
  let remaining = MAX_JSON_NODES;
  function visit(value: unknown, depth: number, key?: string): ToolJsonNode {
    remaining -= 1;
    if (value === null || typeof value !== "object") {
      return { key, text: JSON.stringify(value) };
    }
    const array = Array.isArray(value);
    const keys = Object.keys(value);
    const children: ToolJsonNode[] = [];
    if (depth < MAX_JSON_DEPTH) {
      for (const childKey of keys) {
        if (remaining <= 0) break;
        children.push(visit((value as Record<string, unknown>)[childKey], depth + 1, array ? undefined : childKey));
      }
    }
    return { key, array, children, omitted: keys.length - children.length };
  }
  return visit(value, 0);
}

export function normalizeToolDetailOutput(output: string, search?: SearchDetail): ToolOutputDetail {
  if (output.length > MAX_PARSE_CHARS) {
    return { kind: "text", text: output.slice(0, MAX_PREVIEW_CHARS), truncated: true };
  }
  const parsed = parseJson(output);
  const mcpText = mcpTextBlocks(parsed);
  if (search) {
    return parseMatchList(mcpText?.join("\n") ?? output, search) ?? { kind: "text", text: output, truncated: false };
  }
  if (parsed !== null && typeof parsed === "object") {
    // App Server serializes the MCP result envelope, while the SDK emits its
    // text blocks. Surface the same JSON when an envelope carries one payload.
    const envelope = record(parsed);
    let value = parsed;
    if (mcpText) {
      const structured = envelope?.structuredContent;
      const embedded = mcpText.length === 1 ? parseJson(mcpText[0]!) : undefined;
      if (structured && typeof structured === "object") value = structured;
      else if (embedded && typeof embedded === "object") value = embedded;
    }
    return { kind: "json", root: jsonTree(value) };
  }
  return { kind: "text", text: output, truncated: false };
}
