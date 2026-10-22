import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { Flag, MapPin, PencilLine, Undo2, type LucideIcon } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { readyWorkspaceScripts, useWorkspaceScriptActions } from "@/components/workflows/useWorkspaceScriptActions";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { buildAgentRunStartInput } from "@/lib/agent-runs/agent-run";
import { AGENT_RUN_LIMITS } from "@/lib/agent-runs/domain";
import { buildRunContract, confirmedApprovalsOfRun, type RunContract, type RunContractInput } from "@/lib/agent-runs/run-contract";
import { defaultWorkspaceCheckApplies } from "@/lib/agent-runs/workspace-check";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";

const SECTIONS: Array<{ key: keyof RunContract; icon: LucideIcon; label: "agentRuns:runContract.label.where" | "agentRuns:runContract.label.change" | "agentRuns:runContract.label.done" | "agentRuns:runContract.label.comesBack" }> = [
  { key: "where", icon: MapPin, label: "agentRuns:runContract.label.where" },
  { key: "change", icon: PencilLine, label: "agentRuns:runContract.label.change" },
  { key: "done", icon: Flag, label: "agentRuns:runContract.label.done" },
  { key: "comesBack", icon: Undo2, label: "agentRuns:runContract.label.comesBack" },
];

/** The four lines of a run contract, each under its label. */
export function RunContractView(props: { title: string; contract: RunContract; testId?: string }) {
  useTranslation();
  return (
    <section className={sx(styles.contract)} aria-label={props.title} data-testid={props.testId}>
      <p className={sx(styles.title)}>{props.title}</p>
      <dl className={sx(styles.list)}>
        {SECTIONS.map(({ key, icon: Icon, label }) => {
          const value = props.contract[key];
          return (
            <div key={key} className={sx(styles.row)}>
              <dt className={sx(styles.label)}>
                <Icon aria-hidden className={sx(styles.icon)} />
                {i18n.t(label)}
              </dt>
              <dd className={sx(styles.value)}>{Array.isArray(value) ? value.join(" ") : value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * Whether the selected Codex has its reviewer for Auto; null until Codex was
 * checked (before that, its capabilities are only the empty defaults).
 */
function useCodexAutoReview(): boolean | null {
  return useAppStore((state) => (state.providerAvailability.codex ? (state.providerRuntimeCapabilities.codex?.approval.autoClassifierPolicy ?? null) : null));
}

/** A workspace as the contract names it; null until the workspace is known. */
function useContractWorkspace(workspaceId: string): RunContractInput["workspace"] {
  const name = useAppStore((state) => state.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? null);
  const branch = useAppStore((state) => state.workspaceBranchById[workspaceId] ?? null);
  const isDefault = useAppStore((state) => state.workspaceDefaultById[workspaceId]);
  return useMemo(() => (name ? { name, branch, worktree: isDefault === false } : null), [name, branch, isDefault]);
}

/**
 * Before the send that starts a run: the contract of the run it would start,
 * built from the agent's workflow, check-ins and turn cap exactly as the
 * start builds them.
 */
export function RunContractNotice(props: { taskId: string; workspaceId: string }) {
  useTranslation();
  const agent = useAgentAssignmentsStore((state) => state.byTaskId[props.taskId]);
  const workspace = useContractWorkspace(props.workspaceId);
  const scripts = useWorkspaceScriptActions();
  const codexAutoReview = useCodexAutoReview();
  const scriptIds = scripts.available && scripts.state.status === "ready" ? readyWorkspaceScripts(scripts).map((script) => script.id) : null;
  // The run this send would start, exactly as the start builds it; the words are built at render.
  const start = useMemo(() => agent ? buildAgentRunStartInput({
    workspaceId: props.workspaceId,
    taskId: props.taskId,
    agent: {
      name: agent.agentName, workflow: agent.agentWorkflow, checkIns: agent.agentCheckIns, permission: agent.agentPermission, tools: agent.agentTools,
      ...(agent.agentReviewBeforeDone ? { reviewBeforeDone: agent.agentReviewBeforeDone } : {}),
    },
    assignment: "",
    now: new Date(),
  }) : null, [agent, props.workspaceId, props.taskId]);
  const contract = agent && start ? buildRunContract({
    workspace,
    permission: agent.agentPermission ?? null,
    providerId: agent.providerId ?? null,
    codexAutoReview,
    workflow: start.workflow,
    authorizedEffectStageIds: start.consent.authorizedEffectStageIds,
    maxTurns: start.maxTurns ?? AGENT_RUN_LIMITS.defaultMaxTurns,
    defaultCheck: {
      applies: defaultWorkspaceCheckApplies({ id: agent.agentConfigId, permission: agent.agentPermission, workflow: agent.agentWorkflow }),
      scriptIds,
    },
  }) : null;
  return contract ? <RunContractView title={i18n.t("agentRuns:runContract.notice.title")} contract={contract} testId="run-contract-notice" /> : null;
}

/** In the run's header: the contract the run started with. */
export function RunHeaderContract(props: { detail: AgentRunDetail }) {
  useTranslation();
  const { agentRun } = props.detail;
  const workspace = useContractWorkspace(agentRun.workspaceId);
  const permission = useAgentAssignmentsStore((state) => state.byTaskId[agentRun.leadTaskId]?.agentPermission ?? null);
  const codexAutoReview = useCodexAutoReview();
  const messages = useAppStore((state) => state.messagesByTask[agentRun.leadTaskId]);
  const confirmedApprovals = useMemo(() => confirmedApprovalsOfRun(messages, props.detail.events), [messages, props.detail.events]);
  const contract = buildRunContract({
    workspace,
    permission: permission ?? (agentRun.consent.permissionMode === "auto" ? "auto" : null),
    providerId: agentRun.fingerprint.providerId,
    codexAutoReview,
    confirmedApprovals,
    workflow: agentRun.workflow,
    authorizedEffectStageIds: agentRun.consent.authorizedEffectStageIds,
    maxTurns: agentRun.maxTurns,
  });
  return <RunContractView title={i18n.t("agentRuns:runContract.header.title")} contract={contract} testId="run-contract-header" />;
}

const styles = stylex.create({
  contract: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], minWidth: 0 },
  title: { margin: 0, fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  list: { margin: 0, display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: vars["--ads-space-12"], rowGap: vars["--ads-space-4"] },
  row: { display: "contents" },
  label: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"], whiteSpace: "nowrap" },
  icon: { width: 13, height: 13, flexShrink: 0, marginTop: 2 },
  value: { margin: 0, minWidth: 0, fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-normal"], color: vars["--ads-color-text"], overflowWrap: "anywhere" },
});
