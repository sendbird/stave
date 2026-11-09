import type { SqliteStore } from "../persistence/sqlite-store";
import { TARS_DEFAULT_BRANCH_NAMING_RULE } from "../../src/lib/tars/branch-name";

const MAX_REPOSITORIES = 12;
const MAX_WORKSPACES = 24;
const MAX_OWNED = 20;
const MAX_BRANCH_RULE_CHARS = 1_000;

/** Local observations carry their source and freshness; they are not execution or adoption grants. */
interface ObservationPorts extends Pick<SqliteStore, "loadRepositoryRegistry" | "loadWorkspaceShellSummary"> {
  tars: Pick<SqliteStore["tars"], "snapshot">;
  agentRuns: Pick<SqliteStore["agentRuns"], "getLatestAgentRunForTask">;
}
export function observeTarsContext(store: ObservationPorts,
  observedAt: string) {
  const snapshot = store.tars.snapshot();
  const registry = store.loadRepositoryRegistry();
  let remaining = MAX_WORKSPACES;
  let shownWorkspaces = 0;
  const repositories = registry.slice(0, MAX_REPOSITORIES).map((repository) => {
    const workspaces = repository.workspaces.slice(0, remaining).map((workspace) => {
      remaining--; shownWorkspaces++;
      let summary: ReturnType<ObservationPorts["loadWorkspaceShellSummary"]> = null;
      try { summary = store.loadWorkspaceShellSummary({ workspaceId: workspace.id }); }
      catch { /* An unavailable summary must not prevent global discussion. */ }
      return { id: workspace.id, name: workspace.name.slice(0, 200), updatedAt: workspace.updatedAt,
        source: "persisted-workspace-shell-summary", available: summary !== null,
        tasks: (summary?.tasks ?? []).slice(0, 3).map((task) => ({ id: task.id, title: task.title.slice(0, 200),
          updatedAt: task.updatedAt, archived: Boolean(task.archivedAt), controlOwner: task.controlOwner ?? "unknown" })),
        omittedTasks: Math.max(0, (summary?.tasks.length ?? 0) - 3) };
    });
    const rule = typeof repository.kickoffBranchNamingRule === "string" ? repository.kickoffBranchNamingRule.trim() : "";
    return { repositoryPath: repository.repositoryPath, name: repository.repositoryName.slice(0, 200),
      branchNamingRule: rule ? rule.slice(0, MAX_BRANCH_RULE_CHARS) : TARS_DEFAULT_BRANCH_NAMING_RULE, workspaces };
  });
  const responsibilities = snapshot.responsibilities.slice(0, MAX_OWNED).map((row) => {
    let run: ReturnType<ObservationPorts["agentRuns"]["getLatestAgentRunForTask"]> = null;
    try { run = row.taskId ? store.agentRuns.getLatestAgentRunForTask(row.taskId) : null; }
    catch { /* Unknown execution is not evidence of idle or complete. */ }
    // Never present a newer/manual task Run as this representative's owned execution.
    const owned = run && run.id === row.agentRunId && run.workspaceId === row.executionWorkspaceId &&
      run.repositoryPath === row.repositoryPath ? run : null;
    return { id: row.id, revision: row.revision, title: row.title, workspaceId: row.workspaceId, repositoryPath: row.repositoryPath,
      state: row.state, detail: row.detail, priority: row.priority, updatedAt: row.updatedAt,
      requiresReverification: row.reverifyAfter !== null,
      // Whether its draft pull request is open, failed or underway; a URL only once opened.
      ...(row.publication ? { publication: { state: row.publication.state, url: row.publication.url } } : {}),
      source: "persisted-personal-responsibility", acceptanceCriteria: row.acceptanceCriteria.slice(0, 3),
      // What the user's run commands need: why it paused, how many turns are left and which stage it is on.
      ...(row.stageAsksUser ? { stageAsksUser: true } : {}),
      // Requests waiting in the work's task or a helper's task; their text is the tool's own words, untrusted.
      ...(row.pendingRequests?.length ? { pendingRequests: row.pendingRequests.map(({ workspaceId: _workspace, ...request }) => request) } : {}),
      execution: owned ? { source: "persisted-agent-run", id: owned.id, state: owned.state, updatedAt: owned.updatedAt,
        stopReason: owned.stopReason, pauseReason: owned.pauseReason ?? null, turns: { used: owned.turnCount, max: owned.maxTurns },
        currentStage: owned.workflow.stages[owned.currentStageIndex]?.title.slice(0, 120) ?? null } : null };
  });
  return { snapshot, observation: { source: "local-persisted-snapshot", observedAt, repositories, responsibilities,
    omittedRepositories: Math.max(0, registry.length - repositories.length),
    omittedWorkspaces: Math.max(0, registry.reduce((total, repository) => total + repository.workspaces.length, 0) - shownWorkspaces),
    omittedResponsibilities: Math.max(0, snapshot.responsibilities.length - responsibilities.length) } };
}
export type TarsPlannerObservation = ReturnType<typeof observeTarsContext>["observation"];
