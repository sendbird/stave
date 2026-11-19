import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { TarsTrayAttentionInput } from "@/lib/tars/tray-model";
import type { TarsPendingDecision, TarsResponsibility } from "@/lib/tars/types";

/** What the tray fixtures hold that the card cases add to. */
interface TarsCardCaseTarget {
  responsibilities: TarsResponsibility[];
  pendingDecisions: TarsPendingDecision[];
  attentionItems: TarsTrayAttentionInput[];
  runs: Record<string, AgentRunDetail>;
}

/** The ids of the work `cardStates=true` adds, one per case. */
export const TARS_CARD_CASE_IDS = { hold: "card-hold", helper: "card-helper", signals: "card-signals", question: "card-question", preparing: "card-preparing" } as const;

/**
 * `cardStates=true`: five more pieces of work, one per state rule a work card
 * has to get right beyond the plain lanes:
 *
 * - `card-hold`: its run waits for a usage reset with a known time (on hold);
 * - `card-helper`: it waits on a helper, whose task holds an approval in
 *   another workspace (the card opens that task, not the work's own);
 * - `card-signals`: it runs while Fleet lists a pull request ready to merge
 *   and a quiet turn for its task (review rows; it still reads as working);
 * - `card-question`: its result waits for a check and Tars asks a question
 *   about it (the question is answered first);
 * - `card-preparing`: its workspace is still being prepared, so its task is
 *   named but does not exist yet (no action).
 *
 * Times count from `start`. Call it after the fixtures' running fix exists:
 * the runs here are copies of that fix's run.
 */
export function addTarsCardCases(target: TarsCardCaseTarget, start: Date, korean: boolean) {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const base = target.responsibilities.find((row) => row.id === "billing")!;
  const baseRun = target.runs[base.agentRunId!]!;
  const work = (id: string, title: string, patch: Partial<TarsResponsibility>): TarsResponsibility => ({ ...base, id, requestId: `request-${id}`, title, agentId: null,
    branchName: undefined, workspaceId: base.workspaceId, executionWorkspaceId: `exec-${id}`, taskId: `task-${id}`, agentRunId: null, revision: 1, createdAt: at(10), updatedAt: at(10), ...patch });
  const runOf = (row: TarsResponsibility, patch: Partial<AgentRunDetail["agentRun"]>): AgentRunDetail => {
    const run = structuredClone(baseRun);
    run.agentRun = { ...run.agentRun, id: row.agentRunId!, leadTaskId: row.taskId!, workspaceId: row.executionWorkspaceId!, ...patch };
    for (const stage of run.stages) stage.agentRunId = row.agentRunId!;
    run.events = [];
    return run;
  };

  const hold = work(TARS_CARD_CASE_IDS.hold, "Refresh the pricing page copy", { state: "waiting", agentRunId: "run-card-hold", detail: "usage-limit", detailCode: "runPaused", detailParams: { reason: "usage-limit" } });
  target.runs[hold.agentRunId!] = runOf(hold, { state: "paused", pauseReason: "usage-limit",
    usageLimit: { turnId: "card-hold-turn", resetsAt: at(180), resumeAt: at(181), accountProfileId: "preview-account", fingerprint: baseRun.agentRun.fingerprint } });

  const helper = work(TARS_CARD_CASE_IDS.helper, "Migrate the invoices table", { state: "waiting", detail: "A helper task is waiting for your input or approval.", detailCode: "waitingForUser",
    waitingTaskId: "task-card-helper-child" });
  target.attentionItems.push({ id: "interaction:approval:exec-card-helper-child:task-card-helper-child:request-1", kind: "approval", taskId: helper.waitingTaskId,
    workspaceId: "exec-card-helper-child", detail: "Bash: bun run db:migrate --target invoices" });

  const signals = work(TARS_CARD_CASE_IDS.signals, "Tidy the export logs", { agentRunId: "run-card-signals" });
  target.runs[signals.agentRunId!] = runOf(signals, {});
  target.attentionItems.push(
    { id: `pr:pr-ready-to-merge:${signals.executionWorkspaceId}`, kind: "pr-ready-to-merge", taskId: signals.taskId!, workspaceId: signals.executionWorkspaceId! },
    { id: `turn:turn-stalled:${signals.executionWorkspaceId}:${signals.taskId}:turn-1`, kind: "turn-stalled", taskId: signals.taskId!, workspaceId: signals.executionWorkspaceId! });

  const question = work(TARS_CARD_CASE_IDS.question, "Show the saved card first at checkout", { state: "resultReady", completionGoal: "confirmation", revision: 2 });
  target.pendingDecisions.push({ kind: "ask", responsibilityId: question.id, messageId: "message-card-question", actionIndex: 0, operation: null, expectedRevision: question.revision,
    proposedAt: at(12), question: korean ? "모바일에서도 저장된 카드를 맨 앞에 둘까요?" : "Should the saved card stay first on mobile too?", optionCount: 2 });

  const preparing = work(TARS_CARD_CASE_IDS.preparing, "Add retries to the webhook sender", { state: "preparing", taskId: "tars-card-preparing", executionWorkspaceId: null });

  target.responsibilities.push(hold, helper, signals, question, preparing);
}
