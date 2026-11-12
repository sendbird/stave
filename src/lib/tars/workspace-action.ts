import { z } from "zod";

const Id = z.string().trim().min(1).max(256);
const Text = z.string().trim().min(1).max(2_000);
const ResourceKind = z.enum(["jira", "crane", "confluence", "figma", "storybook", "pull_request", "amplify", "slack"]);
const base = { kind: z.literal("workspace"), workspaceId: Id };
const value = z.union([z.string().max(8_000), z.number().finite(), z.boolean(), z.null()]);

/** Local Information panel edits only; paths and arbitrary commands are never accepted. */
export const TarsWorkspaceActionSchema = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("appendNotes"), text: z.string().trim().min(1).max(32_000) }).strict(),
  z.object({ ...base, operation: z.literal("replaceNotes"), notes: z.string().max(32_000) }).strict(),
  z.object({ ...base, operation: z.literal("addTodo"), text: Text }).strict(),
  z.object({ ...base, operation: z.literal("updateTodo"), todoId: Id, text: Text.optional(),
    status: z.enum(["pending", "in_progress", "completed"]).optional() }).strict().refine(action => action.text !== undefined || action.status !== undefined),
  z.object({ ...base, operation: z.literal("removeTodo"), todoId: Id }).strict(),
  z.object({ ...base, operation: z.literal("setField"), fieldId: Id, value }).strict(),
  z.object({ ...base, operation: z.literal("removeField"), fieldId: Id }).strict(),
  z.object({ ...base, operation: z.literal("addResource"), resourceKind: ResourceKind,
    url: z.url().max(2_000).refine(url => /^https?:\/\//i.test(url)), title: z.string().trim().min(1).max(500).optional(),
    note: z.string().max(2_000).optional() }).strict(),
  z.object({ ...base, operation: z.literal("removeResource"), resourceKind: ResourceKind, resourceId: Id }).strict(),
]);
export type TarsWorkspaceAction = z.infer<typeof TarsWorkspaceActionSchema>;

/** Host snapshots are bounded before the edit; no inverse is inferred from model text. */
export const TarsWorkspaceUndoSchema = z.object({
  kind: z.literal("workspace"), workspaceName: z.string().min(1).max(256), repositoryPath: z.string().min(1).max(4_096),
  before: z.string().max(2_000_000), after: z.string().max(2_000_000), undoneAt: z.iso.datetime().optional(),
}).strict();

export function tarsWorkspaceRecordId(messageId: string, actionIndex: number) {
  return `workspace:${messageId}:${actionIndex}`;
}
