/**
 * ACP agents (Cursor, Kiro) put human prose in `toolCall.title`: usually the
 * whole shell command or an absolute file path. Claude and Codex instead send a
 * canonical tool name (`Bash`, `Read`, …) and leave the target to the tool
 * input, which is what lets the trace render a short title plus a single target
 * chip. Mapping the ACP `kind` onto those same canonical names — and moving the
 * title into the input when the agent sent no structured target — keeps an ACP
 * trace row visually identical to a Claude or Codex one.
 */

/** ACP `ToolKind` → the canonical tool name the trace UI already styles. */
const ACP_KIND_TOOL_NAMES: Record<string, string> = {
  read: "Read",
  edit: "Edit",
  delete: "Delete",
  move: "Move",
  search: "Search",
  execute: "Bash",
  think: "Think",
  fetch: "WebFetch",
  switch_mode: "SwitchMode",
};

/**
 * Per-kind input keys. The first entry is the canonical key the trace chip
 * reads; the rest are agent spellings that get renamed onto it so the chip does
 * not degrade into a raw JSON blob.
 */
const ACP_KIND_TARGET_KEYS: Record<string, string[]> = {
  read: ["file_path", "path", "filePath", "abs_path", "absolutePath"],
  edit: ["file_path", "path", "filePath", "abs_path", "absolutePath"],
  delete: ["file_path", "path", "filePath"],
  move: ["file_path", "path", "filePath", "source", "from"],
  search: ["pattern", "query", "q", "regex"],
  execute: ["command", "cmd", "script"],
  think: ["description", "thought"],
  fetch: ["url", "uri"],
  switch_mode: ["description", "mode", "modeId"],
};

const DEFAULT_TARGET_KEYS = ["description"];

/** Titles longer or more path/command-like than this are chips, not titles. */
const ACP_TITLE_NAME_MAX_LENGTH = 48;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function findTargetKey(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return key;
    }
  }
  return null;
}

/**
 * A title is only reusable as a tool *name* when it reads like a label. Paths,
 * multi-line text, shell operators, and long prose all belong in the chip.
 */
function isLabelLikeTitle(title: string): boolean {
  if (!title || title.length > ACP_TITLE_NAME_MAX_LENGTH) {
    return false;
  }
  if (/[\n\r]/.test(title)) {
    return false;
  }
  return !/[/;`$|]|&&|\s-{1,2}[a-z]/i.test(title);
}

/**
 * Neutral row title. A non-standard `kind` is more informative than "Tool", but
 * a prose title always outranks it — that title becomes the chip.
 */
function toFallbackToolName(kind: string, title: string): string {
  if (title || !kind || kind === "other") {
    return "Tool";
  }
  return kind.slice(0, 1).toUpperCase() + kind.slice(1);
}

export interface AcpToolPresentation {
  /** Canonical tool name for the trace row title. */
  toolName: string;
  /** Tool input, normalized so the trace derives one target chip from it. */
  input: unknown;
}

/**
 * Splits an ACP tool call into the canonical name plus a chip-friendly input.
 * Never drops the title: when the agent sent no structured target, the title
 * moves into the input under the kind's canonical key so it renders as the
 * target chip instead of as an oversized row title.
 */
export function deriveAcpToolPresentation(args: {
  title?: string | null;
  kind?: string | null;
  rawInput?: unknown;
}): AcpToolPresentation {
  const title = args.title?.trim() ?? "";
  const kind = args.kind?.trim().toLowerCase() ?? "";
  const record = toRecord(args.rawInput);
  const canonicalName = ACP_KIND_TOOL_NAMES[kind];

  let toolName: string;
  let targetKeys: string[];
  let titleIsName = false;

  if (canonicalName) {
    toolName = canonicalName;
    targetKeys = ACP_KIND_TARGET_KEYS[kind] ?? DEFAULT_TARGET_KEYS;
  } else if (findTargetKey(record, ACP_KIND_TARGET_KEYS.execute ?? DEFAULT_TARGET_KEYS)) {
    /* Agents that omit `kind` still send `command` for shells. */
    toolName = "Bash";
    targetKeys = ACP_KIND_TARGET_KEYS.execute ?? DEFAULT_TARGET_KEYS;
  } else if (isLabelLikeTitle(title)) {
    /* Short labels (MCP tool names, "Fetch rules") already read like a name, so
       they stay in the title and the input is passed through untouched. */
    toolName = title;
    targetKeys = DEFAULT_TARGET_KEYS;
    titleIsName = true;
  } else {
    /* Prose title or nothing usable: fall back to a neutral name and let the
       title become the chip below. */
    toolName = toFallbackToolName(kind, title);
    targetKeys = DEFAULT_TARGET_KEYS;
  }

  const canonicalKey = targetKeys[0] ?? "description";
  const matchedKey = findTargetKey(record, targetKeys);

  if (record && matchedKey) {
    if (matchedKey === canonicalKey) {
      return { toolName, input: record };
    }
    /* Rename the agent's spelling onto the key the trace chip reads, keeping
       the remaining arguments so the expanded step still shows them. */
    const { [matchedKey]: matchedValue, ...rest } = record;
    return { toolName, input: { [canonicalKey]: matchedValue, ...rest } };
  }

  if (titleIsName || !title) {
    return { toolName, input: record ?? args.rawInput };
  }
  return { toolName, input: { ...(record ?? {}), [canonicalKey]: title } };
}
