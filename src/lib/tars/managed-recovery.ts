import type { TarsResponsibility } from "./types";
import type { AgentRunDetail } from "../agent-runs/api";
import { currentStageRecord } from "../agent-runs/domain";

/** Only a complete ordinary question in currently owned work can be answered automatically. */
export function tarsOwnedQuestion(row: TarsResponsibility | null | undefined, ref: string | undefined): boolean {
  if (!row || row.state !== "waiting" || !ref || !row.agentRunId) return false;
  const request = row.pendingRequests?.find(request => request.ref === ref);
  return Boolean(request?.kind === "question" && !request.truncated && request.questions?.length &&
    ["request_user_input", "AskUserQuestion"].includes(request.toolName));
}

/** Bind recovery words to the exact helper episode Tars observed, never a fresh episode or stage sign-off. */
export function tarsRecoverableHelper(row: TarsResponsibility, details: readonly AgentRunDetail[]): AgentRunDetail | null {
  if (row.state !== "waiting" || !row.waitingTaskId || row.waitingTaskId === row.taskId) return null;
  const helper = details.find(detail => detail.agentRun.leadTaskId === row.waitingTaskId);
  if (!helper || helper.agentRun.state !== "running") return null;
  const stage = currentStageRecord(helper);
  if (row.observedStage !== `${helper.agentRun.id}/${stage.stageId}#${stage.attempt}:${stage.reportRevision}`) return null;
  if (stage.status !== "blocked" && stage.status !== "stuck") return null;
  return helper;
}
