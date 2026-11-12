import type { AgentRunDetail, AgentRunInvokeResult } from "../../src/lib/agent-runs/api";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { SqliteStore } from "../persistence/sqlite-store";
import type { invokeHostService } from "./host-service-client";
import type { TarsInspectionReader } from "./tars-inspections";
import { assertTarsSource } from "./tars-scope";

/** Existing view readers only. No command strings, paths or run ids come from model output. */
export function createTarsInspectionReader(store: Pick<SqliteStore, "tars" | "loadRepositoryRegistry" | "loadTaskMessagesPage">,
  invoke: typeof invokeHostService): TarsInspectionReader {
  function current(saved: TarsResponsibility) {
    const row = store.tars.get(saved.id);
    if (!row || row.agentRunId !== saved.agentRunId || row.taskId !== saved.taskId ||
      row.executionWorkspaceId !== saved.executionWorkspaceId || row.repositoryPath !== saved.repositoryPath)
      throw new Error("The responsibility's execution changed.");
    return row;
  }
  function cwdOf(row: TarsResponsibility) {
    if (!row.executionWorkspaceId) throw new Error("The execution workspace is unavailable.");
    const registry = store.loadRepositoryRegistry();
    assertTarsSource({ workspaceId: row.executionWorkspaceId, repositoryPath: row.repositoryPath }, registry);
    const cwd = registry.find((repository) => repository.repositoryPath === row.repositoryPath)?.workspacePathById[row.executionWorkspaceId];
    if (!cwd) throw new Error("The execution path is unavailable.");
    return cwd;
  }
  return async (saved, view) => {
    const row = current(saved);
    if (view === "pullRequest") {
      // A failed live read does not erase the saved publication or claim its checks passed.
      const publication = row.publication ?? null;
      if (!publication?.url) return { source: "saved-publication", publication, liveChecks: "unavailable" };
      try {
        const result = await invoke("scm.get-pr-status-for-url", { cwd: cwdOf(row), url: publication.url });
        current(saved);
        return { source: "saved-publication-and-live-pr", publication,
          live: result.ok ? result.pr : null, liveChecks: result.ok && result.pr ? "read" : "unavailable" };
      } catch { return { source: "saved-publication", publication, liveChecks: "unavailable" }; }
    }
    if (!row.agentRunId || !row.taskId || !row.executionWorkspaceId) throw new Error("No execution is recorded.");
    const result = await invoke("agent-run.invoke", { action: "get", args: { agentRunId: row.agentRunId } }) as AgentRunInvokeResult<AgentRunDetail>;
    current(saved);
    if (!result.ok) throw new Error("The execution could not be read.");
    const detail = result.value;
    const run = detail.agentRun;
    if (run.id !== row.agentRunId || run.leadTaskId !== row.taskId || run.workspaceId !== row.executionWorkspaceId || run.repositoryPath !== row.repositoryPath)
      throw new Error("The execution does not belong to this responsibility.");
    if (view === "report") return { source: "agent-run-detail", report: detail.report,
      stages: detail.stages.map(({ stageId, attempt, report, facts }) => ({ stageId, attempt, report, facts })) };
    if (view === "checks") return { source: "recorded-stage-facts", state: run.state,
      stages: detail.stages.map(({ stageId, attempt, facts, report }) => ({ stageId, attempt,
        workspaceScripts: facts?.workspaceScripts ?? [], workspaceRevision: facts?.workspaceRevision ?? null,
        action: facts?.action ?? null, report })) };
    if (view === "transcript") {
      const page = store.loadTaskMessagesPage({ workspaceId: run.workspaceId, taskId: run.leadTaskId, limit: 40 });
      if (!page) throw new Error("The transcript could not be read.");
      return { source: "recent-task-transcript", omittedOlder: page.hasMoreOlder,
        messages: page.messages.map(({ role, content }) => ({ role, content })), stages: detail.stages, events: detail.events };
    }
    const first = run.workflow.stages[0];
    const base = detail.stages.filter((stage) => stage.stageId === first?.id).sort((a, b) => a.attempt - b.attempt).find((stage) => stage.startHeadSha)?.startHeadSha;
    if (!base) throw new Error("The run's starting commit is unavailable.");
    const cwd = cwdOf(row);
    const diff = await invoke("scm.review-diff", { cwd, base: { kind: "commit", sha: base } });
    if (!diff.ok || !diff.baseSha) throw new Error("The changes could not be read.");
    const files = [];
    // Bound I/O as well as output. These are the same guarded file readers the side view uses.
    for (const file of diff.files.slice(0, 4)) {
      current(saved);
      const content = await invoke("scm.review-file-diff", { cwd, baseSha: diff.baseSha, path: file.path,
        ...(file.oldPath ? { oldPath: file.oldPath } : {}), ...(file.untracked ? { untracked: true } : {}) });
      files.push({ ...file, available: content.ok, binary: content.binary ?? false,
        oldContent: content.oldContent.slice(0, 2_000), newContent: content.newContent.slice(0, 2_000),
        truncated: content.oldContent.length > 2_000 || content.newContent.length > 2_000 });
    }
    current(saved);
    return { source: "live-review-diff-since-run-start", baseSha: diff.baseSha, headSha: diff.headSha,
      omittedFiles: Math.max(0, diff.files.length - files.length), files };
  };
}
