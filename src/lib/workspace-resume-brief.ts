import { z } from "zod";

/** Explicit workspace intent is kept apart from an automatically replaced turn summary. */
export const WorkspaceResumeBriefSchema = z
  .object({
    instructions: z.string().max(12000).optional(),
    goal: z.string().max(2000),
    completionCriteria: z.string().max(2000),
    decisions: z.string().max(2000),
    evidence: z.string().max(2000),
    nextAction: z.string().max(2000),
    updatedAt: z.string().datetime(),
    sourceTaskId: z.string().nullable(),
  })
  .strict();

export const WorkspaceResumeBriefDraftSchema =
  WorkspaceResumeBriefSchema.extend({
    updatedAt: z.union([z.literal(""), z.string().datetime()]),
  });

export type WorkspaceResumeBriefDraft = z.infer<
  typeof WorkspaceResumeBriefDraftSchema
>;
export const WorkspaceDirectionDraftScopeSchema = z
  .object({ workspaceId: z.string().trim().min(1).max(1000) })
  .strict();
export const SaveWorkspaceDirectionDraftSchema =
  WorkspaceDirectionDraftScopeSchema.extend({
    draft: WorkspaceResumeBriefDraftSchema.nullable(),
  });
export type WorkspaceResumeBrief = z.infer<typeof WorkspaceResumeBriefSchema>;
export type ResumeBriefFields = Omit<
  WorkspaceResumeBrief,
  "updatedAt" | "sourceTaskId"
>;
export const RESUME_BRIEF_FIELDS = [
  { key: "goal", label: "Goal", hint: "What should this workspace achieve?" },
  {
    key: "completionCriteria",
    label: "Completion conditions",
    hint: "What must be true before this work is complete?",
  },
  {
    key: "decisions",
    label: "Confirmed decisions",
    hint: "Keep agreed choices and constraints here. Leave unconfirmed ideas in Notes.",
  },
  {
    key: "evidence",
    label: "Evidence and plan references",
    hint: "Link the plan, results, checks, and sources that support this work.",
  },
  {
    key: "nextAction",
    label: "Next action",
    hint: "Where should you or the next agent continue?",
  },
] as const;

export function emptyResumeBriefFields(): ResumeBriefFields {
  return {
    goal: "",
    completionCriteria: "",
    decisions: "",
    evidence: "",
    nextAction: "",
  };
}

/** Preserve every legacy field when opening saved content or a local draft. */
export function getWorkspaceInstructions(
  brief?: ResumeBriefFields | null,
): string {
  if (!brief) return "";
  if (brief.instructions !== undefined) return brief.instructions;
  return RESUME_BRIEF_FIELDS.filter(({ key }) => brief[key].trim())
    .map(({ key, label }) => `${label}: ${brief[key]}`)
    .join("\n\n");
}

/** Characters of shared instructions sent verbatim; longer text is abridged in context. */
export const SHARED_INSTRUCTIONS_CONTEXT_LIMIT = 1400;
/** Storage ceiling for shared instructions, matching the schema. */
export const SHARED_INSTRUCTIONS_MAX_LENGTH = 12000;

export function formatResumeBriefContext(brief: WorkspaceResumeBrief) {
  const instructions = getWorkspaceInstructions(brief).trim();
  if (!instructions) return [];
  const limit = SHARED_INSTRUCTIONS_CONTEXT_LIMIT;
  return [
    "Shared workspace instructions (apply across tasks in this workspace):",
    `Updated: ${brief.updatedAt}`,
    instructions.length > limit
      ? `${instructions.slice(0, limit)}… [abridged]`
      : instructions,
    "Read the full shared instructions in Information when abridged. Automatic turn summaries do not replace these instructions.",
  ];
}
