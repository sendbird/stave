import { i18n } from "@/i18n/runtime";
import { formatList } from "@/i18n/format";
import type { AgentPermission } from "@/lib/agents/schema";
import { withoutCodexAutoReview } from "@/lib/providers/codex-runtime-options";
import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { isCodexAutoReview } from "@/lib/policy/turn-policy";
import { STAVE_ACTION_LABELS, type CheckIns, type Workflow, type WorkflowStage } from "@/lib/workflows/schema";
import { AGENT_RUN_DEFAULT_DONE_WHEN } from "./agent-run";
import { agentRunPermissionRuntimeOptions } from "./briefing";
import { stageHasExternalEffect } from "./domain";
import { resolveConsentStageSignOff } from "./policy";
import { getStageDisplayTitle } from "./stage-display";
import { workspaceCheckMode } from "./workspace-check";

/**
 * What a run is allowed and expected to do, in four lines: where it runs,
 * what it may change, when it is done and when it comes back to you. Shown
 * before the send that starts a run and in the run's header, from the same
 * workflow, consent and turn cap the run starts with.
 */
export interface RunContractInput {
  /** The task's workspace; null when unknown. */
  workspace: { name: string; branch: string | null; worktree: boolean } | null;
  /** The agent's saved permission; null when unknown. */
  permission: AgentPermission | null;
  /** The provider the run's turns use; null when unknown (the line then follows the permission alone). */
  providerId?: ProviderId | null;
  /** Whether the selected Codex has its reviewer for Auto; null when unknown. */
  codexAutoReview?: boolean | null;
  workflow: Pick<Workflow, "stages" | "checkIns">;
  authorizedEffectStageIds: readonly string[];
  maxTurns: number;
  /**
   * The default workspace check admission may add: whether it applies to this
   * agent, and the workspace's action scripts (null when they are unknown).
   */
  defaultCheck?: { applies: boolean; scriptIds: readonly string[] | null };
}

export interface RunContract {
  where: string;
  change: string[];
  done: string[];
  comesBack: string[];
}

function effectName(stage: WorkflowStage): string {
  return stage.kind === "action" ? STAVE_ACTION_LABELS[stage.action.type] : getStageDisplayTitle(stage);
}

function describeWhere(workspace: RunContractInput["workspace"]): string {
  if (!workspace) return i18n.t("agentRuns:runContract.where.unknown");
  const place = workspace.worktree ? i18n.t("agentRuns:runContract.where.worktree") : i18n.t("agentRuns:runContract.where.repository");
  return workspace.branch
    ? i18n.t("agentRuns:runContract.where.withBranch", { workspace: workspace.name, branch: workspace.branch, place })
    : i18n.t("agentRuns:runContract.where.withoutBranch", { workspace: workspace.name, place });
}

/**
 * The approval options a run's turns apply for its permission: the run's
 * permission options, then, for Codex without its reviewer, the fallback the
 * runtime applies (`on-request` + `auto_review` back to `never`).
 */
export function resolveRunApprovalOptions(args: {
  providerId: ProviderId | null;
  permission: AgentPermission | null;
  codexAutoReview: boolean | null;
}): ProviderRuntimeOptions {
  if (!args.providerId || !args.permission || args.permission === "read-only") return {};
  const requested = agentRunPermissionRuntimeOptions(args.providerId, args.permission, undefined);
  return args.providerId === "codex" && args.codexAutoReview === false ? withoutCodexAutoReview(requested, true) : requested;
}

/** The first "may change" line, from the options the run applies. */
function describeApprovals(input: RunContractInput): string {
  if (input.permission === "read-only") return i18n.t("agentRuns:runContract.change.readOnly");
  if (input.permission !== "auto") return i18n.t("agentRuns:runContract.change.edits");
  if (input.providerId !== "codex") return i18n.t("agentRuns:runContract.change.auto");
  const applied = resolveRunApprovalOptions({ providerId: "codex", permission: "auto", codexAutoReview: input.codexAutoReview ?? null });
  return isCodexAutoReview(applied) ? i18n.t("agentRuns:runContract.change.auto") : i18n.t("agentRuns:runContract.change.autoWithoutReviewer");
}

function describeChange(input: RunContractInput): string[] {
  const lines = [describeApprovals(input)];
  if (input.permission !== "read-only") lines.push(i18n.t("agentRuns:runContract.change.guardrails"));
  const effects = input.workflow.stages.filter(stageHasExternalEffect);
  const allowed = effects.filter((stage) => input.authorizedEffectStageIds.includes(stage.id)).map(effectName);
  const asks = effects.filter((stage) => !input.authorizedEffectStageIds.includes(stage.id)).map(effectName);
  if (allowed.length) lines.push(i18n.t("agentRuns:runContract.change.effectsAllowed", { effects: formatList(allowed) }));
  if (asks.length) lines.push(i18n.t("agentRuns:runContract.change.effectsAsk", { effects: formatList(asks) }));
  return lines;
}

function describeDone(input: RunContractInput): string[] {
  const { stages } = input.workflow;
  const ai = stages.filter((stage) => stage.kind === "ai");
  const lines: string[] = [];
  if (stages.length === 1 && ai.length === 1) {
    const doneWhen = ai[0]!.doneWhen;
    lines.push(doneWhen === AGENT_RUN_DEFAULT_DONE_WHEN ? i18n.t("agentRuns:runContract.done.default") : i18n.t("agentRuns:runContract.done.when", { doneWhen }));
  } else {
    lines.push(i18n.t("agentRuns:runContract.done.stages", { count: stages.length, stages: stages.map(getStageDisplayTitle).join(" → ") }));
  }
  for (const stage of ai) {
    for (const criterion of stage.acceptanceCriteria ?? []) {
      if (criterion.verification !== "stave-check" || criterion.required === false) continue;
      const ids = criterion.scriptIds ?? [];
      if (!ids.length) continue;
      lines.push(workspaceCheckMode(criterion) === "all" && ids.length > 1
        ? i18n.t("agentRuns:runContract.done.checkAll", { scripts: formatList(ids) })
        : i18n.t("agentRuns:runContract.done.checkAny", { scripts: formatList(ids, { type: "disjunction" }) }));
    }
  }
  const hasCheck = ai.some((stage) => stage.acceptanceCriteria?.some((criterion) => criterion.verification === "stave-check" && criterion.required !== false));
  if (input.defaultCheck?.applies && !hasCheck) {
    const scripts = input.defaultCheck.scriptIds;
    if (scripts === null) lines.push(i18n.t("agentRuns:runContract.done.defaultCheckUnknown"));
    else if (scripts.length) lines.push(i18n.t("agentRuns:runContract.done.defaultCheck", { scripts: formatList(scripts, { type: "disjunction" }) }));
  }
  return lines;
}

const CHECK_IN_KEYS = {
  "every-stage": "agentRuns:runContract.comesBack.everyStage",
  "plan-and-publishing": "agentRuns:runContract.comesBack.planAndPublishing",
  "when-stuck": "agentRuns:runContract.comesBack.whenStuck",
} as const satisfies Record<CheckIns, string>;

function describeComesBack(input: RunContractInput): string[] {
  const lines: string[] = [i18n.t(CHECK_IN_KEYS[input.workflow.checkIns])];
  const run = { workflow: { stages: input.workflow.stages }, consent: { checkIns: input.workflow.checkIns, authorizedEffectStageIds: [...input.authorizedEffectStageIds] } } as Parameters<typeof resolveConsentStageSignOff>[0];
  const asking = input.workflow.stages.flatMap((stage, index) => index > 0 && resolveConsentStageSignOff(run, index) === "ask" ? [getStageDisplayTitle(stage)] : []);
  if (asking.length) lines.push(i18n.t("agentRuns:runContract.comesBack.asksBefore", { stages: formatList(asking) }));
  lines.push(i18n.t("agentRuns:runContract.comesBack.questions"));
  lines.push(i18n.t("agentRuns:runContract.comesBack.stops", { count: input.maxTurns }));
  return lines;
}

export function buildRunContract(input: RunContractInput): RunContract {
  return { where: describeWhere(input.workspace), change: describeChange(input), done: describeDone(input), comesBack: describeComesBack(input) };
}
