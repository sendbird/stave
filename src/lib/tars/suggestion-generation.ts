import { z } from "zod";
import { TARS_EXECUTION_PROVIDERS } from "./conversation";
import type { TarsSuggestion, TarsSuggestionKind } from "./suggestions";

/**
 * Suggested requests are written by Tars's saved reasoning model, not by a
 * template. The window sends what it observed now (`buildTarsSuggestions`'s
 * facts); main asks the saved provider and model for chips in one read-only,
 * tool-less turn and returns only what the model wrote, validated here. A
 * failure or an empty answer is said as such; nothing is made up in its place.
 */

const IdSchema = z.string().trim().min(1).max(256);
/** A chip row stays short: more choices would read as a menu, not a nudge. */
export const TARS_SUGGESTIONS_MAX = 4;
/** A chip stays one short line. */
export const TARS_SUGGESTION_LABEL_MAX = 80;
/** The words a chip puts in the message box: one or two sentences. */
export const TARS_SUGGESTION_PROMPT_MAX = 400;
const FACT_TITLE_MAX = 300;

const TARS_SUGGESTION_KINDS = ["needsYou", "followUp", "blocked", "resume", "startNow", "startQueued", "publish", "report", "finishedToday", "progress"] as const satisfies readonly TarsSuggestionKind[];

/** One thing Stave observed about the work now: the model's only source for a suggestion. */
export const TarsSuggestionFactSchema = z.object({
  kind: z.enum(TARS_SUGGESTION_KINDS),
  /** The work's full title; null for a fact about several pieces of work. */
  title: z.string().max(FACT_TITLE_MAX).nullable(),
  count: z.number().int().min(0).max(100_000),
}).strict();
export type TarsSuggestionFact = z.infer<typeof TarsSuggestionFactSchema>;

/** The language the chips are written in: the interface's. */
export const TarsSuggestionLanguageSchema = z.enum(["en", "ko"]);
export type TarsSuggestionLanguage = z.infer<typeof TarsSuggestionLanguageSchema>;

export const TarsSuggestInputSchema = z.object({
  /** Names one generation; the reply carries it back so a window can drop an answer it no longer waits for. */
  requestId: IdSchema,
  language: TarsSuggestionLanguageSchema,
  facts: z.array(TarsSuggestionFactSchema).min(1).max(TARS_SUGGESTIONS_MAX),
}).strict();
export type TarsSuggestInput = z.infer<typeof TarsSuggestInputSchema>;

/** One suggestion as the model wrote it. */
export const TarsGeneratedSuggestionSchema = z.object({
  label: z.string().trim().min(1).max(TARS_SUGGESTION_LABEL_MAX),
  prompt: z.string().trim().min(1).max(TARS_SUGGESTION_PROMPT_MAX),
}).strict();
export type TarsGeneratedSuggestion = z.infer<typeof TarsGeneratedSuggestionSchema>;

/**
 * Why no chips were written:
 * - `noSettings`: Tars's reasoning model was never saved (the first message saves it);
 * - `provider`: the model call was refused, failed, timed out or was cut short;
 * - `invalidOutput`: the model answered, but not in the requested shape.
 */
export const TarsSuggestFailureSchema = z.enum(["noSettings", "provider", "invalidOutput"]);
export type TarsSuggestFailure = z.infer<typeof TarsSuggestFailureSchema>;

export const TarsSuggestResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("generated"),
    requestId: IdSchema,
    /** Who wrote them: the saved reasoning choice at the time of the call. */
    providerId: z.enum(TARS_EXECUTION_PROVIDERS),
    model: z.string().trim().min(1).max(200),
    /** Possibly empty: the model found nothing worth suggesting. */
    suggestions: z.array(TarsGeneratedSuggestionSchema).max(TARS_SUGGESTIONS_MAX),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    requestId: IdSchema,
    reason: TarsSuggestFailureSchema,
  }).strict(),
]);
export type TarsSuggestResult = z.infer<typeof TarsSuggestResultSchema>;

/** The facts a set of rule-selected suggestions describes, for the model. */
export function tarsSuggestionFacts(suggestions: readonly TarsSuggestion[]): TarsSuggestionFact[] {
  return suggestions.map((entry) => ({ kind: entry.kind, title: entry.fullTitle?.slice(0, FACT_TITLE_MAX) ?? null, count: entry.count }));
}

/**
 * Identifies what a generation is about: the same facts in the same language
 * ask the same question, so the window does not ask again. A revision of the
 * same work does not change it; a different kind, title or count does.
 */
export function tarsSuggestionFactsKey(facts: readonly TarsSuggestionFact[], language: TarsSuggestionLanguage) {
  return JSON.stringify([language, facts.map((fact) => [fact.kind, fact.title, fact.count])]);
}

const FACT_MEANING: Record<TarsSuggestionKind, string> = {
  needsYou: "`count` pieces of work wait on the user (a decision, an answer or a review).",
  followUp: "Tars just delegated this work in its last reply; it is under way.",
  blocked: "This work is blocked and stopped.",
  resume: "This work is paused.",
  startNow: "This work is queued and has not started.",
  startQueued: "`count` pieces of work are queued and have not started.",
  publish: "This work completed in the last day and can be opened as a draft pull request.",
  report: "This work completed in the last day and has a report.",
  finishedToday: "`count` pieces of work completed in the last day.",
  progress: "This work is running now.",
};

/** The model-facing request. English, whatever the interface language; the chips are asked for in that language. */
export function buildTarsSuggestionPrompt(input: Pick<TarsSuggestInput, "facts" | "language">): string {
  // i18n-ignore: model-facing prompt, not user-facing copy
  const language = input.language === "ko" ? "Korean (polite, natural; keep work titles as given)" : "English";
  const facts = input.facts.map((fact) => ({ ...fact, meaning: FACT_MEANING[fact.kind] }));
  return [
    "You write suggested requests for Tars, the user's personal work representative in the Stave app.",
    "A suggestion is a chip above the message box. Pressing it only fills the message box; the user reads it and sends it to Tars.",
    "Write each suggestion as the user speaking to Tars: a question about the work or a request Tars can act on.",
    "Use only the facts below, observed by Stave just now. Do not invent work, titles, numbers, states or results.",
    "Name the work by its title. Order the suggestions most useful first. Write at most one suggestion per fact.",
    `Write at most ${TARS_SUGGESTIONS_MAX} suggestions. Return an empty list when none would help.`,
    `\`label\`: the chip text, at most 40 characters, no trailing period. \`prompt\`: the message it puts in the box, one or two sentences, at most ${TARS_SUGGESTION_PROMPT_MAX} characters.`,
    `Write both in ${language}.`,
    "Answer with JSON only, no prose and no code fence, exactly in this shape:",
    '{"suggestions":[{"label":"...","prompt":"..."}]}',
    "",
    "Facts:",
    JSON.stringify(facts, null, 2),
  ].join("\n");
}

/**
 * The model's chips, or null when its answer is not the requested shape. An
 * answer with more chips than asked, or one chip out of bounds, is invalid as a
 * whole: a partial list would show something the model did not quite say.
 */
export function parseTarsSuggestionOutput(text: string): TarsGeneratedSuggestion[] | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  const parsed = z.object({ suggestions: z.array(TarsGeneratedSuggestionSchema).max(TARS_SUGGESTIONS_MAX) }).strict().safeParse(value);
  if (!parsed.success) return null;
  // The same words twice would be two chips that do one thing.
  const seen = new Set<string>();
  return parsed.data.suggestions.filter((entry) => !seen.has(entry.prompt) && Boolean(seen.add(entry.prompt)));
}
