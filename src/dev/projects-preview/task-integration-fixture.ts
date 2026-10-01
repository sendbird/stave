import type { ProjectDetail, ProjectsBridgeApi, ProjectResponse } from "@/lib/projects/api";
import { LinkProjectTaskArgsSchema, RecordProjectIntegrationArgsSchema, UnlinkProjectTaskArgsSchema, integrationAcceptanceFailure, projectIntegrationStatus, validateProjectTaskLinks, type ProjectTaskView } from "@/lib/projects/task-integration";

/** Dev-only interaction fixture. Host persistence and permission tests use the real runtime. */
export function projectTaskIntegrationFixture(seed: ProjectDetail) {
  const candidates = [
    { taskId: "api", workspaceId: "ws-api", workspaceName: "API", title: "API contract" },
    { taskId: "ui", workspaceId: "ws-ui", workspaceName: "UI", title: "Settings form" },
    { taskId: "integration", workspaceId: "ws-integration", workspaceName: "Integration", title: "Combined behavior review" },
  ];
  let revision = 1;
  let detail: ProjectDetail = { ...seed, project: { ...seed.project, taskLinks: [] }, linkedTasks: [], taskCandidates: candidates, integrationSnapshot: "preview-1", integrationStatus: "not-recorded" };
  function update(tasks: ProjectTaskView[]) {
    const snapshot = `preview-${++revision}`;
    detail = { ...detail, project: { ...detail.project, taskLinks: tasks.map(({ taskId, workspaceId, title, dependsOn, linkedAt }) => ({ taskId, workspaceId, title, dependsOn, linkedAt })) },
      linkedTasks: tasks, integrationSnapshot: snapshot, integrationStatus: projectIntegrationStatus(detail.project.integration, snapshot, tasks) };
  }
  for (const candidate of candidates.slice(0, 2)) update([...(detail.linkedTasks ?? []), { ...candidate, dependsOn: candidate.taskId === "ui" ? ["api"] : [], linkedAt: new Date().toISOString(), available: true, archived: false, running: false, revision: "r1", latestTurnId: `${candidate.taskId}-turn`, outcome: "completed" }]);
  function response(work: () => void): Promise<ProjectResponse> {
    try { work(); return Promise.resolve({ ok: true, project: detail }); }
    catch (error) { return Promise.resolve({ ok: false, project: null, code: "refused", message: error instanceof Error ? error.message : "Invalid preview action" }); }
  }
  const commands: Pick<ProjectsBridgeApi, "get" | "linkTask" | "unlinkTask" | "recordIntegration"> = {
    get: async () => ({ ok: true, project: detail }),
    linkTask: raw => response(() => {
      const input = LinkProjectTaskArgsSchema.parse(raw); const candidate = candidates.find(task => task.taskId === input.taskId && task.workspaceId === input.workspaceId);
      if (!candidate) throw new Error("Choose a task in this repository.");
      const existing = detail.linkedTasks?.find(task => task.taskId === input.taskId);
      const next: ProjectTaskView = { ...candidate, dependsOn: input.dependsOn, linkedAt: existing?.linkedAt ?? new Date().toISOString(), available: true, archived: false, running: false, revision: "r1", latestTurnId: `${input.taskId}-turn`, outcome: "completed" };
      const tasks = [...(detail.linkedTasks ?? []).filter(task => task.taskId !== next.taskId), next];
      const failure = validateProjectTaskLinks(tasks); if (failure) throw new Error(failure); update(tasks);
    }),
    unlinkTask: raw => response(() => {
      const input = UnlinkProjectTaskArgsSchema.parse(raw);
      if (detail.linkedTasks?.some(task => task.dependsOn.includes(input.taskId))) throw new Error("Remove this task from its dependants before unlinking it.");
      update((detail.linkedTasks ?? []).filter(task => task.taskId !== input.taskId));
    }),
    recordIntegration: raw => response(() => {
      const input = RecordProjectIntegrationArgsSchema.parse(raw);
      if (input.expectedSnapshot !== detail.integrationSnapshot) throw new Error("Linked work changed. Review current work.");
      const failure = input.accept ? integrationAcceptanceFailure(input, detail.linkedTasks ?? [], input.reviewed) : null; if (failure) throw new Error(failure);
      const { projectId: _, expectedSnapshot: __, accept, reviewed, ...record } = input;
      const at = new Date().toISOString();
      detail = { ...detail, project: { ...detail.project, integration: { ...record, userReview: reviewed ? { reviewedAt: at, snapshot: detail.integrationSnapshot! } : null, snapshot: detail.integrationSnapshot!, acceptedAt: accept ? at : null, recordedAt: at } }, integrationStatus: accept ? "accepted" : "pending" };
    }),
  };
  const unsupported = async (): Promise<ProjectResponse> => ({ ok: false, project: null, code: "refused", message: "This preview only exercises task links and integration review." });
  const bridge: ProjectsBridgeApi = { ...commands, list: async () => ({ ok: true, projects: [detail.project] }), create: unsupported,
    approveProposal: unsupported, rejectProposal: unsupported, messageCoordinator: unsupported, pause: unsupported, resume: unsupported, end: unsupported,
    updateSettings: unsupported, setMemoryStatus: unsupported, syncPlaybooks: async () => ({ ok: true }), subscribeChanged: () => () => {} };
  return { detail, bridge };
}
