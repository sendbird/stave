import { z } from "zod";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";

/**
 * A task's handoff record: what anyone (a person, another provider, the same
 * provider after a restart) needs to carry the task on. It is one structured
 * record per task in the app database, edited by the user; Stave fills in
 * facts it recorded and the agent proposes changes only when asked, and both
 * become part of the record only when the user saves them. It is sent to a
 * provider with the conversation excerpt, before it, whenever a provider
 * starts a session for the task or comes back to it.
 */

export const HANDOFF_SECTION_IDS = ["goal", "decisions", "verified", "remaining", "cautions"] as const;
export type HandoffSectionId = (typeof HANDOFF_SECTION_IDS)[number];

export const HANDOFF_AUTHORS = ["user", "agent", "stave"] as const;
export type HandoffAuthor = (typeof HANDOFF_AUTHORS)[number];

/** Each section's text is bounded so the record never crowds out the excerpt. */
export const HANDOFF_SECTION_MAX_CHARS = 2_000;

export const STAVE_HANDOFF_RECORD_SOURCE_ID = "stave:handoff-record";

const HandoffSectionSchema = z
  .object({
    text: z.string().max(HANDOFF_SECTION_MAX_CHARS),
    updatedAt: z.string().min(1).max(64),
    updatedBy: z.enum(HANDOFF_AUTHORS),
  })
  .strict();
export type HandoffSection = z.infer<typeof HandoffSectionSchema>;

export const TaskHandoffRecordSchema = z
  .object({
    version: z.literal(1),
    /** Incremented on every save; a save names the revision it started from. */
    revision: z.number().int().min(0),
    updatedAt: z.string().max(64).nullable(),
    sections: z
      .object({
        goal: HandoffSectionSchema.optional(),
        decisions: HandoffSectionSchema.optional(),
        verified: HandoffSectionSchema.optional(),
        remaining: HandoffSectionSchema.optional(),
        cautions: HandoffSectionSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type TaskHandoffRecord = z.infer<typeof TaskHandoffRecordSchema>;

/** The texts being edited, one per section. */
export type HandoffDraft = Record<HandoffSectionId, string>;
/** Who wrote each section of a draft, for the sections the save changes. */
export type HandoffDraftAuthors = Partial<Record<HandoffSectionId, HandoffAuthor>>;

export function emptyHandoffRecord(): TaskHandoffRecord {
  return { version: 1, revision: 0, updatedAt: null, sections: {} };
}

export function parseTaskHandoffRecord(value: string | null | undefined): TaskHandoffRecord | null {
  if (!value) return null;
  try {
    const parsed = TaskHandoffRecordSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function handoffRecordToDraft(record: TaskHandoffRecord): HandoffDraft {
  return {
    goal: record.sections.goal?.text ?? "",
    decisions: record.sections.decisions?.text ?? "",
    verified: record.sections.verified?.text ?? "",
    remaining: record.sections.remaining?.text ?? "",
    cautions: record.sections.cautions?.text ?? "",
  };
}

export function isHandoffRecordEmpty(record: TaskHandoffRecord | null) {
  return !record || HANDOFF_SECTION_IDS.every((id) => !record.sections[id]?.text.trim());
}

function normalizeSectionText(text: string) {
  return text.replace(/\r\n/g, "\n").trim().slice(0, HANDOFF_SECTION_MAX_CHARS);
}

/**
 * The record a save produces: sections whose text changed take the save's
 * time and their author (the user unless Stave or the agent wrote it and the
 * user accepted it as is); an emptied section is removed; the rest keep their
 * history.
 */
export function applyHandoffDraft(args: {
  record: TaskHandoffRecord;
  draft: HandoffDraft;
  authors?: HandoffDraftAuthors;
  at: string;
}): TaskHandoffRecord {
  const sections: TaskHandoffRecord["sections"] = {};
  let changed = false;
  for (const id of HANDOFF_SECTION_IDS) {
    const current = args.record.sections[id];
    const text = normalizeSectionText(args.draft[id] ?? "");
    if (!text) {
      if (current) changed = true;
      continue;
    }
    if (current && current.text === text) {
      sections[id] = current;
      continue;
    }
    changed = true;
    sections[id] = { text, updatedAt: args.at, updatedBy: args.authors?.[id] ?? "user" };
  }
  if (!changed) return args.record;
  return { version: 1, revision: args.record.revision + 1, updatedAt: args.at, sections };
}

export type HandoffCommitDecision = "save" | "unchanged" | "conflict";

/**
 * What Save should do, the Notes draft contract applied to the record: a
 * draft that equals the saved record has nothing to save; a record that moved
 * since editing began would be overwritten, so the user chooses.
 */
export function resolveHandoffCommit(args: {
  draft: HandoffDraft;
  baseRevision: number;
  current: TaskHandoffRecord;
}): HandoffCommitDecision {
  const saved = handoffRecordToDraft(args.current);
  const same = HANDOFF_SECTION_IDS.every(
    (id) => normalizeSectionText(args.draft[id] ?? "") === saved[id],
  );
  if (same) return "unchanged";
  return args.current.revision !== args.baseRevision ? "conflict" : "save";
}

// i18n-ignore: model-facing section titles of the handoff record
const MODEL_SECTION_TITLES: Record<HandoffSectionId, string> = {
  goal: "Goal",
  decisions: "Approved decisions and constraints",
  verified: "Verified results",
  remaining: "Remaining work",
  cautions: "Cautions",
};

/** The record as the provider reads it, or null when there is nothing in it. */
export function buildHandoffRecordContextPart(record: TaskHandoffRecord | null): CanonicalRetrievedContextPart | null {
  if (!record || isHandoffRecordEmpty(record)) return null;
  const blocks = HANDOFF_SECTION_IDS.flatMap((id) => {
    const section = record.sections[id];
    if (!section?.text.trim()) return [];
    return [`${MODEL_SECTION_TITLES[id]} (updated ${section.updatedAt} by ${section.updatedBy}):\n${section.text}`];
  });
  return {
    type: "retrieved_context",
    sourceId: STAVE_HANDOFF_RECORD_SOURCE_ID,
    // i18n-ignore: model-facing context title, sent to the provider as-is
    title: "Task handoff record",
    content: [
      // i18n-ignore: model-facing instruction, sent to the provider as-is
      "The user keeps this record for this task; Stave or an agent changes it only when the user accepts. Where it disagrees with the conversation excerpt, follow the record and mention the disagreement.",
      ...blocks,
    ].join("\n\n"),
  };
}

/** Facts Stave recorded that can be offered for the record, by section. */
export interface HandoffFacts {
  checks: { status: "pass" | "warn" | "fail"; passed: number; total: number; failures: ReadonlyArray<{ scriptId: string; message: string; blocking: boolean }> } | null;
  approvals: ReadonlyArray<{ tool: string; description: string }>;
  planFilePaths: readonly string[];
}

/** One line per fact, worded for the record. The user reads and accepts them. */
export function buildHandoffSuggestions(facts: HandoffFacts, words: {
  checksPassed: (passed: number, total: number) => string;
  checksFailed: (failures: string) => string;
  approval: (tool: string, description: string) => string;
  plan: (path: string) => string;
}): Partial<HandoffDraft> {
  const suggestions: Partial<HandoffDraft> = {};
  if (facts.checks) {
    if (facts.checks.status === "pass") {
      suggestions.verified = `- ${words.checksPassed(facts.checks.passed, facts.checks.total)}`;
    } else {
      const failures = facts.checks.failures
        .map((failure) => `${failure.scriptId}${failure.message ? `: ${failure.message}` : ""}`)
        .join("; ");
      suggestions.cautions = `- ${words.checksFailed(failures)}`;
    }
  }
  if (facts.approvals.length > 0) {
    suggestions.decisions = facts.approvals
      .slice(-5)
      .map((approval) => `- ${words.approval(approval.tool, approval.description)}`)
      .join("\n");
  }
  if (facts.planFilePaths.length > 0) {
    suggestions.remaining = facts.planFilePaths.map((path) => `- ${words.plan(path)}`).join("\n");
  }
  return suggestions;
}

/**
 * Merge suggestions into a draft: lines a section does not already contain
 * are appended. Returns the sections that changed, so their author is Stave
 * unless the user edits them before saving.
 */
export function mergeHandoffSuggestions(draft: HandoffDraft, suggestions: Partial<HandoffDraft>) {
  const next = { ...draft };
  const changed: HandoffSectionId[] = [];
  for (const id of HANDOFF_SECTION_IDS) {
    const lines = (suggestions[id] ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    const existing = new Set(next[id].split("\n").map((line) => line.trim()));
    const added = lines.filter((line) => !existing.has(line));
    if (added.length === 0) continue;
    next[id] = [next[id].trim(), ...added].filter(Boolean).join("\n");
    changed.push(id);
  }
  return { draft: next, changed };
}

/** The fenced block an agent answers with when asked to update the record. */
export const HANDOFF_PROPOSAL_FENCE = "stave-handoff";

/** The request sent to the agent. Model-facing, so it is not translated. */
export function buildHandoffUpdateRequest(record: TaskHandoffRecord | null) {
  const current = record && !isHandoffRecordEmpty(record)
    ? JSON.stringify(handoffRecordToDraft(record), null, 2)
    : "{}";
  return [
    // i18n-ignore: model-facing request; the user sends it to the task's agent
    "Please propose an updated handoff record for this task, for someone who picks it up without this conversation.",
    "Keep what is still true, add what this task has since decided, verified or left to do, and remove what is no longer true. Do not change any files for this.",
    `Reply with one fenced \`${HANDOFF_PROPOSAL_FENCE}\` block holding a JSON object with the string fields goal, decisions, verified, remaining and cautions (use "- " lines for lists, at most ${HANDOFF_SECTION_MAX_CHARS} characters each). I will review it before it is saved.`,
    "The current record:",
    `\`\`\`json\n${current}\n\`\`\``,
  ].join("\n\n");
}

const PROPOSAL_RE = new RegExp("```" + HANDOFF_PROPOSAL_FENCE + "\\s*\\n([\\s\\S]*?)\\n```", "g");

/** The last proposal in an agent reply, or null when it has none that parses. */
export function parseHandoffProposal(text: string): Partial<HandoffDraft> | null {
  let last: string | null = null;
  for (const match of text.matchAll(PROPOSAL_RE)) {
    last = match[1] ?? null;
  }
  if (!last) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(last);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const proposal: Partial<HandoffDraft> = {};
  for (const id of HANDOFF_SECTION_IDS) {
    const value = (raw as Record<string, unknown>)[id];
    if (typeof value === "string") proposal[id] = normalizeSectionText(value);
  }
  return Object.keys(proposal).length > 0 ? proposal : null;
}
