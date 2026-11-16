import { z } from "zod";

export const CONTENT_SEARCH_MAX_OFFSET = 10_000;
export const SEARCH_TASK_CONTENT_IPC = "persistence:search-task-content";
export const SearchTaskContentArgsSchema = z.object({
  statusOnly: z.boolean().optional(),
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(CONTENT_SEARCH_MAX_OFFSET).optional(),
  workspaceId: z.string().min(1).max(200).optional(),
  taskId: z.string().min(1).max(200).optional(),
}).strict();
export type SearchTaskContentArgs = z.infer<typeof SearchTaskContentArgsSchema>;

export const ContentSearchResultSchema = z.object({
  repositoryPath: z.string(), repositoryName: z.string(),
  workspaceId: z.string(), workspaceName: z.string(), workspaceBranch: z.string().nullable(),
  workspacePath: z.string(), isDefaultWorkspace: z.boolean(),
  taskId: z.string(), title: z.string(), provider: z.string(), updatedAt: z.string(),
  state: z.enum(["running", "completed", "failed", "cancelled", "new", "archived"]),
  messageId: z.string(), snippet: z.string(), matchCount: z.number().int().nonnegative(),
  parentTaskId: z.string().nullable(),
  parentWorkspaceId: z.string().nullable().optional(),
  parentRepositoryPath: z.string().nullable().optional(),
}).strict();
export type ContentSearchResult = z.infer<typeof ContentSearchResultSchema>;
export const ContentSearchIndexingSchema = z.object({
  indexed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), complete: z.boolean(),
}).strict();
export const SearchTaskContentResponseSchema = z.discriminatedUnion("ok", [
  z.object({ok: z.literal(true), results: z.array(ContentSearchResultSchema).max(50),
    nextOffset: z.number().int().nonnegative().max(CONTENT_SEARCH_MAX_OFFSET).nullable(), indexing: ContentSearchIndexingSchema,
  }).strict(),
  z.object({ok: z.literal(false), message: z.string()}).strict(),
]);
export type SearchTaskContentResponse = z.infer<typeof SearchTaskContentResponseSchema>;
