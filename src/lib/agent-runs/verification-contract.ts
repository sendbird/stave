import { z } from "zod";

/** Matches the host workspace fingerprint contract; never contains raw content. */
export const WorkspaceRevisionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), revision: z.string().min(1).max(128) }).strict(),
  z.object({ status: z.literal("unknown"), reason: z.enum(["unavailable", "limit", "changing"]) }).strict(),
]);
export type WorkspaceRevision = z.infer<typeof WorkspaceRevisionSchema>;

export const ScriptVerificationSchema = z.object({
  sourceRevision: WorkspaceRevisionSchema,
  completedRevision: WorkspaceRevisionSchema,
}).strict();
export type ScriptVerification = z.infer<typeof ScriptVerificationSchema>;

export function revisionsMatch(source?: WorkspaceRevision, current?: WorkspaceRevision) {
  return source?.status === "known" && current?.status === "known" && source.revision === current.revision;
}
