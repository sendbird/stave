import { z } from "zod";
import {
  RepositoryMemoryKindSchema,
  REPOSITORY_MEMORY_KINDS,
} from "./project-memory";

export const DEFAULT_MEMORY_COLLECTION_TEMPLATE = [
  "Remember reusable repository knowledge that prevents repeated mistakes.",
  "Prioritize explicit user corrections, lasting decisions with their rationale, and verified non-obvious pitfalls.",
  "State when the knowledge applies and why it matters in one short sentence.",
  "Exclude completion logs, temporary status, unchanged settings, code inventories, detailed styling values, and facts easily read from repository files.",
  "Return no candidate when the evidence is uncertain.",
].join("\n");

export const RepositoryMemorySettingsPatchSchema = z
  .object({
    useMemory: z.boolean().optional(),
    collectAutomatically: z.boolean().optional(),
    kinds: z.array(RepositoryMemoryKindSchema).max(4).optional(),
    collectionTemplate: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
export type RepositoryMemorySettingsPatch = z.infer<
  typeof RepositoryMemorySettingsPatchSchema
>;

export interface RepositoryMemorySettings {
  useMemory: boolean;
  collectAutomatically: boolean;
  kinds: Array<z.infer<typeof RepositoryMemoryKindSchema>>;
  collectionTemplate: string;
  revision: number;
  resetBefore: number;
}

export const DEFAULT_REPOSITORY_MEMORY_SETTINGS: RepositoryMemorySettings = {
  useMemory: true,
  collectAutomatically: false,
  kinds: [...REPOSITORY_MEMORY_KINDS],
  collectionTemplate: DEFAULT_MEMORY_COLLECTION_TEMPLATE,
  revision: 0,
  resetBefore: 0,
};

export const RepositoryMemorySettingsArgsSchema = z
  .object({
    repositoryPath: z.string().trim().min(1).max(4096),
  })
  .strict();
export const RepositoryMemorySaveSettingsArgsSchema =
  RepositoryMemorySettingsArgsSchema.extend({
    patch: RepositoryMemorySettingsPatchSchema,
    expectedRevision: z.number().int().nonnegative(),
  }).strict();
export const RepositoryMemoryClearArgsSchema =
  RepositoryMemorySettingsArgsSchema.extend({
    scope: z.enum(["candidates", "all"]),
  }).strict();

export interface RepositoryMemorySettingsResult {
  ok: boolean;
  settings?: RepositoryMemorySettings;
  message?: string;
}
export interface RepositoryMemoryControlsApi {
  getSettings: (
    args: z.infer<typeof RepositoryMemorySettingsArgsSchema>,
  ) => Promise<RepositoryMemorySettingsResult>;
  saveSettings: (
    args: z.infer<typeof RepositoryMemorySaveSettingsArgsSchema>,
  ) => Promise<RepositoryMemorySettingsResult>;
  clear: (
    args: z.infer<typeof RepositoryMemoryClearArgsSchema>,
  ) => Promise<{ ok: boolean; deleted?: number; message?: string }>;
}

export function buildMemoryCollectionInstruction(
  settings: RepositoryMemorySettings | null,
) {
  if (!settings?.collectAutomatically || settings.kinds.length === 0) {
    return "Repository memory collection is disabled. Return durableFacts: [] regardless of earlier summary instructions.";
  }
  return [
    "Repository memory collection policy (replaces earlier durableFacts guidance only):",
    settings.collectionTemplate,
    `Allowed kinds: ${settings.kinds.join(", ")}.`,
    "Return at most one candidate in durableFacts using {kind, content}. Content must be under 200 characters. Candidates require separate curation; never include credentials or secrets.",
  ].join("\n");
}
