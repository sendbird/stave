import type { ChatMessage } from "@/types/chat";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import { resolveWorkspaceTodoStatus } from "@/lib/workspace-information";

/**
 * Optional reference material for prompt enhancement. Every field is included
 * only when the source exists, and every field is capped, so the cheap utility
 * lane pays for context only when the user has some. The rewrite model treats
 * these blocks as material for resolving references — never as instructions.
 */
export interface PromptEnhancementHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type PromptEnhancementExemplarOutcome = "kept" | "undone";

/**
 * How far a rewrite may go. `clarify` restates the draft as clear instructions
 * and adds no steps. `sharpen` keeps the scope but deepens the method: it names
 * the problem precisely, says what first-hand material to start from and what
 * independent check proves the result, and separates choices an experiment can
 * settle from choices only the user can make.
 */
export const PROMPT_ENHANCEMENT_DEPTHS = ["clarify", "sharpen"] as const;
export type PromptEnhancementDepth = (typeof PROMPT_ENHANCEMENT_DEPTHS)[number];
export const DEFAULT_PROMPT_ENHANCEMENT_DEPTH: PromptEnhancementDepth = "clarify";

export function normalizePromptEnhancementDepth(
  value: unknown,
): PromptEnhancementDepth {
  return PROMPT_ENHANCEMENT_DEPTHS.includes(value as PromptEnhancementDepth)
    ? (value as PromptEnhancementDepth)
    : DEFAULT_PROMPT_ENHANCEMENT_DEPTH;
}

/** One past rewrite and what the user did with it. */
export interface PromptEnhancementExemplar {
  source: string;
  enhanced: string;
  outcome: PromptEnhancementExemplarOutcome;
  at: string;
  /**
   * Depth the rewrite was made at. Absent means `clarify`, so rewrites stored
   * before depths existed keep teaching the depth they were made at.
   */
  depth?: PromptEnhancementDepth;
}

export interface PromptEnhancementContext {
  /** Rewrite depth; absent means `clarify`. Not reference material. */
  depth?: PromptEnhancementDepth;
  /** Recent turns of the task the draft continues. */
  history?: PromptEnhancementHistoryMessage[];
  /** Compact Information-panel digest: notes, open todos, linked issue titles. */
  workspaceSummary?: string;
  /** Host-read excerpt of the repo's AGENTS.md / CLAUDE.md. */
  repoGuidance?: string;
  /** The user's own description of how they like prompts written. */
  styleProfile?: string;
  /** Past rewrites the user kept or undid. */
  exemplars?: PromptEnhancementExemplar[];
}

// Reference material is character-capped, including 3,000 characters of
// Clarify examples or 6,000 characters of Sharpen examples before markup.
export const PROMPT_ENHANCEMENT_HISTORY_MESSAGES = 6;
export const PROMPT_ENHANCEMENT_HISTORY_MESSAGE_CHARS = 300;
export const PROMPT_ENHANCEMENT_WORKSPACE_SUMMARY_CHARS = 1_200;
export const PROMPT_ENHANCEMENT_REPO_GUIDANCE_CHARS = 1_500;
export const PROMPT_ENHANCEMENT_STYLE_PROFILE_CHARS = 800;
export const PROMPT_ENHANCEMENT_EXEMPLAR_TEXT_CHARS = 300;
const SHARPEN_EXEMPLAR_REWRITE_CHARS = 900;
/** Ring-buffer size of remembered rewrites. */
export const PROMPT_ENHANCEMENT_EXEMPLAR_MEMORY = 12;
export const PROMPT_ENHANCEMENT_KEPT_EXEMPLARS = 3;
export const PROMPT_ENHANCEMENT_UNDONE_EXEMPLARS = 2;

function clip(text: string, max: number) {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function clipSharpenRewrite(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= SHARPEN_EXEMPLAR_REWRITE_CHARS) return trimmed;
  // Keep the goal at the start and the verification instructions at the end.
  const openingChars = Math.floor(SHARPEN_EXEMPLAR_REWRITE_CHARS / 2);
  const closingChars = SHARPEN_EXEMPLAR_REWRITE_CHARS - openingChars - 1;
  return `${trimmed.slice(0, openingChars)}…${trimmed.slice(-closingChars)}`;
}

export function buildPromptEnhancementHistory(
  messages: readonly ChatMessage[] | undefined,
): PromptEnhancementHistoryMessage[] | undefined {
  if (!messages?.length) {
    return undefined;
  }
  const history: PromptEnhancementHistoryMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (message.role === "user" && message.providerId !== "user") continue;
    const content = message.content?.trim();
    if (!content) continue;
    history.unshift({
      role: message.role,
      content: clip(content, PROMPT_ENHANCEMENT_HISTORY_MESSAGE_CHARS),
    });
    if (history.length >= PROMPT_ENHANCEMENT_HISTORY_MESSAGES) break;
  }
  return history.length > 0 ? history : undefined;
}

export function buildPromptEnhancementWorkspaceSummary(
  info: WorkspaceInformationState | null | undefined,
): string | undefined {
  if (!info) {
    return undefined;
  }
  const lines: string[] = [];
  const notes = info.notes?.trim();
  if (notes) {
    lines.push(`Notes: ${clip(notes, 600)}`);
  }
  const openTodos = (info.todos ?? []).filter(
    (todo) => resolveWorkspaceTodoStatus(todo) !== "completed",
  );
  if (openTodos.length > 0) {
    lines.push(
      `Open todos: ${openTodos
        .slice(0, 6)
        .map((todo) => clip(todo.text, 80))
        .join("; ")}`,
    );
  }
  const issues = [
    ...(info.jiraIssues ?? []).map((issue) => `${issue.issueKey} ${issue.title}`),
    ...(info.craneIssues ?? []).map(
      (issue) => `${issue.issueKey} ${issue.title}`,
    ),
  ]
    .map((line) => clip(line, 100))
    .filter(Boolean)
    .slice(0, 4);
  if (issues.length > 0) {
    lines.push(`Linked issues: ${issues.join("; ")}`);
  }
  if (lines.length === 0) {
    return undefined;
  }
  return clip(lines.join("\n"), PROMPT_ENHANCEMENT_WORKSPACE_SUMMARY_CHARS);
}

export function normalizePromptEnhancementStyleProfile(value: unknown) {
  return typeof value === "string"
    ? value.slice(0, PROMPT_ENHANCEMENT_STYLE_PROFILE_CHARS * 2)
    : "";
}

export function normalizePromptEnhancementExemplars(
  value: unknown,
): PromptEnhancementExemplar[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const exemplars: PromptEnhancementExemplar[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.source !== "string" ||
      typeof entry.enhanced !== "string" ||
      (entry.outcome !== "kept" && entry.outcome !== "undone")
    ) {
      continue;
    }
    if (!entry.source.trim() || !entry.enhanced.trim()) continue;
    exemplars.push({
      source: entry.source,
      enhanced: entry.enhanced,
      outcome: entry.outcome,
      at: typeof entry.at === "string" ? entry.at : new Date(0).toISOString(),
      ...(entry.depth === "sharpen" ? { depth: "sharpen" as const } : {}),
    });
  }
  return exemplars.slice(-PROMPT_ENHANCEMENT_EXEMPLAR_MEMORY);
}

/**
 * Append one rewrite outcome. A later outcome for the same source at the same
 * depth (Undo after the reveal marked it kept) replaces the earlier entry
 * instead of adding a contradicting one.
 */
export function recordPromptEnhancementExemplar(
  exemplars: readonly PromptEnhancementExemplar[],
  entry: Omit<PromptEnhancementExemplar, "at"> & { at?: string },
): PromptEnhancementExemplar[] {
  const source = entry.source.trim();
  const enhanced = entry.enhanced.trim();
  if (!source || !enhanced || source === enhanced) {
    return [...exemplars];
  }
  const depth = normalizePromptEnhancementDepth(entry.depth);
  const next = exemplars.filter(
    (exemplar) =>
      exemplar.source.trim() !== source ||
      normalizePromptEnhancementDepth(exemplar.depth) !== depth,
  );
  next.push({
    source,
    enhanced,
    outcome: entry.outcome,
    at: entry.at ?? new Date().toISOString(),
    ...(depth === "sharpen" ? { depth } : {}),
  });
  return next.slice(-PROMPT_ENHANCEMENT_EXEMPLAR_MEMORY);
}

/**
 * Most recent kept and undone rewrites made at `depth`, clipped for the
 * prompt. A short clarify rewrite the user kept would otherwise teach a
 * sharpen request to stay short, and the reverse.
 */
export function selectPromptEnhancementExemplars(
  exemplars: readonly PromptEnhancementExemplar[] | undefined,
  depth: PromptEnhancementDepth = DEFAULT_PROMPT_ENHANCEMENT_DEPTH,
): PromptEnhancementExemplar[] | undefined {
  if (!exemplars?.length) {
    return undefined;
  }
  const pick = (outcome: PromptEnhancementExemplarOutcome, limit: number) =>
    exemplars
      .filter(
        (exemplar) =>
          exemplar.outcome === outcome &&
          normalizePromptEnhancementDepth(exemplar.depth) === depth,
      )
      .slice(-limit)
      .map((exemplar) => ({
        ...exemplar,
        source: clip(exemplar.source, PROMPT_ENHANCEMENT_EXEMPLAR_TEXT_CHARS),
        enhanced:
          depth === "sharpen"
            ? clipSharpenRewrite(exemplar.enhanced)
            : clip(exemplar.enhanced, PROMPT_ENHANCEMENT_EXEMPLAR_TEXT_CHARS),
      }));
  const selected = [
    ...pick("kept", PROMPT_ENHANCEMENT_KEPT_EXEMPLARS),
    ...pick("undone", PROMPT_ENHANCEMENT_UNDONE_EXEMPLARS),
  ];
  return selected.length > 0 ? selected : undefined;
}

/**
 * Renders the optional blocks appended to the enhancement instruction. Each
 * block is wrapped in its own tag so instruction-like text inside notes or
 * history stays content.
 */
export function renderPromptEnhancementContextBlocks(
  context: PromptEnhancementContext,
): string[] {
  const blocks: string[] = [];
  if (context.styleProfile?.trim()) {
    blocks.push(
      "<style_profile>",
      clip(context.styleProfile, PROMPT_ENHANCEMENT_STYLE_PROFILE_CHARS),
      "</style_profile>",
      "",
    );
  }
  if (context.repoGuidance?.trim()) {
    blocks.push(
      "<repo_guidance>",
      clip(context.repoGuidance, PROMPT_ENHANCEMENT_REPO_GUIDANCE_CHARS),
      "</repo_guidance>",
      "",
    );
  }
  if (context.workspaceSummary?.trim()) {
    blocks.push(
      "<workspace>",
      clip(context.workspaceSummary, PROMPT_ENHANCEMENT_WORKSPACE_SUMMARY_CHARS),
      "</workspace>",
      "",
    );
  }
  const history = (context.history ?? [])
    .filter((message) => message.content.trim())
    .slice(-PROMPT_ENHANCEMENT_HISTORY_MESSAGES);
  if (history.length > 0) {
    blocks.push(
      "<conversation>",
      ...history.map(
        (message) =>
          `${message.role === "user" ? "User" : "Assistant"}: ${clip(message.content, PROMPT_ENHANCEMENT_HISTORY_MESSAGE_CHARS)}`,
      ),
      "</conversation>",
      "",
    );
  }
  const exemplars =
    selectPromptEnhancementExemplars(
      context.exemplars,
      normalizePromptEnhancementDepth(context.depth),
    ) ?? [];
  const kept = exemplars.filter((exemplar) => exemplar.outcome === "kept");
  const undone = exemplars.filter((exemplar) => exemplar.outcome === "undone");
  if (kept.length > 0) {
    blocks.push(
      "<kept_rewrites>",
      ...kept.flatMap((exemplar) => [
        `<draft>${exemplar.source}</draft>`,
        `<rewrite>${exemplar.enhanced}</rewrite>`,
      ]),
      "</kept_rewrites>",
      "",
    );
  }
  if (undone.length > 0) {
    blocks.push(
      "<undone_rewrites>",
      ...undone.flatMap((exemplar) => [
        `<draft>${exemplar.source}</draft>`,
        `<rewrite>${exemplar.enhanced}</rewrite>`,
      ]),
      "</undone_rewrites>",
      "",
    );
  }
  return blocks;
}
