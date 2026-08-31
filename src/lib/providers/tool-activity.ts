/**
 * Provider-agnostic vocabulary for tool activity.
 *
 * Every provider runs the same handful of operations — a shell command, a file
 * read, an edit, a search, a web lookup, a delegation — and every provider names
 * them differently. Claude reports `Bash`, `Read`, `Edit`, `WebSearch`; the Codex
 * app server reports `bash` and `web_search`; ACP agents report a whole prose
 * sentence as the tool name. Titling rows straight from those tokens meant one
 * operation read three different ways depending on which agent ran, and left a
 * bare `bash` sitting in the row's most prominent slot.
 *
 * So a row's title comes from the canonical labels here whenever the provider
 * offered no better one, and the provider's own token is carried separately as
 * provider-specific detail. This mirrors `./hook-activity.ts`, which does the
 * same job for hook lifecycle events.
 */


/**
 * The canonical label for "this call handed work to another agent". Exported
 * because callers that decorate delegation rows need to recognize the generic
 * label and avoid stacking a second word for the same idea on top of it.
 */
export const TOOL_DELEGATION_LABEL = "Delegate work";

/**
 * Canonical operation per tool token. Keys are normalized leaf tokens — see
 * `resolveToolNameLeaf` — so `Bash`, `bash`, and a namespaced
 * `collaboration:spawn_agent` all resolve without separate entries.
 */
const TOOL_OPERATION_LABELS: Record<string, string> = {
  // Shell
  bash: "Run command",
  sh: "Run command",
  shell: "Run command",
  localshell: "Run command",
  terminal: "Run command",
  runcommand: "Run command",
  runterminalcommand: "Run command",
  executecommand: "Run command",
  commandexecution: "Run command",
  // Read
  read: "Read file",
  readfile: "Read file",
  view: "Read file",
  viewfile: "Read file",
  // Write and edit
  edit: "Edit file",
  multiedit: "Edit file",
  editfile: "Edit file",
  strreplace: "Edit file",
  strreplaceeditor: "Edit file",
  filechange: "Edit file",
  write: "Write file",
  writefile: "Write file",
  createfile: "Write file",
  notebookedit: "Edit notebook",
  applypatch: "Apply patch",
  patch: "Apply patch",
  // Search
  glob: "Find files",
  filesearch: "Find files",
  grep: "Search code",
  ripgrep: "Search code",
  codebasesearch: "Search code",
  search: "Search",
  // Web
  websearch: "Web search",
  webfetch: "Fetch page",
  fetch: "Fetch page",
  // Delegation
  task: TOOL_DELEGATION_LABEL,
  agent: TOOL_DELEGATION_LABEL,
  spawnagent: TOOL_DELEGATION_LABEL,
  worker: TOOL_DELEGATION_LABEL,
  // Turn-shaping
  exitplanmode: "Submit plan",
  todowrite: "Update todos",
};

/**
 * Tokens that name no tool. Runtimes fall back to these when a provider omits
 * the tool name, so they must never reach a row as if they were an operation.
 */
const PLACEHOLDER_TOOL_TOKENS = new Set([
  "tool",
  "tooluse",
  "toolcall",
  "unknown",
  "unknowntool",
]);

function normalizeToolToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The action part of a tool name, with any namespace dropped:
 * `mcp__ibis__ibis_create_page` and `ibis:ibis_create_page` both reduce to
 * `ibiscreatepage`, so the two providers' spellings of one MCP tool compare
 * equal.
 */
export function resolveToolNameLeaf(toolName: string) {
  const segments = toolName
    .trim()
    .split(/__|:|\./)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return normalizeToolToken(segments.at(-1) ?? toolName);
}

/** Whether a tool name is a runtime placeholder rather than a real name. */
export function isPlaceholderToolName(toolName: string) {
  const leaf = resolveToolNameLeaf(toolName);
  return !leaf || PLACEHOLDER_TOOL_TOKENS.has(leaf);
}

/**
 * Todo bookkeeping calls. Every provider makes them and the activity shelf
 * already renders todos as their own rows, so a `TodoWrite` row is the same
 * information twice — and it competes for the tightly capped plain-tool slots.
 */
export function isTodoToolName(toolName: string) {
  return resolveToolNameLeaf(toolName) === "todowrite";
}

/**
 * The canonical label for a tool operation, or null when the token names no
 * operation this maps (a third-party MCP tool, or an agent-authored sentence).
 */
export function describeToolOperationLabel(toolName: string): string | null {
  if (isPlaceholderToolName(toolName)) {
    return null;
  }
  return TOOL_OPERATION_LABELS[resolveToolNameLeaf(toolName)] ?? null;
}

/**
 * The provider's own tool token, for the row's provider-specific slot.
 *
 * Returns null when showing it would only restate the title: a row already
 * titled from the token (`ibis create page` from `ibis:ibis_create_page`, or an
 * ACP agent's own sentence) gains nothing from a second copy of it, and the
 * point of the slot is to add what the normalized half cannot say.
 *
 * The token is returned untruncated; callers bound it with the same limit they
 * apply to the rest of the row. Nothing here imports `subagent-identity`, which
 * imports this module for its title fallback.
 */
export function resolveToolProviderDetail(args: {
  toolName: string;
  title: string;
}): string | null {
  const token = args.toolName.trim();
  if (!token || isPlaceholderToolName(token)) {
    return null;
  }
  if (normalizeToolToken(args.title) === resolveToolNameLeaf(token)) {
    return null;
  }
  return token;
}
