import { z } from "zod";
import {
  ProjectMemoryKindSchema,
  PROJECT_MEMORY_KINDS,
} from "./project-memory";

export const DEFAULT_MEMORY_COLLECTION_TEMPLATE = [
  "Remember reusable project knowledge that prevents repeated mistakes.",
  "Prioritize explicit user corrections, lasting decisions with their rationale, and verified non-obvious pitfalls.",
  "State when the knowledge applies and why it matters in one short sentence.",
  "Exclude completion logs, temporary status, unchanged settings, code inventories, detailed styling values, and facts easily read from repository files.",
  "Return no candidate when the evidence is uncertain.",
].join("\n");

export const ProjectMemorySettingsPatchSchema = z
  .object({
    useMemory: z.boolean().optional(),
    collectAutomatically: z.boolean().optional(),
    kinds: z.array(ProjectMemoryKindSchema).max(4).optional(),
    collectionTemplate: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
export type ProjectMemorySettingsPatch = z.infer<
  typeof ProjectMemorySettingsPatchSchema
>;

export interface ProjectMemorySettings {
  useMemory: boolean;
  collectAutomatically: boolean;
  kinds: Array<z.infer<typeof ProjectMemoryKindSchema>>;
  collectionTemplate: string;
  revision: number;
  resetBefore: number;
}

export const DEFAULT_PROJECT_MEMORY_SETTINGS: ProjectMemorySettings = {
  useMemory: true,
  collectAutomatically: true,
  kinds: [...PROJECT_MEMORY_KINDS],
  collectionTemplate: DEFAULT_MEMORY_COLLECTION_TEMPLATE,
  revision: 0,
  resetBefore: 0,
};

export const ProjectMemorySettingsArgsSchema = z
  .object({
    projectPath: z.string().trim().min(1).max(4096),
  })
  .strict();
export const ProjectMemorySaveSettingsArgsSchema =
  ProjectMemorySettingsArgsSchema.extend({
    patch: ProjectMemorySettingsPatchSchema,
    expectedRevision: z.number().int().nonnegative(),
  }).strict();
export const ProjectMemoryClearArgsSchema =
  ProjectMemorySettingsArgsSchema.extend({
    scope: z.enum(["candidates", "all"]),
  }).strict();

export interface ProjectMemorySettingsResult {
  ok: boolean;
  settings?: ProjectMemorySettings;
  message?: string;
}
export interface ProjectMemoryControlsApi {
  getSettings: (
    args: z.infer<typeof ProjectMemorySettingsArgsSchema>,
  ) => Promise<ProjectMemorySettingsResult>;
  saveSettings: (
    args: z.infer<typeof ProjectMemorySaveSettingsArgsSchema>,
  ) => Promise<ProjectMemorySettingsResult>;
  clear: (
    args: z.infer<typeof ProjectMemoryClearArgsSchema>,
  ) => Promise<{ ok: boolean; deleted?: number; message?: string }>;
}

export function buildMemoryCollectionInstruction(
  settings: ProjectMemorySettings | null,
) {
  if (!settings?.collectAutomatically || settings.kinds.length === 0) {
    return "Project memory collection is disabled. Return durableFacts: [] regardless of earlier summary instructions.";
  }
  return [
    "Project memory collection policy (replaces earlier durableFacts guidance only):",
    settings.collectionTemplate,
    `Allowed kinds: ${settings.kinds.join(", ")}.`,
    "Return at most one candidate in durableFacts using {kind, content}. Content must be under 200 characters. Candidates require separate curation; never include credentials or secrets.",
  ].join("\n");
}
