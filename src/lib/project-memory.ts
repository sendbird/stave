import { z } from "zod";

/**
 * Project memory: short, project-scoped facts an agent (or the user) wants
 * every future turn in that project to know. It is deliberately not a chat log
 * and not a replacement for `AGENTS.md` — human-authored rules win on
 * conflict. Rows are scoped by project path and never read across projects.
 */
export const PROJECT_MEMORY_KINDS = [
  "decision",
  "convention",
  "gotcha",
  "fact",
] as const;

export type ProjectMemoryKind = (typeof PROJECT_MEMORY_KINDS)[number];

/** One short sentence. Enforced in the schema and again in the store. */
export const PROJECT_MEMORY_CONTENT_MAX_CHARS = 280;

/** Explicit `stave_remember` writes start here. */
export const PROJECT_MEMORY_EXPLICIT_CONFIDENCE = 0.9;
/** Facts auto-extracted from the turn summary start here. */
export const PROJECT_MEMORY_AUTO_CONFIDENCE = 0.6;

/**
 * Hard cap on the injected block. The cap is enforced in code, not in the
 * prompt: memory must not grow per-turn context no matter how many rows exist.
 */
export const PROJECT_MEMORY_INJECTION_MAX_ITEMS = 20;
export const PROJECT_MEMORY_INJECTION_MAX_CHARS = 2048;

/**
 * Forgetting rule: an item nobody has confirmed for this long, and that never
 * earned high confidence, drops out of injection. It stays listed in the UI.
 */
export const PROJECT_MEMORY_STALE_AFTER_MS = 60 * 24 * 60 * 60 * 1000;
export const PROJECT_MEMORY_STALE_CONFIDENCE_FLOOR = 0.7;

/**
 * Two memories of the same kind whose normalized contents overlap at least
 * this much (trigram Jaccard) are the same memory; a re-write confirms the
 * existing row instead of inserting a near-duplicate.
 */
export const PROJECT_MEMORY_DUPLICATE_SIMILARITY = 0.75;

export interface ProjectMemory {
  id: string;
  projectPath: string;
  kind: ProjectMemoryKind;
  content: string;
  sourceTaskId: string | null;
  sourceTurnId: string | null;
  /** 0–1. */
  confidence: number;
  /** ms epoch. */
  createdAt: number;
  /** ms epoch. */
  lastConfirmedAt: number;
  /** ms epoch. */
  updatedAt: number;
  /** ms epoch; soft delete so re-extraction cannot resurrect the row. */
  deletedAt: number | null;
}

export const ProjectMemoryKindSchema = z.enum(PROJECT_MEMORY_KINDS);

export const ProjectMemoryContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(PROJECT_MEMORY_CONTENT_MAX_CHARS);

export const ProjectMemoryFactInputSchema = z
  .object({
    kind: ProjectMemoryKindSchema,
    content: ProjectMemoryContentSchema,
  })
  .strict();

export type ProjectMemoryFactInput = z.infer<typeof ProjectMemoryFactInputSchema>;

const ProjectPathSchema = z.string().trim().min(1).max(4096);

export const ProjectMemoryListArgsSchema = z
  .object({
    projectPath: ProjectPathSchema,
  })
  .strict();

export const ProjectMemoryRecallArgsSchema = z
  .object({
    projectPath: ProjectPathSchema,
    query: z.string().max(8_000).optional(),
  })
  .strict();

export const ProjectMemoryRememberArgsSchema = z
  .object({
    projectPath: ProjectPathSchema,
    facts: z.array(ProjectMemoryFactInputSchema).min(1).max(8),
    source: z.enum(["explicit", "auto"]),
    sourceTaskId: z.string().min(1).optional(),
    sourceTurnId: z.string().min(1).optional(),
  })
  .strict();

export const ProjectMemoryUpdateArgsSchema = z
  .object({
    id: z.string().min(1),
    kind: ProjectMemoryKindSchema.optional(),
    content: ProjectMemoryContentSchema.optional(),
  })
  .strict();

export const ProjectMemoryDeleteArgsSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export type ProjectMemoryListArgs = z.infer<typeof ProjectMemoryListArgsSchema>;
export type ProjectMemoryRecallArgs = z.infer<
  typeof ProjectMemoryRecallArgsSchema
>;
export type ProjectMemoryRememberArgs = z.infer<
  typeof ProjectMemoryRememberArgsSchema
>;
export type ProjectMemoryUpdateArgs = z.infer<
  typeof ProjectMemoryUpdateArgsSchema
>;
export type ProjectMemoryDeleteArgs = z.infer<
  typeof ProjectMemoryDeleteArgsSchema
>;

export type ProjectMemoryRememberOutcome = "inserted" | "confirmed";

export interface ProjectMemoryRememberResult {
  memory: ProjectMemory;
  outcome: ProjectMemoryRememberOutcome;
}

export function normalizeProjectMemoryContent(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function resolveProjectMemoryConfidence(source: "explicit" | "auto") {
  return source === "explicit"
    ? PROJECT_MEMORY_EXPLICIT_CONFIDENCE
    : PROJECT_MEMORY_AUTO_CONFIDENCE;
}

export function isProjectMemoryStale(args: {
  memory: Pick<ProjectMemory, "confidence" | "lastConfirmedAt">;
  now: number;
}) {
  return (
    args.memory.confidence < PROJECT_MEMORY_STALE_CONFIDENCE_FLOOR &&
    args.now - args.memory.lastConfirmedAt > PROJECT_MEMORY_STALE_AFTER_MS
  );
}

function comparableText(value: string) {
  return normalizeProjectMemoryContent(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function trigrams(value: string) {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }
  return grams;
}

/**
 * Trigram Jaccard similarity of two contents after whitespace, case and
 * punctuation normalization. Identical normalized text scores 1.
 */
export function projectMemorySimilarity(left: string, right: string) {
  return createProjectMemorySimilarityMatcher(left)(right);
}

/**
 * Same score as `projectMemorySimilarity`, with the left side's trigrams
 * computed once so a dedup scan over many candidates stays linear.
 */
export function createProjectMemorySimilarityMatcher(left: string) {
  const a = comparableText(left);
  const leftGrams = a ? trigrams(a) : new Set<string>();
  return (right: string) => {
    const b = comparableText(right);
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }
    const rightGrams = trigrams(b);
    let shared = 0;
    for (const gram of leftGrams) {
      if (rightGrams.has(gram)) {
        shared += 1;
      }
    }
    const union = leftGrams.size + rightGrams.size - shared;
    return union === 0 ? 0 : shared / union;
  };
}

export function isProjectMemoryDuplicate(args: {
  candidate: Pick<ProjectMemory, "kind" | "content">;
  existing: Pick<ProjectMemory, "kind" | "content">;
}) {
  return (
    args.candidate.kind === args.existing.kind &&
    projectMemorySimilarity(args.candidate.content, args.existing.content) >=
      PROJECT_MEMORY_DUPLICATE_SIMILARITY
  );
}

/**
 * Query terms for an FTS lookup: distinct lower-cased tokens of at least three
 * characters (the trigram tokenizer cannot match anything shorter), most
 * informative first by simple length, capped so a long first message does not
 * become a giant MATCH expression.
 */
export function extractProjectMemoryQueryTerms(query: string, maxTerms = 24) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u)) {
    const term = raw.trim();
    if (term.length < 3 || seen.has(term)) {
      continue;
    }
    seen.add(term);
    terms.push(term);
  }
  return terms.sort((a, b) => b.length - a.length).slice(0, maxTerms);
}

export function formatProjectMemoryLine(
  memory: Pick<ProjectMemory, "kind" | "content">,
) {
  return `- (${memory.kind}) ${normalizeProjectMemoryContent(memory.content)}`;
}

/**
 * Apply the injection cap to an already-ordered list. Both bounds hold at the
 * same time: at most `maxItems` rows and at most `maxChars` of rendered lines.
 * Order is preserved, so callers put the rows they most want kept first.
 */
export function capProjectMemoriesForInjection<
  T extends Pick<ProjectMemory, "kind" | "content">,
>(
  memories: readonly T[],
  options: { maxItems?: number; maxChars?: number } = {},
) {
  const maxItems = options.maxItems ?? PROJECT_MEMORY_INJECTION_MAX_ITEMS;
  const maxChars = options.maxChars ?? PROJECT_MEMORY_INJECTION_MAX_CHARS;
  const kept: T[] = [];
  let used = 0;
  for (const memory of memories) {
    if (kept.length >= maxItems) {
      break;
    }
    const lineLength = formatProjectMemoryLine(memory).length + 1;
    if (used + lineLength > maxChars) {
      break;
    }
    kept.push(memory);
    used += lineLength;
  }
  return kept;
}

/**
 * Default injection order: strongest, most recently confirmed first. Stale
 * rows are excluded here and in the store query so both paths agree.
 */
export function orderProjectMemoriesForInjection<T extends ProjectMemory>(
  memories: readonly T[],
  now: number,
) {
  return memories
    .filter(
      (memory) =>
        memory.deletedAt === null && !isProjectMemoryStale({ memory, now }),
    )
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        b.lastConfirmedAt - a.lastConfirmedAt ||
        a.id.localeCompare(b.id),
    );
}
