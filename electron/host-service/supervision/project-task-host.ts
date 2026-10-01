import { createHash } from "node:crypto";
import { ensureHostServicePersistenceReady } from "../persistence";
import { getTaskSupervisionSnapshot, listKnownRepositories } from "../local-mcp-runtime";
import type { ProjectTaskCandidate } from "../../../src/lib/projects/task-integration";
import type { ProjectTaskSnapshot } from "./project-task-integration";

export async function readProjectTask(target: { workspaceId: string; taskId: string }): Promise<ProjectTaskSnapshot> {
  const snapshot = await getTaskSupervisionSnapshot(target);
  const missing = { exists: false, archived: false, running: false, title: target.taskId, revision: "missing", latestTurnId: null, outcome: null };
  if (!snapshot.exists) return missing;
  const persistence = ensureHostServicePersistenceReady();
  const task = persistence.loadWorkspaceShell({ workspaceId: target.workspaceId })?.tasks.find(task => task.id === target.taskId);
  if (!task || task.parentTaskId) return missing;
  const turn = persistence.listTurns({ ...target, limit: 1 })[0];
  const status = { updatedAt: task?.updatedAt ?? "unknown", activeTurnId: snapshot.activeTurnId, latestTurnId: turn?.id ?? null, latestTurnCompletedAt: turn?.completedAt ?? null, title: task?.title ?? target.taskId };
  const result = persistence.resultReviews.list({ ...target, turnId: status.latestTurnId ?? undefined, limit: 1, includeEvidence: false }).results[0];
  const outcome = status.latestTurnId ? result?.turnId === status.latestTurnId ? result.outcome : "unknown" : null;
  const revision = createHash("sha256").update(JSON.stringify({ updatedAt: status.updatedAt, activeTurnId: status.activeTurnId,
    turnId: status.latestTurnId, completedAt: status.latestTurnCompletedAt, archived: snapshot.archived, outcome })).digest("hex");
  return { exists: true, archived: snapshot.archived, running: Boolean(status.activeTurnId), title: status.title,
    revision, latestTurnId: status.latestTurnId, outcome };
}

/** Metadata from this repository only; no transcript or execution permission crosses this listing. */
export async function listProjectTaskCandidates(repositoryPath: string): Promise<ProjectTaskCandidate[]> {
  const repository = (await listKnownRepositories()).find(candidate => candidate.repositoryPath === repositoryPath);
  if (!repository) return [];
  const persistence = ensureHostServicePersistenceReady();
  return repository.workspaces.flatMap(workspace => {
    const tasks = persistence.loadWorkspaceShell({ workspaceId: workspace.id })?.tasks ?? persistence.listWorkspaceTasks({ workspaceId: workspace.id });
    return tasks.filter(task => !task.archivedAt && !task.parentTaskId).map(task => ({ taskId: task.id, workspaceId: workspace.id, workspaceName: workspace.name, title: task.title }));
  }).slice(0, 200);
}
