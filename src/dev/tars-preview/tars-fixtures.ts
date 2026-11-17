import { TarsWorkActionSchema } from "@/lib/tars/conversation";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildAgentRunStartInput } from "@/lib/agent-runs/agent-run";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { createAgentRun, type AgentRunStageRecord } from "@/lib/agent-runs/domain";
import type { TarsActionReceipt, TarsMessage } from "@/lib/tars/conversation";
import type { TarsActivity, TarsPendingDecision, TarsResponsibility } from "@/lib/tars/types";
import type { TarsTrayAttentionInput } from "@/lib/tars/tray-model";

/**
 * Tars work for the tray preview and the render tests: a paused release check
 * whose resume waits for the user's Confirm (needs you), a three-stage fix on
 * its second stage with turns left and helpers working (running), work the
 * user took over (running, owned by you) and finished work whose run is no
 * longer loaded (done). Times count from `start`.
 */
export function buildTarsTrayFixtures(start: Date) {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const base = (patch: Partial<TarsResponsibility> & Pick<TarsResponsibility, "id" | "title">): TarsResponsibility => ({
    requestId: `request-${patch.id}`, instruction: "Inspect the actual result.", acceptanceCriteria: ["The required checks pass on the reviewed revision."],
    workspaceId: "preview-workspace", executionWorkspaceId: `exec-${patch.id}`, repositoryPath: "/tmp/preview", providerId: "codex", model: null,
    agentId: null, priority: 50, maxTurns: 30, revision: 1, state: "running", detail: null, taskId: `task-${patch.id}`, agentRunId: `run-${patch.id}`,
    reverifyAfter: null, createdAt: at(0), updatedAt: at(0), ...patch,
  });
  const release = base({ id: "release", title: "Verify the release candidate", state: "paused", revision: 3, priority: 80,
    detail: "Paused by you while the staging deploy finishes.", agentRunId: null });
  const billing = base({ id: "billing", title: "Fix the billing export on empty invoice lists", revision: 2, agentId: "debugger",
    branchName: "fix/billing-export-empty-3fa9c1d2", acceptanceCriteria: ["Exporting an empty invoice list downloads an empty file.", "The export tests pass."] });
  const migration = base({ id: "migration", title: "Review the API migration notes", state: "takenOver", revision: 4, agentRunId: null });
  const docs = base({ id: "docs", title: "Update the setup guide", state: "completed", revision: 5, priority: 30 });
  const responsibilities = [release, billing, migration, docs];

  const pendingDecisions: TarsPendingDecision[] = [{ responsibilityId: release.id, messageId: "message-plan", actionIndex: 1,
    operation: "resume", expectedRevision: release.revision, proposedAt: at(6) }];
  const attentionItems: TarsTrayAttentionInput[] = [{ id: "tars:decision:message-plan:1", kind: "tars-decision",
    taskId: release.taskId ?? undefined, tarsResponsibilityId: release.id }];

  const created = createAgentRun({
    id: billing.agentRunId!,
    input: buildAgentRunStartInput({ workspaceId: billing.executionWorkspaceId!, taskId: billing.taskId!, agent: getBuiltinAgent("debugger")!,
      assignment: billing.title, now: start }),
    repositoryPath: billing.repositoryPath,
    fingerprint: { providerId: "codex", model: "gpt-5.5" },
    now: start,
  });
  const record = (stageId: string, patch: Partial<AgentRunStageRecord>): AgentRunStageRecord => ({ ...created.upserts[0]!, stageId, ...patch });
  const billingRun: AgentRunDetail = {
    agentRun: { ...created.agentRun, currentStageIndex: 1, turnCount: 12, maxTurns: 30, updatedAt: at(9) },
    stages: [
      record("reproduce", { status: "completed", startedAt: at(1), endedAt: at(4) }),
      record("cause", { status: "running", attempt: 1, startedAt: at(4), endedAt: at(5) }),
      record("cause", { status: "running", attempt: 2, startedAt: at(6) }),
    ],
    events: [
      { id: "billing-route", agentRunId: created.agentRun.id, sequence: 1, kind: "turn-started", idempotencyKey: "billing-dispatch",
        detail: { stageId: "cause", attempt: 2, routeSelection: { version: 1, source: "adaptive",
          previous: { providerId: "codex", model: "gpt-5.5" }, selected: { providerId: "codex", model: "gpt-6.1-sol" },
          requestedEffort: "high", effortSource: "auto", inputs: { quota: "not-provided", catalog: "not-provided", availability: "not-provided" } } }, createdAt: at(9) },
      { id: "billing-linked", agentRunId: created.agentRun.id, sequence: 2, kind: "turn-linked", idempotencyKey: "billing-dispatch:linked",
        detail: { stageId: "cause", attempt: 2, turnId: "billing-turn" }, createdAt: at(9) },
    ],
    report: null,
    resources: { rootRunId: created.agentRun.id, teamTurns: 30,
      policy: { version: 2, profile: "balanced", providerId: "codex", allowedModels: ["gpt-5.5"], modelLocked: false, effortLocked: false,
        initialEffort: "high", teamTurns: 30, concurrentHelpers: 3, totalHelpers: 8, parentReserve: 1, maxChanges: 2, cooldownTurns: 2 },
      spent: 12, reserved: 4, remaining: 14, helpersLaunched: 3, activeHelpers: 2, reservations: [] },
  };
  const runs: Record<string, AgentRunDetail> = { [billingRun.agentRun.id]: billingRun };

  const message: TarsMessage = { id: "message-delegate", requestId: "request-delegate", text: "Fix the billing export when the invoice list is empty.",
    providerId: "codex", model: "gpt-5.5", maxTurns: 30, revision: 2, state: "answered",
    reply: "I delegated the fix to the Debugger agent. It reproduces the failure first, then finds the cause before changing code.",
    decision: { reply: "I delegated the fix to the Debugger agent. It reproduces the failure first, then finds the cause before changing code.",
      actions: [{ kind: "delegate", workspaceId: billing.workspaceId, title: billing.title, instruction: billing.instruction,
        acceptanceCriteria: billing.acceptanceCriteria, priority: billing.priority, agentId: "debugger",
        reason: "The failure only shows on empty lists, so the Debugger reproduces it before changing code." }] },
    error: null, createdAt: at(1), updatedAt: at(1) };
  const receipt: TarsActionReceipt = { messageId: message.id, actionIndex: 0, requestHash: "c".repeat(64), action: TarsWorkActionSchema.parse(message.decision!.actions[0]),
    status: "applied", responsibilityId: billing.id, error: null, reason: null, revision: 2, createdAt: at(1), updatedAt: at(1) };
  const activity: TarsActivity[] = [
    { id: "activity-billing-running", responsibilityId: billing.id, revision: 2, title: billing.title, state: "running", detail: null, createdAt: at(2) },
    { id: "activity-docs-completed", responsibilityId: docs.id, revision: 5, title: docs.title, state: "completed", detail: null, createdAt: at(3) },
  ];
  return { responsibilities, pendingDecisions, attentionItems, runs, message, receipt, activity, ids: { release: release.id, billing: billing.id, migration: migration.id, docs: docs.id } };
}
