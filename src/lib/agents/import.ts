import { parseMarkdownFrontmatter } from "@/lib/markdown-frontmatter";
import type { ProviderId } from "@/lib/providers/provider.types";
import { WORKER_EFFORT_ORDER, type WorkerEffort } from "@/lib/providers/worker-mode";
import { hashAgentContent } from "./compile";
import { parseToml, type TomlValue } from "./toml-lite";
import {
  AGENT_CONFIG_LIMITS,
  AGENT_CONFIG_VERSION,
  AgentConfigSchema,
  type AgentConfig,
  type AgentFileFormat,
  type AgentModel,
  type AgentPermission,
  type AgentReportSection,
  type AgentWorkspace,
} from "./schema";

/**
 * Reads the agent files providers already keep in a repository and turns one
 * into an agent draft. Read-only: it never touches the file.
 *
 * Anything that would run code or widen permissions when the agent starts —
 * hooks, inline MCP servers, skip-approval modes — is refused, because the file
 * comes from a repository the user may not have written. Fields Stave has no
 * place for are dropped and listed, never guessed.
 */

export interface AgentFileLocation {
  format: AgentFileFormat;
  /** Repository-relative glob, for discovery. */
  glob: string;
}

export const AGENT_FILE_LOCATIONS: readonly AgentFileLocation[] = [
  { format: "claude-md", glob: ".claude/agents/**/*.md" },
  { format: "codex-toml", glob: ".codex/agents/*.toml" },
  { format: "kiro-json", glob: ".kiro/agents/*.json" },
  { format: "kiro-md", glob: ".kiro/agents/*.md" },
  { format: "cursor-md", glob: ".cursor/agents/*.md" },
  { format: "copilot-md", glob: ".github/agents/*.agent.md" },
];

export type AgentImportOutcome = "dropped" | "refused" | "changed";

export interface AgentImportNote {
  field: string;
  outcome: AgentImportOutcome;
  reason: string;
}

export type AgentImportResult =
  | { ok: true; format: AgentFileFormat; agent: AgentConfig; notes: AgentImportNote[] }
  | {
      ok: false;
      code: "unknown-format" | "unreadable" | "missing-instructions" | "too-long" | "invalid";
      message: string;
      notes: AgentImportNote[];
    };

const FORMAT_PROVIDER: Readonly<Record<AgentFileFormat, ProviderId | null>> = {
  "claude-md": "claude-code",
  "codex-toml": "codex",
  "kiro-json": "kiro",
  "kiro-md": "kiro",
  "cursor-md": "cursor",
  "copilot-md": null,
};

/**
 * Tools that edit files. A shell is not one: a reviewer that runs tests is
 * still meant to read only, and reading it as read-only only ever narrows
 * what the agent may do — the permission is enforced, not the tool list.
 */
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit", "fs_write", "write", "edit"]);
const RUNS_CODE = "It would run commands from this repository when the agent starts.";
const SKIPS_APPROVAL = "It would skip approvals. Choose a permission when you assign work.";

export function detectAgentFileFormat(path: string): AgentFileFormat | null {
  const normalized = path.replace(/\\/g, "/");
  if (/(^|\/)\.claude\/agents\/.+\.md$/.test(normalized)) return "claude-md";
  if (/(^|\/)\.codex\/agents\/[^/]+\.toml$/.test(normalized)) return "codex-toml";
  if (/(^|\/)\.kiro\/agents\/[^/]+\.json$/.test(normalized)) return "kiro-json";
  if (/(^|\/)\.kiro\/agents\/[^/]+\.md$/.test(normalized)) return "kiro-md";
  if (/(^|\/)\.cursor\/agents\/[^/]+\.md$/.test(normalized)) return "cursor-md";
  if (/(^|\/)\.github\/agents\/[^/]+\.agent\.md$/.test(normalized)) return "copilot-md";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Field readers                                                              */
/* -------------------------------------------------------------------------- */

/** Normalised view of a source file: every value as a list of strings. */
type Fields = Map<string, string[]>;

function fieldsFromFrontmatter(content: string): { fields: Fields; body: string; hasFrontmatter: boolean } {
  const parsed = parseMarkdownFrontmatter(content);
  const fields: Fields = new Map();
  for (const entry of parsed.entries) {
    fields.set(entry.key, entry.values);
  }
  return { fields, body: parsed.body.trim(), hasFrontmatter: parsed.hasFrontmatter };
}

function toStrings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(toStrings);
  if (typeof value === "object") return [JSON.stringify(value)];
  return [String(value)];
}

function fieldsFromObject(record: Record<string, unknown>): Fields {
  const fields: Fields = new Map();
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Keep nested maps as one entry per child so refused keys stay visible.
      const children = Object.keys(value as Record<string, unknown>);
      fields.set(key, children.length ? children : [""]);
    } else {
      fields.set(key, toStrings(value));
    }
  }
  return fields;
}

function fieldsFromToml(values: Record<string, TomlValue>): Fields {
  const fields: Fields = new Map();
  for (const [key, value] of Object.entries(values)) fields.set(key, toStrings(value));
  return fields;
}

/** Top-level key of a flattened frontmatter key (`hooks.PreToolUse` → `hooks`). */
function topKey(key: string) {
  return key.split(".")[0]!;
}

function takeText(fields: Fields, key: string): string | undefined {
  const values = fields.get(key);
  if (!values || values.length === 0) return undefined;
  const text = values.join(" ").trim();
  return text || undefined;
}

/** A tool list written as `Read, Grep` or as a YAML/TOML/JSON list. */
function takeList(fields: Fields, key: string): string[] | undefined {
  const values = fields.get(key);
  if (!values) return undefined;
  const items = values
    .flatMap((value) => value.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? [...new Set(items)] : undefined;
}

function takeBoolean(fields: Fields, key: string): boolean | undefined {
  const value = takeText(fields, key)?.toLowerCase();
  return value === "true" ? true : value === "false" ? false : undefined;
}

function toEffort(value: string | undefined): WorkerEffort | undefined {
  return WORKER_EFFORT_ORDER.find((effort) => effort === value);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, AGENT_CONFIG_LIMITS.id);
  return slug || "imported-agent";
}

function fileStem(path: string): string {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return name.replace(/\.agent\.md$/, "").replace(/\.(md|toml|json)$/, "");
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

interface Draft {
  name?: string;
  description?: string;
  instructions?: string;
  model?: string;
  effort?: WorkerEffort;
  allow?: string[];
  deny?: string[];
  maxTurns?: number;
  skills?: string[];
  permission?: AgentPermission;
  workspace?: AgentWorkspace;
}

/** Fields each format understands; everything else is dropped with a note. */
const KNOWN_FIELDS: Readonly<Record<AgentFileFormat, ReadonlySet<string>>> = {
  "claude-md": new Set(["name", "description", "tools", "disallowedTools", "model", "effort", "permissionMode", "maxTurns", "skills", "isolation"]),
  "codex-toml": new Set(["name", "description", "developer_instructions", "model", "model_reasoning_effort", "sandbox_mode"]),
  "kiro-json": new Set(["name", "description", "prompt", "tools", "allowedTools", "model"]),
  "kiro-md": new Set(["name", "description", "tools", "allowedTools", "model"]),
  "cursor-md": new Set(["name", "description", "model", "readonly"]),
  "copilot-md": new Set(["name", "description", "tools", "model"]),
};

/** Keys that would run code or widen access; refused in every format. */
const REFUSED_FIELDS: ReadonlyMap<string, string> = new Map([
  ["hooks", RUNS_CODE],
  ["mcpServers", RUNS_CODE],
  ["mcp_servers", RUNS_CODE],
  ["mcp-servers", RUNS_CODE],
]);

function readClaudePermission(mode: string | undefined, notes: AgentImportNote[]): AgentPermission | undefined {
  switch (mode) {
    case undefined:
      return undefined;
    case "plan":
      return "read-only";
    case "default":
    case "manual":
    case "dontAsk":
      return "manual";
    case "acceptEdits":
      return "guided";
    case "auto":
      return "auto";
    case "bypassPermissions":
      notes.push({ field: "permissionMode", outcome: "refused", reason: SKIPS_APPROVAL });
      return undefined;
    default:
      notes.push({ field: "permissionMode", outcome: "dropped", reason: `Unknown permission mode "${mode}".` });
      return undefined;
  }
}

function readCodexSandbox(mode: string | undefined, notes: AgentImportNote[]): AgentPermission | undefined {
  switch (mode) {
    case undefined:
      return undefined;
    case "read-only":
      return "read-only";
    case "workspace-write":
      return "guided";
    case "danger-full-access":
      notes.push({ field: "sandbox_mode", outcome: "refused", reason: SKIPS_APPROVAL });
      return undefined;
    default:
      notes.push({ field: "sandbox_mode", outcome: "dropped", reason: `Unknown sandbox mode "${mode}".` });
      return undefined;
  }
}

function readDraft(format: AgentFileFormat, fields: Fields, body: string, notes: AgentImportNote[]): Draft {
  const draft: Draft = {
    name: takeText(fields, "name"),
    description: takeText(fields, "description"),
    model: takeText(fields, "model"),
  };
  switch (format) {
    case "claude-md": {
      draft.instructions = body;
      draft.allow = takeList(fields, "tools");
      draft.deny = takeList(fields, "disallowedTools");
      draft.effort = toEffort(takeText(fields, "effort"));
      draft.skills = takeList(fields, "skills");
      const turns = Number(takeText(fields, "maxTurns"));
      if (Number.isInteger(turns)) draft.maxTurns = turns;
      draft.permission = readClaudePermission(takeText(fields, "permissionMode"), notes);
      if (takeText(fields, "isolation") === "worktree") draft.workspace = "new-worktree";
      if (draft.model === "inherit") draft.model = undefined;
      break;
    }
    case "codex-toml": {
      draft.instructions = takeText(fields, "developer_instructions");
      draft.effort = toEffort(takeText(fields, "model_reasoning_effort"));
      draft.permission = readCodexSandbox(takeText(fields, "sandbox_mode"), notes);
      break;
    }
    case "kiro-json": {
      const prompt = takeText(fields, "prompt");
      if (prompt?.startsWith("file://")) {
        notes.push({ field: "prompt", outcome: "dropped", reason: "The prompt points at another file; paste its text into the instructions." });
      } else {
        draft.instructions = prompt;
      }
      draft.allow = takeList(fields, "tools");
      break;
    }
    case "kiro-md": {
      draft.instructions = body;
      draft.allow = takeList(fields, "tools");
      break;
    }
    case "cursor-md": {
      draft.instructions = body;
      if (takeBoolean(fields, "readonly")) draft.permission = "read-only";
      break;
    }
    case "copilot-md": {
      draft.instructions = body;
      draft.allow = takeList(fields, "tools");
      break;
    }
  }
  if (format === "kiro-json" || format === "kiro-md") {
    const allowed = takeList(fields, "allowedTools");
    if (allowed) {
      notes.push({
        field: "allowedTools",
        outcome: "dropped",
        reason: "Tools that run without asking are a permission choice; pick one when you assign work.",
      });
    }
  }
  return draft;
}

function modelFor(format: AgentFileFormat, draft: Draft, notes: AgentImportNote[]): AgentModel {
  const providerId = FORMAT_PROVIDER[format];
  if (!draft.model) return { mode: "auto" };
  if (!providerId) {
    notes.push({ field: "model", outcome: "changed", reason: `"${draft.model}" has no Stave provider; the agent follows auto-routing.` });
    return { mode: "auto" };
  }
  return {
    mode: "fixed",
    providerId,
    model: draft.model.slice(0, AGENT_CONFIG_LIMITS.model),
    ...(draft.effort ? { effort: draft.effort } : {}),
  };
}

function reportFor(permission: AgentPermission): AgentReportSection[] {
  return permission === "read-only" ? ["summary", "findings", "limitations"] : ["summary", "changes", "verification", "limitations"];
}

function clip(value: string, max: number, field: string, notes: AgentImportNote[]) {
  if (value.length <= max) return value;
  notes.push({ field, outcome: "changed", reason: `Shortened to ${max} characters.` });
  return value.slice(0, max);
}

export function importAgentFile(args: { path: string; content: string }): AgentImportResult {
  const notes: AgentImportNote[] = [];
  const format = detectAgentFileFormat(args.path);
  if (!format) {
    return { ok: false, code: "unknown-format", message: `${args.path} is not in a known agent folder.`, notes };
  }

  let fields: Fields;
  let body = "";
  if (format === "codex-toml") {
    const parsed = parseToml(args.content);
    fields = fieldsFromToml(parsed.values);
    for (const table of parsed.tables) {
      const root = table.split(".")[0]!;
      notes.push({
        field: table,
        outcome: REFUSED_FIELDS.has(root) ? "refused" : "dropped",
        reason: REFUSED_FIELDS.get(root) ?? "Stave has no place for this section.",
      });
    }
    for (const error of parsed.errors) notes.push({ field: "file", outcome: "dropped", reason: error });
  } else if (format === "kiro-json") {
    try {
      const parsed: unknown = JSON.parse(args.content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      fields = fieldsFromObject(parsed as Record<string, unknown>);
    } catch {
      return { ok: false, code: "unreadable", message: `${args.path} is not a JSON object.`, notes };
    }
  } else {
    const parsed = fieldsFromFrontmatter(args.content);
    if (!parsed.hasFrontmatter && format !== "copilot-md") {
      return { ok: false, code: "unreadable", message: `${args.path} has no frontmatter.`, notes };
    }
    fields = parsed.fields;
    body = parsed.body;
  }

  // Report every field Stave does not carry over, once per top-level key.
  const known = KNOWN_FIELDS[format];
  const reported = new Set<string>();
  for (const key of fields.keys()) {
    const root = topKey(key);
    if (known.has(root) || reported.has(root)) continue;
    reported.add(root);
    const refusal = REFUSED_FIELDS.get(root);
    notes.push({
      field: root,
      outcome: refusal ? "refused" : "dropped",
      reason: refusal ?? "Stave has no place for this field.",
    });
  }

  const draft = readDraft(format, fields, body, notes);
  const instructions = draft.instructions?.trim();
  if (!instructions) {
    return { ok: false, code: "missing-instructions", message: `${args.path} has no instructions to import.`, notes };
  }
  if (instructions.length > AGENT_CONFIG_LIMITS.instructions) {
    return {
      ok: false,
      code: "too-long",
      message: `Instructions are ${instructions.length} characters; the limit is ${AGENT_CONFIG_LIMITS.instructions}.`,
      notes,
    };
  }

  // A tool list with no write tools means the agent was meant to read only.
  const allowOnlyReads = draft.allow ? draft.allow.every((tool) => !WRITE_TOOLS.has(tool)) : false;
  const permission: AgentPermission = draft.permission ?? (allowOnlyReads ? "read-only" : "guided");
  const workspace: AgentWorkspace = permission === "read-only" ? "same-workspace" : (draft.workspace ?? "same-workspace");
  if (draft.workspace === "new-worktree" && workspace !== "new-worktree") {
    notes.push({ field: "isolation", outcome: "changed", reason: "A read-only agent works in the current workspace." });
  }

  const name = clip(draft.name ?? fileStem(args.path), AGENT_CONFIG_LIMITS.name, "name", notes);
  const deny = draft.deny?.filter((tool) => !draft.allow?.includes(tool));
  const result = AgentConfigSchema.safeParse({
    version: AGENT_CONFIG_VERSION,
    id: slugify(draft.name ?? fileStem(args.path)),
    source: "repository",
    name,
    description: clip(draft.description ?? `Imported from ${args.path}.`, AGENT_CONFIG_LIMITS.description, "description", notes),
    instructions,
    skills: draft.skills?.slice(0, AGENT_CONFIG_LIMITS.skills) ?? [],
    model: modelFor(format, draft, notes),
    tools: {
      ...(draft.allow ? { allow: draft.allow.slice(0, AGENT_CONFIG_LIMITS.tools) } : {}),
      ...(deny?.length ? { deny: deny.slice(0, AGENT_CONFIG_LIMITS.tools) } : {}),
      ...(draft.maxTurns && draft.maxTurns >= AGENT_CONFIG_LIMITS.turnsMin && draft.maxTurns <= AGENT_CONFIG_LIMITS.turnsMax
        ? { maxTurns: draft.maxTurns }
        : {}),
    },
    permission,
    workspace,
    report: reportFor(permission),
    usableAs: ["primary", "worker", "delegate"],
    origin: { path: args.path.replace(/\\/g, "/"), format, contentHash: hashAgentContent(args.content) },
  });
  if (!result.success) {
    return {
      ok: false,
      code: "invalid",
      message: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      notes,
    };
  }
  return { ok: true, format, agent: result.data, notes };
}
