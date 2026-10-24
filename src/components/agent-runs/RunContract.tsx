import { i18n, useTranslation } from "@/i18n";
import { memo, useId, useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { Flag, MapPin, PencilLine, Undo2, type LucideIcon } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { shelfStyles } from "@/components/session/composer-shelf/composer-shelf.styles";
import { readyWorkspaceScripts, useWorkspaceScriptActions } from "@/components/workflows/useWorkspaceScriptActions";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { agentRunPromptFit, buildAgentRunAssignment, buildAgentRunStartInput, planAgentPromptSendForFit, type AgentRunPromptFit } from "@/lib/agent-runs/agent-run";
import { AGENT_RUN_LIMITS, isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { buildRunContract, buildRunContractSummary, confirmedApprovalsOfRun, type RunContract, type RunContractInput } from "@/lib/agent-runs/run-contract";
import { defaultWorkspaceCheckApplies } from "@/lib/agent-runs/workspace-check";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import { usePendingAutoRoutingStore } from "@/store/pending-auto-routing-store";
import { buildPromptDraftContentForSend } from "@/store/prompt-draft-message-content";
import { useRunStartNoticeStore } from "@/store/run-start-notice-store";
import type { PromptDraft } from "@/types/chat";

const SECTIONS: Array<{ key: keyof RunContract; icon: LucideIcon; label: "agentRuns:runContract.label.where" | "agentRuns:runContract.label.change" | "agentRuns:runContract.label.done" | "agentRuns:runContract.label.comesBack" }> = [
  { key: "where", icon: MapPin, label: "agentRuns:runContract.label.where" },
  { key: "change", icon: PencilLine, label: "agentRuns:runContract.label.change" },
  { key: "done", icon: Flag, label: "agentRuns:runContract.label.done" },
  { key: "comesBack", icon: Undo2, label: "agentRuns:runContract.label.comesBack" },
];

/** A contract value: its first sentence, then the rest as quieter lines under it. */
function ContractValue(props: { value: string | string[] }) {
  const [first, ...rest] = Array.isArray(props.value) ? props.value : [props.value];
  return (
    <dd className={sx(styles.value)}>
      {first}
      {rest.map((line) => <span key={line} className={sx(styles.subline)}>{line}</span>)}
    </dd>
  );
}

function ContractList(props: { contract: RunContract }) {
  return (
    <dl className={sx(styles.list)}>
      {SECTIONS.map(({ key, icon: Icon, label }) => (
        <div key={key} className={sx(styles.row)}>
          <dt className={sx(styles.label)}>
            <Icon aria-hidden className={sx(styles.icon)} />
            {i18n.t(label)}
          </dt>
          <ContractValue value={props.contract[key]} />
        </div>
      ))}
    </dl>
  );
}

/** The four lines of a run contract, each under its label. */
export function RunContractView(props: { title: string; contract: RunContract; testId?: string }) {
  useTranslation();
  return (
    <section className={sx(styles.contract)} aria-label={props.title} data-testid={props.testId}>
      <p className={sx(styles.title)}>{props.title}</p>
      <ContractList contract={props.contract} />
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

/** What a draft carries that a run handles on its own terms; counts across staged prompt items too. */
export interface RunStartDraftAttachments {
  /** Workspace file paths the run reads from disk. */
  filePaths: number;
  /** Images and context attachments the run keeps (Lens annotations excluded). */
  context: number;
}

/**
 * The draft as the run-start line reads it: whether its prompt can be an
 * assignment (measured on the assignment the send builds, file paths
 * included) and what it attaches, across staged prompt items too.
 */
export function describeRunStartDraft(draft: Pick<PromptDraft, "text" | "attachedFilePaths" | "attachments" | "promptBatch">): RunStartDraftAttachments & { promptFit: AgentRunPromptFit } {
  const batch = draft.promptBatch ?? [];
  const filePaths = new Set([...draft.attachedFilePaths, ...batch.flatMap((item) => item.attachedFilePaths ?? [])]).size;
  const context = [...draft.attachments, ...batch.flatMap((item) => item.attachments ?? [])]
    .filter((attachment) => attachment.kind !== "lens-annotations").length;
  return { promptFit: agentRunPromptFit(buildAgentRunAssignment(buildPromptDraftContentForSend(draft), draft)), filePaths, context };
}

/**
 * The draft as the shelf's props, memoized: primitives, so the memoized shelf
 * re-renders when they change, not on every keystroke.
 */
export function useRunStartDraft(text: string, draft: Pick<PromptDraft, "attachedFilePaths" | "attachments" | "promptBatch">) {
  const { attachedFilePaths, attachments, promptBatch } = draft;
  const described = useMemo(
    () => describeRunStartDraft({ text, attachedFilePaths, attachments, promptBatch }),
    [text, attachedFilePaths, attachments, promptBatch],
  );
  return { draftPromptFit: described.promptFit, draftFilePaths: described.filePaths, draftContextAttachments: described.context };
}

/**
 * Whether sending the draft starts an agent run, decided as the send path
 * decides it (`planAgentPromptSend`), from primitives so the memoized shelf
 * does not re-render on every keystroke.
 */
export function useRunStartPlanned(args: { taskId: string; providerId: string | undefined; promptFit: AgentRunPromptFit }): boolean {
  const { taskId } = args;
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId);
  const turnActive = useAppStore((state) => Boolean(workspaceId === state.activeWorkspaceId
    ? state.activeTurnIdsByTask[taskId] : state.workspaceRuntimeCacheById[workspaceId]?.activeTurnIdsByTask[taskId]));
  const taskRunsAsAgent = useAgentAssignmentsStore((state) => Boolean(state.byTaskId[taskId]));
  const runActive = useAgentRunsStore((state) => {
    if (state.loadedWorkspaceId !== workspaceId) return false;
    const id = state.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
    const run = id ? state.details[id]?.agentRun : undefined;
    return Boolean(run && isActiveAgentRunState(run.state));
  });
  const runPending = usePendingAutoRoutingStore((state) => Boolean(state.byTaskId[taskId]?.agentRun));
  if (!args.providerId) return false;
  return planAgentPromptSendForFit({
    taskRunsAsAgent, runActive: runActive || runPending, turnActive, queued: false,
    turnOrigin: "conversation", providerId: args.providerId, promptFit: args.promptFit,
  }).kind === "start-run";
}

/**
 * The shelf line before the send that starts a run: which agent takes it, how
 * far it acts on its own, when it checks in and its turn cap, with the full
 * contract under Details. Built from the agent's workflow, check-ins and turn
 * cap exactly as the start builds them. Details stay open or closed for every
 * task until changed.
 */
export const RunStartNotice = memo(function RunStartNotice(props: { taskId: string; attachments: RunStartDraftAttachments }) {
  useTranslation();
  const { taskId } = props;
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId);
  const agent = useAgentAssignmentsStore((state) => state.byTaskId[taskId]);
  const workspace = useContractWorkspace(workspaceId);
  const scripts = useWorkspaceScriptActions();
  const codexAutoReview = useCodexAutoReview();
  const open = useRunStartNoticeStore((state) => state.detailsOpen);
  const setOpen = useRunStartNoticeStore((state) => state.setDetailsOpen);
  const detailsId = useId();
  const scriptIds = scripts.available && scripts.state.status === "ready" ? readyWorkspaceScripts(scripts).map((script) => script.id) : null;
  // The run this send would start, exactly as the start builds it; the words are built at render.
  const start = useMemo(() => agent ? buildAgentRunStartInput({
    workspaceId,
    taskId,
    agent: {
      name: agent.agentName, workflow: agent.agentWorkflow, checkIns: agent.agentCheckIns, permission: agent.agentPermission, tools: agent.agentTools,
      ...(agent.agentReviewBeforeDone ? { reviewBeforeDone: agent.agentReviewBeforeDone } : {}),
    },
    assignment: "",
    now: new Date(),
  }) : null, [agent, workspaceId, taskId]);
  if (!agent || !start) return null;
  const input: RunContractInput = {
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
  };
  const summary = buildRunContractSummary(input);
  // Named as the selector beside it names the task's agent.
  const title = i18n.t("agentRuns:runContract.notice.title", { agent: agent.agentName });
  const attachmentItem = props.attachments.filePaths > 0
    ? i18n.t("agentRuns:runContract.summary.filePaths")
    : props.attachments.context > 0
      ? i18n.t("agentRuns:runContract.summary.attachments", { count: props.attachments.context })
      : null;
  const attachmentDetail = props.attachments.filePaths > 0
    ? i18n.t("agentRuns:agentRunSend.attachedFilePaths")
    : props.attachments.context > 0
      ? i18n.t("session:agentAttachmentNotice.agentAttachmentNotice")
      : null;
  const plain = [title, summary.permission.text, summary.checkIns, attachmentItem ?? summary.turns].join(" · ");
  return (
    <div data-testid="run-contract-notice" data-details={open ? "open" : "closed"}>
      <div className={sx(shelfStyles.line)} role="group" aria-label={i18n.t("agentRuns:runContract.notice.ariaLabel")}>
        <span className={sx(shelfStyles.mark)}>
          <AgentAvatar agent={agent.agentSnapshot} size="xs" aria-label={null} />
        </span>
        <p className={sx(shelfStyles.text)} title={plain}>
          <span className={sx(shelfStyles.label)}>{title}</span>
          {" · "}
          <span className={sx(summary.permission.warning && shelfStyles.caution)} data-testid="run-contract-notice-permission" data-warning={summary.permission.warning || undefined}>
            {summary.permission.text}
          </span>
          {/* Narrow rows drop the turn cap first, then the check-in and attachments (Details keeps both); the title and permission stay. */}
          <span className={sx(styles.checkIns)}>{" · "}{summary.checkIns}</span>
          {attachmentItem
            ? <span className={sx(styles.checkIns)}>{" · "}{attachmentItem}</span>
            : <span className={sx(styles.turns)}>{" · "}{summary.turns}</span>}
        </p>
        <span className={sx(shelfStyles.actions)}>
          <Button
            variant="quiet"
            size="xs"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
            xstyle={shelfStyles.quiet}
          >
            {open ? i18n.t("agentRuns:runContract.notice.hideDetails") : i18n.t("agentRuns:runContract.notice.showDetails")}
          </Button>
        </span>
      </div>
      {open ? <RunStartDetails id={detailsId} contract={buildRunContract(input)} attachments={attachmentDetail} /> : null}
    </div>
  );
});

/**
 * Under the run-start line, only what the line does not already say: what
 * the permission covers and what needs your sign-off, when the run counts as
 * done (unless that is the default), the stages that ask first, and how
 * attachments travel. The workspace is the bar under the composer; the
 * check-in and the turn cap are the line.
 */
function RunStartDetails(props: { id: string; contract: RunContract; attachments: string | null }) {
  // comesBack is [check-in, stages that ask first?, questions?, turn cap]: the ends are on the line.
  const comesBack = props.contract.comesBack.slice(1, -1);
  // "Complete and verified" is every run's default; only a stated condition, stages or checks say something.
  const done = props.contract.done.filter((line) => line !== i18n.t("agentRuns:runContract.done.default"));
  const rows: Array<{ label: string; value: string[] | string }> = [
    { label: i18n.t("agentRuns:runContract.label.change"), value: props.contract.change },
    ...(done.length ? [{ label: i18n.t("agentRuns:runContract.label.done"), value: done }] : []),
    ...(comesBack.length ? [{ label: i18n.t("agentRuns:runContract.label.comesBack"), value: comesBack }] : []),
    ...(props.attachments ? [{ label: i18n.t("agentRuns:runContract.label.attachments"), value: props.attachments }] : []),
  ];
  return (
    <dl id={props.id} className={sx(styles.list, styles.details)}>
      {rows.map((row) => (
        <div key={row.label} className={sx(styles.row)}>
          <dt className={sx(styles.label)}>{row.label}</dt>
          <ContractValue value={row.value} />
        </div>
      ))}
    </dl>
  );
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

/** The shelf row is the container (`shelfStyles.row`); these steps keep the title and permission readable. */
const DROP_TURNS = "@container (max-width: 535px)";
const DROP_CHECK_INS = "@container (max-width: 400px)";

const styles = stylex.create({
  contract: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], minWidth: 0 },
  title: { margin: 0, fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  list: { margin: 0, display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: vars["--ads-space-12"], rowGap: vars["--ads-space-4"] },
  row: { display: "contents" },
  label: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-normal"], color: vars["--ads-color-text-muted"], whiteSpace: "nowrap" },
  icon: { width: 13, height: 13, flexShrink: 0, marginTop: 2 },
  value: { margin: 0, minWidth: 0, fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-normal"], color: vars["--ads-color-text"], overflowWrap: "anywhere" },
  subline: { display: "block", color: vars["--ads-color-text-muted"] },
  /** Under the line, aligned with its words: row padding + the 20px mark + the gap. */
  details: {
    paddingBlockEnd: vars["--ads-space-8"],
    paddingInlineEnd: vars["--ads-space-12"],
    paddingInlineStart: `calc(${vars["--ads-space-12"]} + 20px + ${vars["--ads-space-8"]})`,
  },
  turns: { display: { default: "inline", [DROP_TURNS]: "none" } },
  checkIns: { display: { default: "inline", [DROP_CHECK_INS]: "none" } },
});
