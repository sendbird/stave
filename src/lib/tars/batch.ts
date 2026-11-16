import { z } from "zod";

const Id = z.string().trim().min(1).max(4096);
export const TarsBatchScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }).strict(),
  z.object({ kind: z.literal("repository"), repositoryPath: Id }).strict(),
  z.object({ kind: z.literal("ids"), ids: z.array(Id).min(1).max(1000) }).strict(),
]);
export const TarsBulkControlActionSchema = z.object({ kind: z.literal("bulkControl"), operation: z.enum(["pause", "resume", "cancel"]), scope: TarsBatchScopeSchema }).strict();
export const TarsCleanupActionSchema = z.object({ kind: z.literal("cleanup"), scope: TarsBatchScopeSchema, deleteBranches: z.boolean().default(false), permanentlyDeleteArchived: z.boolean().default(false) }).strict();
export const TarsBatchActionSchema = z.discriminatedUnion("kind", [TarsBulkControlActionSchema, TarsCleanupActionSchema]);
export type TarsBatchAction = z.infer<typeof TarsBatchActionSchema>;
const Proposal = z.object({ messageId: Id, actionIndex: z.number().int().min(0).max(7) }).strict();
export const TarsBatchInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("preview"), action: TarsBatchActionSchema, proposal: Proposal.optional() }).strict(),
  z.object({ operation: z.literal("confirm"), id: Id }).strict(),
  z.object({ operation: z.literal("restore"), id: Id }).strict(),
]);
export type TarsBatchInput = z.infer<typeof TarsBatchInputSchema>;
export const TarsBatchItemSchema = z.object({
  responsibilityId: Id, revision: z.number().int().positive(), workspaceId: Id.nullable(), name: z.string(), repositoryPath: Id,
  bytes: z.number().nonnegative().nullable(), reason: z.string().nullable(),
  action: z.enum(["pause", "resume", "cancel", "archive", "delete"]),
  undoable: z.boolean().optional(),
  status: z.enum(["included", "skipped", "applying", "applied", "restored"]),
}).strict();
export const TarsBatchRecordSchema = z.object({ id: Id, action: TarsBatchActionSchema, proposal: Proposal.optional(),
  state: z.enum(["proposed", "executing", "applied", "restored"]), items: z.array(TarsBatchItemSchema).max(1000), createdAt: z.iso.datetime() }).strict();
export type TarsBatchRecord = z.infer<typeof TarsBatchRecordSchema>;
export const TarsBatchRecordsSchema = z.array(TarsBatchRecordSchema);
export const isTarsBatchAction = (action: { kind: string }): action is TarsBatchAction => action.kind === "bulkControl" || action.kind === "cleanup";
export function tarsBatchContains(scope: TarsBatchAction["scope"], row: { id: string; repositoryPath: string }) {
  return scope.kind === "all" || (scope.kind === "ids" ? scope.ids.includes(row.id) : scope.repositoryPath === row.repositoryPath);
}
