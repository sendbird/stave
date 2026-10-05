import { i18n } from "@/i18n/runtime";
/**
 * What an agent run tells the lead task's agent: the stage prompt, the reminder
 * after a turn that ended without a report, the retrieved-context part that
 * names the agent run, and the read-only briefing `stave_get_agent_run` returns.
 *
 * Agent run and stage identity never appear in any of these. The host resolves
 * them from the turn's agent run grant, so a model cannot report for another
 * stage.
 *
 * Pure. Used by `electron/host-service/supervision/agent-run-runtime.ts`.
 */
import type { AutomationPermissionMode } from "@/lib/automations";
import {
  compileStagePrompt,
  type AcceptanceCriterion,
  type PriorStageSummary,
} from "@/lib/workflows/stage-prompt";
import type {
  CanonicalRetrievedContextPart,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  currentStageRecord,
  latestStageRecord,
  workflowStageAt,
  type AgentRunAggregate,
  type StageStatus,
} from "./domain";
import { AGENT_RUN_PLAN_INSTRUCTION, hasAgentOrigin } from "./agent-run";
import { describeActionEvidence, isVerifiedEvidence } from "./evidence";
import type { StageTurnReason } from "./policy";

export const AGENT_RUN_TOOL_NAMES = Object.freeze({
  get: "stave_get_agent_run",
  report: "stave_report_stage",
  block: "stave_block_stage",
});

export const AGENT_RUN_CONTEXT_SOURCE_ID = "stave:agent-run";

/**
 * Why the supervisor started a turn: a stage turn, the one reminder, or a
 * turn a Stave action asked for.
 */
export type AgentRunTurnReason = StageTurnReason | "nudge" | "repair-checks";

const TURN_REASON_LINES: Record<AgentRunTurnReason, string> = {
  "stage-start": "This turn starts the stage.",
  "continue-after-user":
    "The user replied during this stage. Treat their latest message as guidance and continue the stage.",
  "reporting-restored":
    "Stave's local tools are reachable again, so this turn resumes the stage.",
  "resume-after-restart":
    "Stave stopped while the previous turn of this stage ran, so this turn resumes the stage. Check what that turn already did before you continue.",
  nudge: "The previous turn ended without a stage report.",
  "repair-checks": "Checks failed on the pull request, so the Watch checks action asked for a repair.",
};

const STAGE_TURN_CLOSING = `Before this turn ends, report through \`${AGENT_RUN_TOOL_NAMES.report}\`, or \`${AGENT_RUN_TOOL_NAMES.block}\` when you cannot finish. Do not ask a question you cannot get answered.`;
const ACTION_TURN_CLOSING =
  "Commit your fix before this turn ends. Stave pushes the branch and watches the checks again afterwards; this turn reports no stage. Do not ask a question you cannot get answered.";

/** Summaries of the stages before the current one, in workflow order. */
export function collectPriorStageSummaries(
  aggregate: AgentRunAggregate,
): PriorStageSummary[] {
  const { agentRun, stages } = aggregate;
  const summaries: PriorStageSummary[] = [];
  for (let index = 0; index < agentRun.currentStageIndex; index += 1) {
    const stage = workflowStageAt(agentRun, index);
    const record = latestStageRecord(stages, stage.id);
    if (record?.status === "skipped") {
      // i18n-ignore: model-facing run briefing context
      summaries.push({ title: stage.title, summary: "Skipped by the user." });
      continue;
    }
    if (record?.status !== "completed") continue;
    if (record.facts?.action) {
      summaries.push({
        title: stage.title,
        summary: describeActionEvidence(record.facts.action, undefined, i18n.getFixedT("en")).label,
      });
      continue;
    }
    if (record.report?.outcome === "complete") {
      summaries.push({ title: stage.title, summary: record.report.summary });
    }
  }
  return summaries;
}

/**
 * The goal criteria reported by prior stages, updated by matching reports and
 * observed script checks. A later stage's statuses are not carried
 * back when "Ask for changes" reruns an earlier stage, because the change can
 * invalidate them.
 */
export function collectAcceptanceCriteria(
  aggregate: AgentRunAggregate,
  includeCurrent = false,
): AcceptanceCriterion[] {
  const { agentRun, stages } = aggregate;
  let criteria: AcceptanceCriterion[] = [];
  for (let index = 0; index < agentRun.currentStageIndex + Number(includeCurrent); index += 1) {
    const record = latestStageRecord(stages, workflowStageAt(agentRun, index).id);
    const stage = workflowStageAt(agentRun, index);
    const observed = stage.kind === "action" && record?.facts?.action?.type === "run-script"
      ? (stage.acceptanceCriteria ?? []).map((criterion) => ({ text: criterion.text, required: criterion.required, status: isVerifiedEvidence(describeActionEvidence(record.facts!.action!, record.facts)) ? "met" as const : "unverified" as const })) : [];
    const reported = record?.report?.outcome === "complete" ? record.report.acceptanceCriteria ?? [] : [];
    const updates = [...reported, ...observed];
    if (updates.length) {
      if (stage.kind === "ai" && stage.role === "plan") criteria = [];
      for (const incoming of updates) {
        const position = criteria.findIndex((criterion) => criterion.text.trim() === incoming.text.trim());
        if (position < 0) criteria.push(incoming);
        else criteria[position] = { ...incoming, ...(incoming.required === false && criteria[position]?.required !== false ? { required: true } : {}) };
      }
    }
  }
  return criteria;
}

/** The prompt of a turn for the agent run's current AI stage. */
export function compileAgentRunStagePrompt(
  aggregate: AgentRunAggregate,
  agentNames?: Readonly<Record<string, string>>,
): string {
  const record = currentStageRecord(aggregate);
  return compileStagePrompt({
    ...(agentNames ? { agentNames } : {}),
    workflow: aggregate.agentRun.workflow,
    stageIndex: aggregate.agentRun.currentStageIndex,
    assignment: aggregate.agentRun.assignment,
    priorStages: collectPriorStageSummaries(aggregate),
    acceptanceCriteria: collectAcceptanceCriteria(aggregate),
    attempt: record.attempt,
    ...(record.feedback ? { feedback: record.feedback } : {}),
  });
}

/** The one reminder after an agent run turn ended without a stage report. */
export function buildStageNudgePrompt(aggregate: AgentRunAggregate): string {
  const stage = workflowStageAt(aggregate.agentRun, aggregate.agentRun.currentStageIndex);
  return [
    `You ended the last turn without reporting the stage "${stage.title}".`,
    `If the stage is done, call \`${AGENT_RUN_TOOL_NAMES.report}\` now with a summary, the evidence you gathered, and the status of each acceptance criterion.`,
    `If you cannot finish it, call \`${AGENT_RUN_TOOL_NAMES.block}\` and name exactly what is missing.`,
    "Do not start later stages.",
  ].join("\n\n");
}

/**
 * Tells the agent an agent run started this turn and why. Without it an agent run
 * turn reads like the user typing, and the agent asks questions nobody is
 * present to answer.
 */
export function buildAgentRunTurnContextPart(args: {
  aggregate: AgentRunAggregate;
  reason: AgentRunTurnReason;
}): CanonicalRetrievedContextPart {
  const { agentRun } = args.aggregate;
  const stage = workflowStageAt(agentRun, agentRun.currentStageIndex);
  const record = currentStageRecord(args.aggregate);
  const position = `stage ${agentRun.currentStageIndex + 1} of ${agentRun.workflow.stages.length}: ${stage.title}, attempt ${record.attempt}.`;
  return {
    type: "retrieved_context",
    sourceId: AGENT_RUN_CONTEXT_SOURCE_ID,
    // i18n-ignore: model-facing run briefing context
    title: "Agent Run Stage",
    content: [
      "A Stave agent run started this turn. The user did not type this message and may not be watching.",
      // An agent run's workflow is named after its agent; a legacy run's after its saved workflow.
      hasAgentOrigin(agentRun)
        ? `Agent: ${agentRun.workflow.name}. Workflow ${position}`
        : `Workflow: ${agentRun.workflow.name}. Stage ${position.slice("stage ".length)}`,
      TURN_REASON_LINES[args.reason],
      // Stage prompts already include the implicit workflow's plan instruction.
      ...(hasAgentOrigin(agentRun) && (args.reason === "nudge" || args.reason === "repair-checks" ||
        stage.kind !== "ai" || !stage.instruction.includes(AGENT_RUN_PLAN_INSTRUCTION)) ? [AGENT_RUN_PLAN_INSTRUCTION] : []),
      args.reason === "repair-checks" ? ACTION_TURN_CLOSING : STAGE_TURN_CLOSING,
    ].join("\n"),
  };
}

export interface AgentRunBriefingStage {
  position: number;
  title: string;
  kind: "ai" | "action";
  status: StageStatus;
  current: boolean;
}

/** What `stave_get_agent_run` returns: read-only, and without any ids. */
export interface AgentRunBriefing {
  workflow: { name: string; purpose: string; constraints: string | null };
  assignment: string;
  stages: AgentRunBriefingStage[];
  currentStage: {
    position: number;
    title: string;
    instruction: string | null;
    doneWhen: string | null;
    attempt: number;
    feedback: string | null;
  };
  earlierStages: PriorStageSummary[];
  acceptanceCriteria: AcceptanceCriterion[];
  reporting: string;
}

export function buildAgentRunBriefing(aggregate: AgentRunAggregate): AgentRunBriefing {
  const { agentRun } = aggregate;
  const current = workflowStageAt(agentRun, agentRun.currentStageIndex);
  const record = currentStageRecord(aggregate);
  return {
    workflow: {
      name: agentRun.workflow.name,
      purpose: agentRun.workflow.purpose,
      constraints: agentRun.workflow.constraints?.trim() || null,
    },
    assignment: agentRun.assignment,
    stages: agentRun.workflow.stages.map((stage, index) => ({
      position: index + 1,
      title: stage.title,
      kind: stage.kind,
      status: latestStageRecord(aggregate.stages, stage.id)?.status ?? "pending",
      current: index === agentRun.currentStageIndex,
    })),
    currentStage: {
      position: agentRun.currentStageIndex + 1,
      title: current.title,
      instruction: current.kind === "ai" ? current.instruction : null,
      doneWhen: current.kind === "ai" ? current.doneWhen : null,
      attempt: record.attempt,
      feedback: record.feedback,
    },
    earlierStages: collectPriorStageSummaries(aggregate),
    acceptanceCriteria: collectAcceptanceCriteria(aggregate),
    reporting: `Call \`${AGENT_RUN_TOOL_NAMES.report}\` before this turn ends, or \`${AGENT_RUN_TOOL_NAMES.block}\` when you cannot finish the stage.`,
  };
}

/**
 * The provider permissions an agent run turn runs with, from the permission mode
 * the user chose at start. Guided asks before sensitive actions, and the
 * agent run waits on the approval in the task; Auto runs without prompts;
 * "Your settings" (stored as `manual`) runs with the user's own provider
 * permission settings, as the host read them (`userSettingsPermissionOptions`),
 * never the runtime's fallbacks.
 */
export function agentRunPermissionRuntimeOptions(
  providerId: ProviderId,
  permissionMode: AutomationPermissionMode,
  userPermissionOptions?: ProviderRuntimeOptions,
): ProviderRuntimeOptions {
  if (permissionMode === "manual") return { ...userPermissionOptions };
  if (providerId === "codex") {
    return { codexApprovalPolicy: permissionMode === "auto" ? "never" : "untrusted" };
  }
  return permissionMode === "auto"
    ? { claudePermissionMode: "bypassPermissions", claudeAllowDangerouslySkipPermissions: true }
    : { claudePermissionMode: "default", claudeAllowDangerouslySkipPermissions: false };
}
