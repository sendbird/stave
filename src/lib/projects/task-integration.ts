import { z } from "zod";
import { AcceptanceCriterionSchema } from "@/lib/missions/domain";

const Id = z.string().trim().min(1).max(200);
export const ProjectTaskLinkSchema = z.object({
  taskId: Id, workspaceId: Id, title: z.string().trim().min(1).max(200),
  dependsOn: z.array(Id).max(50), linkedAt: z.iso.datetime(),
}).strict();
export type ProjectTaskLink = z.infer<typeof ProjectTaskLinkSchema>;
export interface ProjectTaskCandidate { taskId: string; workspaceId: string; workspaceName?: string; title: string }
export interface ProjectTaskView extends ProjectTaskLink {
  available: boolean; archived: boolean; running: boolean;
  revision: string; latestTurnId: string | null;
  outcome: "completed" | "failed" | "unknown" | null;
  workspaceFreshness?: "known" | "unknown";
}
export const ProjectIntegrationEvidenceSchema = z.object({
  label: z.string().trim().min(1).max(500), ref: z.string().trim().min(1).max(2000),
  source: z.enum(["agent", "user"]),
}).strict();
export const ProjectIntegrationSchema = z.object({
  ownerTaskId: Id, summary: z.string().trim().min(1).max(2000),
  criteria: z.array(AcceptanceCriterionSchema).min(1).max(50),
  evidence: z.array(ProjectIntegrationEvidenceSchema).max(50),
  unresolved: z.array(z.string().trim().min(1).max(500)).max(50),
  snapshot: z.string().min(1).max(100),
  acceptedAt: z.iso.datetime().nullable(), recordedAt: z.iso.datetime(),
  verificationScope: z.enum(["workspace-content", "task-metadata"]).optional(),
  userReview: z.object({ reviewedAt: z.iso.datetime(), snapshot: z.string().min(1).max(100) }).strict().nullable().optional(),
}).strict();
export type ProjectIntegration = z.infer<typeof ProjectIntegrationSchema>;
export const LinkProjectTaskArgsSchema = z.object({
  projectId: Id, workspaceId: Id, taskId: Id, dependsOn: z.array(Id).max(50).default([]),
}).strict();
export const UnlinkProjectTaskArgsSchema = z.object({ projectId: Id, taskId: Id }).strict();
export const RecordProjectIntegrationArgsSchema = ProjectIntegrationSchema.omit({
  snapshot: true, acceptedAt: true, recordedAt: true, verificationScope: true, userReview: true,
}).extend({ projectId: Id, expectedSnapshot: z.string().min(1).max(100), accept: z.boolean(), reviewed: z.boolean().default(false) }).strict();
export type LinkProjectTaskArgs = z.input<typeof LinkProjectTaskArgsSchema>;
export type RecordProjectIntegrationArgs = z.infer<typeof RecordProjectIntegrationArgsSchema>;

/** Dependencies describe coordination only; they never start or authorize execution. */
export function validateProjectTaskLinks(links: readonly ProjectTaskLink[]): string | null {
  if (links.length > 50) return "A project can link up to 50 tasks.";
  const byId = new Map(links.map(link => [link.taskId, link]));
  if (byId.size !== links.length) return "A task can only be linked once.";
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string): string | null {
    if (visiting.has(id)) return "Task dependencies must not contain a cycle.";
    if (visited.has(id)) return null;
    const link = byId.get(id);
    if (!link) return "Dependencies must reference tasks linked to this project.";
    visiting.add(id);
    for (const dependency of link.dependsOn) {
      const error = visit(dependency);
      if (error) return error;
    }
    visiting.delete(id); visited.add(id); return null;
  }
  for (const link of links) { const error = visit(link.taskId); if (error) return error; }
  return null;
}

export function integrationAcceptanceFailure(record: Pick<ProjectIntegration, "ownerTaskId" | "criteria" | "evidence" | "unresolved" | "userReview">, tasks: readonly ProjectTaskView[], userReviewed = Boolean(record.userReview)): string | null {
  if (!tasks.some(task => task.taskId === record.ownerTaskId)) return "Choose a linked task to own integration.";
  if (tasks.some(task => !task.available || task.archived)) return "Resolve missing or archived tasks before accepting integration.";
  if (tasks.some(task => task.running)) return "Wait for linked task runs to finish before accepting integration.";
  if (record.unresolved.length) return "Resolve the remaining integration items before accepting.";
  if (!record.criteria.length || record.criteria.some(criterion => criterion.status !== "met")) return "Every integration criterion must be met before accepting.";
  if (!record.evidence.length) return "Record evidence of the combined result before accepting integration.";
  if (!userReviewed) return "Record a review of the combined result; agent reports alone cannot accept integration.";
  return null;
}

export function projectIntegrationStatus(record: ProjectIntegration | null | undefined, snapshot: string, tasks: readonly ProjectTaskView[]): "not-recorded" | "pending" | "accepted" | "stale" {
  if (!record) return "not-recorded";
  if (record.snapshot !== snapshot || record.userReview?.snapshot !== record.snapshot || integrationAcceptanceFailure(record, tasks)) return record.acceptedAt ? "stale" : "pending";
  return record.acceptedAt ? "accepted" : "pending";
}
