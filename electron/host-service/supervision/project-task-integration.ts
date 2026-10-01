import { createHash } from "node:crypto";
import { isOpenProjectState, ProjectCommandError, type Project, type ProjectEventDraft } from "../../../src/lib/projects/domain";
import {
  LinkProjectTaskArgsSchema, UnlinkProjectTaskArgsSchema, RecordProjectIntegrationArgsSchema, ProjectIntegrationSchema,
  validateProjectTaskLinks, integrationAcceptanceFailure, projectIntegrationStatus,
  type ProjectTaskCandidate, type ProjectTaskView, type ProjectIntegration,
} from "../../../src/lib/projects/task-integration";
import type { WorkspaceRevision } from "./workspace-revision";

export interface ProjectTaskSnapshot {
  exists: boolean; archived: boolean; running: boolean; title: string;
  revision: string; latestTurnId: string | null; outcome: ProjectTaskView["outcome"];
}
export interface ProjectTaskPorts {
  project: (projectId: string) => Project;
  readTask?: (target: { workspaceId: string; taskId: string }) => Promise<ProjectTaskSnapshot>;
  listCandidates?: (repositoryPath: string) => Promise<ProjectTaskCandidate[]>;
  readWorkspaceRevision?: (workspaceId: string) => Promise<WorkspaceRevision>;
  repository: (workspaceId: string) => Promise<string | null>;
  save: (project: Project, patch: Partial<Project>, event: ProjectEventDraft) => void;
  missionRevisions: (projectId: string) => unknown;
  now: () => Date;
}
function refuse(message: string, code: "refused" | "stale" = "refused"): never { throw new ProjectCommandError(code, message); }

/** Project-only coordination records. These ports contain no task execution action. */
export function createProjectTaskIntegration(ports: ProjectTaskPorts) {
  async function view(project: Project, includeCandidates = true, checkWorkspace = true) {
    const workspaceRevisions = new Map<string, WorkspaceRevision>();
    if (checkWorkspace && ports.readWorkspaceRevision) await Promise.all([...new Set((project.taskLinks ?? []).map(link => link.workspaceId))].map(async workspaceId => {
      const revision = await ports.readWorkspaceRevision!(workspaceId).catch((): WorkspaceRevision => ({ status: "unknown", reason: "unavailable" }));
      workspaceRevisions.set(workspaceId, revision);
    }));
    const tasks = await Promise.all((project.taskLinks ?? []).map(async link => {
      const repository = await ports.repository(link.workspaceId);
      const snapshot = repository === project.repositoryPath && ports.readTask ? await ports.readTask(link).catch(() => null) : null;
      return { ...link, available: Boolean(snapshot?.exists), archived: Boolean(snapshot?.archived), running: Boolean(snapshot?.running),
        revision: snapshot?.revision ?? "missing", latestTurnId: snapshot?.latestTurnId ?? null, outcome: snapshot?.outcome ?? null,
        ...(workspaceRevisions.has(link.workspaceId) ? { workspaceFreshness: workspaceRevisions.get(link.workspaceId)!.status } : {}) };
    }));
    const snapshot = createHash("sha256").update(JSON.stringify({
      tasks: tasks.map(task => ({ ...task, dependsOn: [...task.dependsOn].sort() })).sort((a, b) => a.taskId.localeCompare(b.taskId)),
      missions: ports.missionRevisions(project.id),
      workspaces: [...workspaceRevisions].sort((a, b) => a[0].localeCompare(b[0])),
    })).digest("hex");
    return { linkedTasks: tasks, integrationSnapshot: snapshot,
      integrationStatus: projectIntegrationStatus(project.integration, snapshot, tasks),
      taskCandidates: includeCandidates ? await ports.listCandidates?.(project.repositoryPath).catch(() => []) ?? [] : [] };
  }
  function writable(projectId: string) {
    const project = ports.project(projectId);
    if (!isOpenProjectState(project.state)) refuse("The project has ended; its coordination records are read-only.", "stale");
    return project;
  }
  return {
    view,
    changes: async (project: Project) => (await view(project, false, false)).linkedTasks.filter(task => !task.available || task.archived || (!task.running && (task.outcome === "completed" || task.outcome === "failed"))).map(task => {
      const signature = createHash("sha256").update(JSON.stringify([task.taskId, task.revision, task.available, task.archived])).digest("hex");
      const key = `linked-task:${signature}`;
      return { seenKey: key, trigger: { id: key, kind: "linked-task" as const, summary: `${task.title}: ${!task.available ? "missing" : task.archived ? "archived" : task.outcome}. Integration requires a separate review.` } };
    }),
    link: async (raw: unknown) => {
      const input = LinkProjectTaskArgsSchema.parse(raw); const project = writable(input.projectId);
      if (input.taskId === project.coordinator.taskId) refuse("The coordinator cannot also be a linked work task.");
      if (await ports.repository(input.workspaceId) !== project.repositoryPath) refuse("Link a task from this project's repository.");
      const task = await ports.readTask?.(input);
      if (!task?.exists || task.archived) refuse("The task is missing or archived.");
      const links = [...(project.taskLinks ?? [])]; const index = links.findIndex(link => link.taskId === input.taskId);
      if (index >= 0 && links[index]!.workspaceId !== input.workspaceId) refuse("The task identity no longer matches this link.", "stale");
      const previous = links[index];
      const next = { taskId: input.taskId, workspaceId: input.workspaceId, title: task.title, dependsOn: [...new Set(input.dependsOn)].sort(), linkedAt: previous?.linkedAt ?? ports.now().toISOString() };
      if (index >= 0) links[index] = next; else links.push(next);
      const failure = validateProjectTaskLinks(links); if (failure) refuse(failure);
      if (JSON.stringify(previous) === JSON.stringify(next)) return;
      ports.save(project, { taskLinks: links }, { kind: "task-linked", detail: { taskId: input.taskId, dependsOn: next.dependsOn } });
    },
    unlink: async (raw: unknown) => {
      const input = UnlinkProjectTaskArgsSchema.parse(raw); const project = writable(input.projectId);
      const links = project.taskLinks ?? [];
      if (!links.some(link => link.taskId === input.taskId)) return;
      if (links.some(link => link.dependsOn.includes(input.taskId))) refuse("Remove this task from its dependants before unlinking it.");
      ports.save(project, { taskLinks: links.filter(link => link.taskId !== input.taskId) }, { kind: "task-unlinked", detail: { taskId: input.taskId } });
    },
    record: async (raw: unknown) => {
      const input = RecordProjectIntegrationArgsSchema.parse(raw); const project = writable(input.projectId);
      const current = await view(project, false);
      if (input.expectedSnapshot !== current.integrationSnapshot) refuse("Linked work changed. Refresh and review the current result before recording integration.", "stale");
      if (!current.linkedTasks.some(task => task.taskId === input.ownerTaskId)) refuse("Choose a linked task to own integration.");
      if (input.accept) { const failure = integrationAcceptanceFailure(input, current.linkedTasks, input.reviewed); if (failure) refuse(failure); }
      const { projectId: _, expectedSnapshot: __, accept, reviewed, ...record } = input;
      const at = ports.now().toISOString();
      const integration = { ...record, snapshot: current.integrationSnapshot, recordedAt: at, acceptedAt: accept ? at : null,
        userReview: reviewed ? { reviewedAt: at, snapshot: current.integrationSnapshot } : null,
        verificationScope: current.linkedTasks.every(task => task.workspaceFreshness === "known") ? "workspace-content" as const : "task-metadata" as const };
      // Persistence parses schema key order; compare normalized records without clock fields.
      const identity = (value: ProjectIntegration) => JSON.stringify({
        accepted: Boolean(value.acceptedAt),
        record: ProjectIntegrationSchema.parse({ ...value, recordedAt: at, acceptedAt: null, userReview: value.userReview ? { ...value.userReview, reviewedAt: at } : null }),
      });
      if (project.integration && identity(project.integration) === identity(integration)) return;
      ports.save(project, { integration }, { kind: "integration-recorded", detail: { ownerTaskId: input.ownerTaskId, accepted: accept, source: "user", snapshot: current.integrationSnapshot } });
    },
    requireAccepted: async (project: Project) => {
      if (!(project.taskLinks?.length)) return;
      if ((await view(project, false)).integrationStatus !== "accepted") refuse("Review and accept the current combined result before marking the project goal met.");
    },
  };
}
