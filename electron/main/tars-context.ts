import type { SqliteStore } from "../persistence/sqlite-store";
import { TARS_DEFAULT_BRANCH_NAMING_RULE } from "../../src/lib/tars/branch-name";
import { resolveTarsWorkRequest, type TarsWorkRequestSource } from "../../src/lib/tars/brief";
import type { TarsResponsibility, TarsWorkRequest } from "../../src/lib/tars/types";

const MAX_REPOSITORIES = 12;
const MAX_WORKSPACES = 24;
const MAX_OWNED = 20;
const MAX_BRANCH_RULE_CHARS = 1_000;
/** The user's requests the planner sees, newest kept; each is one message however many units it admitted. */
export const TARS_OBSERVED_REQUESTS_MAX = 20;
/** How much of each request's text the planner sees; the request view shows it whole. */
export const TARS_REQUEST_EXCERPT_CHARS = 300;
/** How much of Tars's own instruction for a unit the planner sees. */
export const TARS_INSTRUCTION_EXCERPT_CHARS = 200;
/** Requests are read for at most this many units, newest first, so one read stays bounded. */
const MAX_REQUEST_SCAN = 200;
const MAX_WORKS_PER_REQUEST = 4;

/** Local observations carry their source and freshness; they are not execution or adoption grants. */
interface ObservationPorts extends Pick<SqliteStore, "loadRepositoryRegistry" | "loadWorkspaceShellSummary"> {
  tars: Pick<SqliteStore["tars"], "snapshot">;
  agentRuns: Pick<SqliteStore["agentRuns"], "getLatestAgentRunForTask">;
  /** Reads older work's admitting message back (`resolveTarsWorkRequest`); absent, such work shows `request: "notStored"`. */
  tarsConversations?: Pick<SqliteStore["tarsConversations"], "workRequestOf">;
}

/** A bounded excerpt that says whether it was cut; never half of a surrogate pair. */
function excerpt(text: string, max: number) {
  if (text.length <= max) return { text, truncated: false };
  let kept = text.slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(kept)) kept = kept.slice(0, -1);
  return { text: kept, truncated: true };
}

/** Units one message admitted share its time; the decision's action order (`tars-message:<id>:<index>`) keeps them in order. */
function actionIndex(row: Pick<TarsResponsibility, "requestId">) {
  const index = /:(\d+)$/.exec(row.requestId)?.[1];
  return index === undefined ? Number.MAX_SAFE_INTEGER : Number(index);
}

/**
 * The user's own messages that admitted the observed work, oldest first by
 * when they were sent, so the planner can list them, or the work, in the
 * order the user asked. Units admitted by one message share one entry.
 */
function observeRequests(rows: readonly TarsResponsibility[], read: ((messageId: string) => TarsWorkRequest | null) | undefined) {
  const byMessage = new Map<string, { request: TarsWorkRequest; source: TarsWorkRequestSource; works: TarsResponsibility[] }>();
  const resolved = new Map<string, string>();
  const scanned = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, MAX_REQUEST_SCAN);
  for (const row of scanned) {
    const found = resolveTarsWorkRequest(row, read);
    if (!found) continue;
    resolved.set(row.id, found.request.messageId);
    const entry = byMessage.get(found.request.messageId);
    if (entry) entry.works.push(row); else byMessage.set(found.request.messageId, { ...found, works: [row] });
  }
  const ordered = [...byMessage.values()].sort((a, b) => a.request.sentAt.localeCompare(b.request.sentAt) || a.request.messageId.localeCompare(b.request.messageId));
  const kept = ordered.slice(-TARS_OBSERVED_REQUESTS_MAX);
  return {
    resolved,
    omitted: ordered.length - kept.length,
    requests: kept.map(({ request, source, works }) => {
      const cut = excerpt(request.text, TARS_REQUEST_EXCERPT_CHARS);
      return { messageId: request.messageId, sentAt: request.sentAt, textExcerpt: cut.text, truncated: cut.truncated, source,
        ...(request.answeredQuestion ? { answeredQuestion: excerpt(request.answeredQuestion, 200).text } : {}),
        works: [...works].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || actionIndex(a) - actionIndex(b) || a.id.localeCompare(b.id)).slice(0, MAX_WORKS_PER_REQUEST)
          .map((row) => ({ id: row.id, title: row.title, state: row.state })),
        ...(works.length > MAX_WORKS_PER_REQUEST ? { omittedWorks: works.length - MAX_WORKS_PER_REQUEST } : {}) };
    }),
  };
}

export function observeTarsContext(store: ObservationPorts,
  observedAt: string) {
  const snapshot = store.tars.snapshot();
  const asked = observeRequests(snapshot.responsibilities, store.tarsConversations ? (id) => store.tarsConversations!.workRequestOf(id) : undefined);
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
    const instruction = row.delegatedInstruction ? excerpt(row.delegatedInstruction, TARS_INSTRUCTION_EXCERPT_CHARS) : null;
    return { id: row.id, revision: row.revision, title: row.title, workspaceId: row.workspaceId, repositoryPath: row.repositoryPath,
      state: row.state, detail: row.detail, priority: row.priority, createdAt: row.createdAt, updatedAt: row.updatedAt,
      // The user's message that admitted it, in `requests`; "notStored" when Stave has no copy of it.
      request: asked.resolved.has(row.id) ? { messageId: asked.resolved.get(row.id)! } : "notStored" as const,
      // Tars's own instruction for the unit, as it proposed it; absent on work admitted before it was kept.
      ...(instruction ? { delegatedInstructionExcerpt: instruction.text, ...(instruction.truncated ? { delegatedInstructionTruncated: true } : {}) } : {}),
      requiresReverification: row.reverifyAfter !== null,
      // Whether its draft pull request is open, failed or underway; a URL only once opened.
      ...(row.publication ? { publication: { state: row.publication.state, url: row.publication.url } } : {}),
      source: "persisted-personal-responsibility", acceptanceCriteria: row.acceptanceCriteria.slice(0, 3),
      // What the user's run commands need: why it paused, how many turns are left and which stage it is on.
      // stageAsksUser only when the stage really asks; stageWait says what it waits for (a gate asks nothing).
      ...(row.stageAsksUser && row.stageWait?.kind !== "gate" ? { stageAsksUser: true } : {}),
      ...(row.stageAsksUser && row.stageWait ? { stageWait: row.stageWait } : {}),
      // Requests waiting in the work's task or a helper's task; their text is the tool's own words, untrusted.
      ...(row.pendingRequests?.length ? { pendingRequests: row.pendingRequests.map(({ workspaceId: _workspace, ...request }) => request) } : {}),
      execution: owned ? { source: "persisted-agent-run", id: owned.id, state: owned.state, updatedAt: owned.updatedAt,
        stopReason: owned.stopReason, pauseReason: owned.pauseReason ?? null, turns: { used: owned.turnCount, max: owned.maxTurns },
        currentStage: owned.workflow.stages[owned.currentStageIndex]?.title.slice(0, 120) ?? null } : null };
  });
  return { snapshot, observation: { source: "local-persisted-snapshot", observedAt, repositories, responsibilities,
    requests: asked.requests, omittedRequests: asked.omitted,
    omittedRepositories: Math.max(0, registry.length - repositories.length),
    omittedWorkspaces: Math.max(0, registry.reduce((total, repository) => total + repository.workspaces.length, 0) - shownWorkspaces),
    omittedResponsibilities: Math.max(0, snapshot.responsibilities.length - responsibilities.length) } };
}
export type TarsPlannerObservation = ReturnType<typeof observeTarsContext>["observation"];
