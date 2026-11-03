import type { I18nKey } from "@/i18n";
import type {
  ClaudeContextUsageResponse,
  ClaudeContextUsageSnapshot,
} from "@/lib/providers/provider.types";

/**
 * What fills a Claude conversation's context window, for the composer's
 * context meter.
 *
 * The fixed parts (system prompt, tools, MCP tools, memory files, skills…)
 * come from the SDK's `getContextUsage()` on a new session in the same folder
 * and account. That read starts a Claude process, connects its MCP servers and
 * counts every category with the token-count API, so it is a seconds-long,
 * networked call: the meter runs it only when its popover opens, and
 * `readClaudeContextUsageCached` keeps one result (or one in-flight request)
 * per task, model, account and folder for a short while.
 *
 * The conversation is not measured. It is the turn's reported used tokens
 * minus the fixed parts, and the popover says it is an estimate.
 */

type CategoryId = NonNullable<ClaudeContextUsageSnapshot["categories"][number]["id"]>;

/** The fixed categories shown, in reading order, with their labels. */
const FIXED_CATEGORY_LABELS = {
  system_prompt: "composer:contextBreakdown.category.systemPrompt",
  system_tools: "composer:contextBreakdown.category.systemTools",
  mcp_tools: "composer:contextBreakdown.category.mcpTools",
  mcp_instructions: "composer:contextBreakdown.category.mcpInstructions",
  custom_agents: "composer:contextBreakdown.category.customAgents",
  memory_files: "composer:contextBreakdown.category.memoryFiles",
  skills: "composer:contextBreakdown.category.skills",
} as const satisfies Partial<Record<CategoryId, I18nKey>>;

type FixedCategoryId = keyof typeof FIXED_CATEGORY_LABELS;

const FIXED_ORDER = Object.keys(FIXED_CATEGORY_LABELS) as FixedCategoryId[];

/** Categories that are not part of the fixed load: the conversation itself, unused room and deferred tools. */
const NOT_FIXED = new Set<CategoryId>([
  "messages",
  "free_space",
  "autocompact_buffer",
  "compact_buffer",
  "mcp_tools_deferred",
  "system_tools_deferred",
]);

export interface ContextBreakdownItem {
  id: string;
  label: string;
  /** A second, machine-register line: a server name or a full path. */
  detail?: string;
  tokens: number;
}

export interface ContextBreakdownRow {
  id: string;
  /** A known category's label key; unknown categories carry the SDK's own name. */
  labelKey?: (typeof FIXED_CATEGORY_LABELS)[FixedCategoryId];
  name?: string;
  tokens: number;
  /** What the row is made of, for the rows that expand (MCP tools, memory files). */
  items?: ContextBreakdownItem[];
}

export interface ContextBreakdown {
  rows: ContextBreakdownRow[];
  fixedTokens: number;
  /** Used tokens minus the fixed parts; null when it cannot be estimated honestly. */
  conversationTokens: number | null;
}

function isFixedCategory(category: ClaudeContextUsageSnapshot["categories"][number]): boolean {
  if (category.isDeferred || category.kind === "free" || category.kind === "buffer" || category.kind === "deferred") {
    return false;
  }
  return !(category.id && NOT_FIXED.has(category.id));
}

function rowItems(id: string, snapshot: ClaudeContextUsageSnapshot): ContextBreakdownItem[] | undefined {
  if (id === "mcp_tools") {
    const tools = snapshot.mcpTools.filter((tool) => tool.isLoaded !== false && tool.tokens > 0);
    return tools.length > 0
      ? tools.map((tool) => ({ id: `${tool.serverName}:${tool.name}`, label: tool.name, detail: tool.serverName, tokens: tool.tokens }))
      : undefined;
  }
  if (id === "memory_files") {
    return snapshot.memoryFiles.length > 0
      ? snapshot.memoryFiles.map((file) => ({
          id: file.path,
          label: file.path.split(/[\\/]/).filter(Boolean).at(-1) ?? file.path,
          detail: file.path,
          tokens: file.tokens,
        }))
      : undefined;
  }
  return undefined;
}

/**
 * The fixed rows of a Claude snapshot and the conversation estimate.
 * `usedTokens` is the conversation's latest reported fill.
 */
export function buildClaudeContextBreakdown(
  snapshot: ClaudeContextUsageSnapshot,
  usedTokens: number | undefined,
): ContextBreakdown {
  const known = new Map<FixedCategoryId, number>();
  const unknown: ContextBreakdownRow[] = [];
  for (const category of snapshot.categories) {
    if (!isFixedCategory(category) || category.tokens <= 0) continue;
    if (category.id && category.id in FIXED_CATEGORY_LABELS) {
      const id = category.id as FixedCategoryId;
      known.set(id, (known.get(id) ?? 0) + category.tokens);
    } else if (!category.id) {
      // A category a newer SDK added: shown under its own name, still fixed.
      unknown.push({ id: `sdk:${category.name}`, name: category.name, tokens: category.tokens });
    }
  }
  const rows: ContextBreakdownRow[] = [
    ...FIXED_ORDER.filter((id) => known.has(id)).map((id) => {
      const items = rowItems(id, snapshot);
      return {
        id,
        labelKey: FIXED_CATEGORY_LABELS[id],
        tokens: known.get(id)!,
        ...(items ? { items } : {}),
      };
    }),
    ...unknown,
  ];
  const fixedTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  const conversation =
    usedTokens !== undefined && Number.isFinite(usedTokens) ? usedTokens - fixedTokens : null;
  return {
    rows,
    fixedTokens,
    // Fixed parts larger than the whole reported fill mean the two readings
    // do not describe the same session; no estimate beats a wrong one.
    conversationTokens: conversation !== null && conversation >= 0 ? conversation : null,
  };
}

/* ─── Short cache around the IPC read ─────────────────────────────── */

/** How long one measurement answers repeat opens. */
export const CLAUDE_CONTEXT_USAGE_CACHE_MS = 60_000;
const CACHE_LIMIT = 16;

const cache = new Map<string, { at: number; result: Promise<ClaudeContextUsageResponse> }>();

/**
 * One context-usage read per key at a time, reused for
 * `CLAUDE_CONTEXT_USAGE_CACHE_MS`. A failed read is cached too, so reopening
 * the popover cannot turn into a retry loop against a broken runtime.
 */
export function readClaudeContextUsageCached(
  key: string,
  load: () => Promise<ClaudeContextUsageResponse>,
  now: number = Date.now(),
): Promise<ClaudeContextUsageResponse> {
  const cached = cache.get(key);
  if (cached && now - cached.at < CLAUDE_CONTEXT_USAGE_CACHE_MS) {
    return cached.result;
  }
  const result = load().catch((error: unknown) => ({
    ok: false,
    detail: error instanceof Error ? error.message : String(error),
  }));
  cache.delete(key);
  cache.set(key, { at: now, result });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return result;
}

/** Test seam: forget every cached read. */
export function clearClaudeContextUsageCache(): void {
  cache.clear();
}
