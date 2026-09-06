import { z } from "zod";

/** Explicit workspace intent is kept apart from an automatically replaced turn summary. */
export const WorkspaceResumeBriefSchema = z
  .object({
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

export function formatResumeBriefContext(brief: WorkspaceResumeBrief) {
  const lines = [
    "Workspace goal and confirmed direction (maintained explicitly; not the latest-turn summary):",
    `Updated: ${brief.updatedAt}`,
  ];
  for (const { key, label } of RESUME_BRIEF_FIELDS) {
    if (!brief[key].trim()) continue;
    const value = brief[key].trim();
    lines.push(
      `${label}: ${value.length > 360 ? `${value.slice(0, 360)}… [abridged]` : value}`,
    );
  }
  lines.push(
    "Read the full Information panel when an abridged condition matters. A new summary does not replace this goal or its completion conditions.",
  );
  return lines;
}
