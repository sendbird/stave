import { getIntlLocale, i18n, type AppTFunction, type I18nKey } from "@/i18n";
import type { AssistantTraceEntry } from "./assistant-trace-builder";
import { normalizeTraceToolName } from "./assistant-trace.utils";

/**
 * What a finished turn did, in the words its collapsed header uses: a title
 * that says what happened and one count per kind of work.
 */

export type TraceCategory =
  | "edit"
  | "command"
  | "read"
  | "search"
  | "web"
  | "agent"
  | "change"
  | "tool";

const TOOL_CATEGORY: Record<string, TraceCategory> = {
  bash: "command",
  read: "read",
  write: "edit",
  edit: "edit",
  glob: "search",
  grep: "search",
  search: "search",
  websearch: "web",
  webfetch: "web",
};

export interface TraceCategoryCount {
  category: TraceCategory;
  count: number;
}

/** Counts per kind of work, in the order each kind first appeared. */
export function countTraceCategories(
  entries: readonly AssistantTraceEntry[],
): TraceCategoryCount[] {
  const counts = new Map<TraceCategory, number>();
  const add = (category: TraceCategory, count: number) =>
    counts.set(category, (counts.get(category) ?? 0) + count);
  for (const entry of entries) {
    if (entry.kind === "tool") {
      add(TOOL_CATEGORY[normalizeTraceToolName(entry.part.toolName)] ?? "tool", 1);
    } else if (entry.kind === "subagent") {
      add("agent", 1);
    } else if (entry.kind === "diff") {
      add("change", entry.parts.length);
    }
  }
  return Array.from(counts, ([category, count]) => ({ category, count }));
}

/** The collapsed header's count labels: "1 read", "읽기 1". */
export const TRACE_CATEGORY_COUNT_KEYS = {
  edit: "session:assistantTrace.summaryCount.edit",
  command: "session:assistantTrace.summaryCount.command",
  read: "session:assistantTrace.summaryCount.read",
  search: "session:assistantTrace.summaryCount.search",
  web: "session:assistantTrace.summaryCount.web",
  agent: "session:assistantTrace.summaryCount.agent",
  change: "session:assistantTrace.summaryCount.change",
  tool: "session:assistantTrace.summaryCount.tool",
} as const satisfies Record<TraceCategory, I18nKey>;

/** Clauses for a title built from counts: "edited 1 file", "명령 1개 실행". */
const TRACE_CATEGORY_CLAUSE_KEYS = {
  edit: "session:assistantTrace.turnTitle.edited",
  command: "session:assistantTrace.turnTitle.ranCommands",
  read: "session:assistantTrace.turnTitle.readFiles",
  search: "session:assistantTrace.turnTitle.searched",
  web: "session:assistantTrace.turnTitle.browsed",
  agent: "session:assistantTrace.turnTitle.ranAgents",
  change: "session:assistantTrace.turnTitle.edited",
  tool: "session:assistantTrace.turnTitle.usedTools",
} as const satisfies Record<TraceCategory, I18nKey>;

/** Clause order for a title: what changed first, then what ran, then what was looked at. */
const TITLE_CATEGORY_ORDER: readonly TraceCategory[] = [
  "edit",
  "command",
  "agent",
  "read",
  "search",
  "web",
  "tool",
];

const TITLE_MAX_CLAUSES = 3;
const TITLE_MIN_WORDS = 3;
const TITLE_MAX_LENGTH = 200;
const TITLE_MAX_SENTENCES = 3;

/** Markdown to plain words, for a one-line title. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * The first sentence of a reply that says something on its own, or null.
 *
 * Only the reply's first paragraph is read, and code, headings' markers,
 * quotes and list bullets are dropped. A sentence too short to name the work
 * ("Done.", "Summary:") is skipped for the one after it.
 */
export function extractTurnTitleSentence(text: string): string | null {
  const withoutCode = text.replace(/```[\s\S]*?(```|$)/g, "\n\n");
  const paragraph = withoutCode
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, ""))
        .join(" "),
    )
    .map(toPlainText)
    .find((block) => /[\p{L}\p{N}]/u.test(block));
  if (!paragraph) {
    return null;
  }
  // A terminator ends a sentence only before a space (or the end), so
  // "v1.2", "app.store.ts" and "1.5x" stay whole.
  const sentences = paragraph.split(/(?<=[.!?。！？])\s+/u);
  for (const raw of sentences.slice(0, TITLE_MAX_SENTENCES)) {
    const sentence = raw.trim().replace(/[.。:：]+$/u, "").trim();
    if (countWords(sentence) >= TITLE_MIN_WORDS) {
      return sentence.length > TITLE_MAX_LENGTH
        ? `${sentence.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
        : sentence;
    }
  }
  return null;
}

/** A title built from what the turn did: "Edited 2 files, ran 1 command". */
export function buildCountsTitle(
  counts: readonly TraceCategoryCount[],
  t: AppTFunction = i18n.t,
): string {
  const byCategory = new Map<TraceCategory, number>();
  for (const { category, count } of counts) {
    // A diff is the edit's own result: count the files once, as edits.
    const titleCategory = category === "change" ? "edit" : category;
    byCategory.set(titleCategory, Math.max(byCategory.get(titleCategory) ?? 0, count));
  }
  const clauses = TITLE_CATEGORY_ORDER.flatMap((category) => {
    const count = byCategory.get(category);
    return count ? [t(TRACE_CATEGORY_CLAUSE_KEYS[category], { count })] : [];
  }).slice(0, TITLE_MAX_CLAUSES);
  if (clauses.length === 0) {
    return t("composer:chainOfThought.finished");
  }
  // Clauses, not list items: a comma series without "and" in both languages
  // (Intl's Korean unit list drops the comma and runs the clauses together).
  const title = clauses.join(t("session:assistantTrace.turnTitle.clauseSeparator"));
  return title.charAt(0).toLocaleUpperCase(getIntlLocale()) + title.slice(1);
}

/**
 * A completed turn's header title, from data the turn already has: the first
 * sentence of its reply, or else a summary of the work it counted.
 */
export function buildCompletedTurnTitle(args: {
  responseText: string;
  counts: readonly TraceCategoryCount[];
  t?: AppTFunction;
}): string {
  return extractTurnTitleSentence(args.responseText) ?? buildCountsTitle(args.counts, args.t);
}
