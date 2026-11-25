import { useCallback, useMemo } from "react";
import { i18n } from "@/i18n";
import {
  progressFromExchange,
  stepsFromHistoryItems,
  stepsFromMessages,
  stepsFromProgressMessages,
  stepsFromSubagentParts,
  type AgentProgress,
  type AgentStepsResult,
} from "@/lib/agent-progress";
import {
  fromDelegatedTask,
  fromWorkGraphNode,
  isDelegationExchangeLive,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import { selectTaskSubagents } from "@/lib/delegation/subagent-summary";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import type { ProviderId } from "@/lib/providers/provider.types";
import { resolveDelegatedTaskControls, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { parseSubagentToolInput } from "@/lib/subagent-tool-input";
import { useDelegatedTaskRowController } from "@/components/session/DelegatedTaskRows";
import { useDelegatedTasks } from "@/components/session/useDelegatedTasks";
import type { AgentProgressTarget } from "@/store/agent-progress-panel-store";
import { useAppStore } from "@/store/app.store";
import type { ToolUsePart } from "@/types/chat";
import { revealInConversation, type AgentStepContext } from "./agent-progress-targets";
import { useAgentHistory } from "./use-agent-history";
import { useTaskMessages } from "./use-task-messages";

/** Everything the panel needs for one agent, read from the live stores. */
export interface AgentProgressController {
  progress: AgentProgress | null;
  loading: boolean;
  notice: string | null;
  /** Where the agent's own steps were read, for opening the agents it started. */
  context: AgentStepContext;
  hasOlder: boolean;
  onLoadOlder?: () => void;
  onOpenParent?: () => void;
  onStop?: () => void;
  stopBusy?: boolean;
  onOpenTask?: () => void;
  actionError?: string | null;
}

/** A delegation key reads as its prompt once the derived digest is dropped. */
export function describeDelegatedWork(child: Pick<DelegatedTaskSummary, "delegationKey">, title: string | undefined) {
  if (title?.trim()) return title.trim();
  const readable = child.delegationKey.replace(/-[0-9a-f]{12}$/, "").replace(/[-_.]+/g, " ").trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : child.delegationKey;
}

const useTaskTitle = (taskId: string | undefined) =>
  useAppStore((state) => (taskId ? state.tasks.find((task) => task.id === taskId)?.title : undefined));

const useWorkspacePath = (workspaceId: string | undefined) =>
  useAppStore((state) => (workspaceId ? state.workspacePathById[workspaceId] : undefined) ?? state.repositoryPath ?? undefined);

/**
 * A task's own conversation as steps: a delegated task's or a review's. The
 * saved pages are read again whenever `settleKey` changes, so the final
 * answer is there once the agent settles.
 */
export function useChildTaskSteps(args: {
  taskId: string | undefined;
  workspaceId: string | undefined;
  live: boolean;
  providerId?: ProviderId;
  settleKey?: string;
}) {
  const messages = useTaskMessages({ taskId: args.taskId, workspaceId: args.workspaceId, refreshKey: args.settleKey });
  const cwd = useWorkspacePath(messages.workspaceId);
  const read = useMemo<AgentStepsResult>(
    () => stepsFromMessages(messages.messages, {
      live: args.live,
      ...(cwd ? { cwd } : {}),
      ...(args.taskId ? { taskId: args.taskId } : {}),
      ...(messages.workspaceId ? { workspaceId: messages.workspaceId } : {}),
      ...(args.providerId ? { providerId: args.providerId } : {}),
    }),
    // Sentences are worded in the display language.
    [messages.messages, args.live, cwd, args.taskId, messages.workspaceId, args.providerId, i18n.language],
  );
  return { ...read, loading: messages.loading, hasOlder: messages.hasOlder, loadOlder: messages.loadOlder, error: messages.error, workspaceId: messages.workspaceId };
}

/**
 * An in-turn subagent (Claude or Codex): its header from the parent turn's
 * work graph and spawning call, its steps from the provider's saved
 * transcript when that can be read, else from the calls the parent recorded.
 */
export function useSubagentProgress(target: Extract<AgentProgressTarget, { kind: "subagent" }>): AgentProgressController {
  const taskId = target.parentTaskId;
  const messages = useTaskMessages({ taskId, workspaceId: target.parentWorkspaceId });
  const graph = useAppStore((state) =>
    state.providerTurnActivityByTask[taskId]?.workGraph ?? state.retainedTurnActivityByTask[taskId]?.snapshot.workGraph ?? null,
  );
  const sessions = useAppStore((state) => state.providerSessionByTask[taskId]);
  const cwd = useWorkspacePath(messages.workspaceId);
  const parentTitle = useTaskTitle(taskId);

  const owner = useMemo(() => messages.messages.find((message) => message.parts.some((part) =>
    part.type === "tool_use" && (target.toolUseId ? part.toolUseId === target.toolUseId : Boolean(target.agentId && part.agentId === target.agentId)))),
  [messages.messages, target.toolUseId, target.agentId]);
  const spawn = owner?.parts.find((part): part is ToolUsePart =>
    part.type === "tool_use" && (target.toolUseId ? part.toolUseId === target.toolUseId : part.agentId === target.agentId));

  const exchange = useMemo<DelegationExchange | null>(() => {
    const rows = owner ? selectTaskSubagents({ messages: [owner], workGraph: graph, includeSubagents: true }) : [];
    const match = rows.find((row) =>
      (target.toolUseId && row.ref.toolUseId === target.toolUseId) ||
      (target.agentId && row.ref.agentId === target.agentId) ||
      (target.nodeKey && row.ref.nodeKey === target.nodeKey));
    if (match) return match;
    const node = target.nodeKey ? graph?.nodesByKey[target.nodeKey] : undefined;
    if (node) return fromWorkGraphNode(node, graph);
    return target.snapshot ?? null;
  }, [owner, graph, target.toolUseId, target.agentId, target.nodeKey, target.snapshot]);

  const live = exchange ? isDelegationExchangeLive(exchange) : spawn ? spawn.state === "input-available" || spawn.state === "input-streaming" : false;
  const providerId = target.providerId ?? exchange?.identity.providerId ?? graph?.providerId ??
    (owner?.providerId && owner.providerId !== "user" ? owner.providerId : undefined);
  const agentId = target.agentId ?? spawn?.agentId ?? exchange?.ref.agentId;
  const accountProfileId = owner?.nativeAccountProfileId ?? "system-default";
  const sessionId = owner?.nativeProviderSessionId ??
    (providerId ? getProviderSessionCursor({ sessions, providerId, accountProfileId })?.nativeSessionId : undefined);
  const history = useAgentHistory({ providerId, sessionId, agentId, cwd, accountProfileId, live, enabled: true });

  const parsed = useMemo(() => (spawn ? parseSubagentToolInput({ input: spawn.input }) : null), [spawn]);
  const context = useMemo<AgentStepContext>(
    () => ({ taskId, ...(messages.workspaceId ? { workspaceId: messages.workspaceId } : {}) }),
    [taskId, messages.workspaceId],
  );
  const read = useMemo<AgentStepsResult>(() => {
    if (history.items.length > 0) {
      return stepsFromHistoryItems(history.items, { live, ...(cwd ? { cwd } : {}), ...(providerId ? { providerId } : {}) });
    }
    const options = { live, ...(cwd ? { cwd } : {}), ...context, ...(providerId ? { providerId } : {}) };
    const steps = stepsFromSubagentParts({ messages: messages.messages, toolUseId: target.toolUseId ?? spawn?.toolUseId, agentId, ...options });
    const reported = steps.length === 0
      ? stepsFromProgressMessages(spawn?.progressMessages ?? exchange?.outcome.progress ?? [], target.toolUseId ?? agentId ?? "subagent")
      : [];
    return { steps: [...steps, ...reported] };
    // Sentences are worded in the display language.
  }, [history.items, live, cwd, providerId, context, messages.messages, target.toolUseId, spawn, agentId, exchange, i18n.language]);

  const progress = useMemo(() => {
    if (!exchange) return null;
    const title = target.title?.trim() || parsed?.description || exchange.title;
    return progressFromExchange({ ...exchange, title }, {
      steps: read.steps,
      source: "subagent",
      ask: read.ask ?? parsed?.prompt ?? undefined,
      ...(read.result ? { result: read.result } : {}),
      // Codex names the task where Claude names the agent type; a task name is the title, not a kind.
      kindLabel: parsed?.subagentType && parsed.subagentType !== parsed.description
        ? parsed.subagentType
        : i18n.t("session:agentProgress.panel.kindSubagent"),
      parent: {
        label: parentTitle?.trim() || i18n.t("session:agentProgress.panel.thisTurn"),
        taskId,
        ...(target.toolUseId ? { toolUseId: target.toolUseId } : {}),
      },
      readOnly: true,
      ...(history.model ? { model: history.model } : {}),
      ...(history.effort ? { effort: history.effort } : {}),
    });
  }, [exchange, read, parsed, parentTitle, taskId, target.title, target.toolUseId, history.model, history.effort, i18n.language]);

  const toolUseId = target.toolUseId ?? spawn?.toolUseId;
  const onOpenParent = useCallback(() => {
    void revealInConversation({ taskId, ...(messages.workspaceId ? { workspaceId: messages.workspaceId } : {}), ...(toolUseId ? { toolUseId } : {}) });
  }, [taskId, messages.workspaceId, toolUseId]);

  const notice = history.error && history.items.length === 0
    ? i18n.t("session:agentProgress.panel.historyUnavailable", { detail: history.error })
    : !exchange && !messages.loading
      ? i18n.t("session:agentProgress.panel.notListed")
      : null;
  return {
    progress,
    loading: messages.loading || history.loading,
    notice,
    context,
    hasOlder: history.hasMore,
    ...(history.hasMore ? { onLoadOlder: history.loadMore } : {}),
    onOpenParent,
  };
}

/**
 * A delegated task: its header from the delegation ledger (the same row the
 * Subagents tab shows), its steps from the delegated task's own messages,
 * with the Stop and Open task controls its row offers.
 */
export function useDelegatedProgress(target: Extract<AgentProgressTarget, { kind: "delegated-task" }>): AgentProgressController {
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const listing = useDelegatedTasks({
    parentTaskId: target.parentTaskId,
    parentWorkspaceId: target.parentWorkspaceId ?? null,
    repositoryPath,
  });
  const source = useMemo(() => ({ children: listing.children, actions: listing.actions }), [listing.actions, listing.children]);
  const controller = useDelegatedTaskRowController({ source, repositoryPath });
  const child = controller.children.find((row) =>
    row.delegationKey === target.delegationKey && (!target.delegatedTaskId || row.delegatedTaskId === target.delegatedTaskId));
  const blockedKind = child ? controller.blockedByDelegationKey[child.delegationKey] ?? null : null;
  const exchange = useMemo<DelegationExchange | null>(
    () => (child ? fromDelegatedTask(child, { blockedKind }) : target.snapshot ?? null),
    [child, blockedKind, target.snapshot, i18n.language],
  );
  const delegatedTaskId = child?.delegatedTaskId ?? target.delegatedTaskId ?? exchange?.ref.delegatedTaskId;
  const delegatedWorkspaceId = child?.delegatedWorkspaceId ?? target.delegatedWorkspaceId ?? exchange?.ref.delegatedWorkspaceId;
  const live = exchange ? isDelegationExchangeLive(exchange) : false;
  const steps = useChildTaskSteps({
    taskId: delegatedTaskId,
    workspaceId: delegatedWorkspaceId,
    live,
    ...(child?.providerId ? { providerId: child.providerId } : {}),
    settleKey: exchange?.outcome.status,
  });
  const childTitle = useTaskTitle(delegatedTaskId);
  const parentTitle = useTaskTitle(target.parentTaskId);

  const progress = useMemo(() => {
    if (!exchange) return null;
    const title = child ? describeDelegatedWork(child, childTitle ?? target.title) : target.title?.trim() || exchange.title;
    return progressFromExchange({ ...exchange, title }, {
      steps: steps.steps,
      source: "delegated-task",
      ...(steps.ask ? { ask: steps.ask } : {}),
      ...(steps.result ? { result: steps.result } : {}),
      kindLabel: i18n.t("session:agentProgress.panel.kindDelegatedTask"),
      parent: { label: parentTitle?.trim() || i18n.t("session:agentProgress.panel.thisTurn"), taskId: target.parentTaskId },
      readOnly: false,
    });
  }, [exchange, child, childTitle, target.title, target.parentTaskId, steps.steps, steps.ask, steps.result, parentTitle, i18n.language]);

  const context = useMemo<AgentStepContext>(
    () => ({ ...(delegatedTaskId ? { taskId: delegatedTaskId } : {}), ...(steps.workspaceId ? { workspaceId: steps.workspaceId } : {}) }),
    [delegatedTaskId, steps.workspaceId],
  );
  const onOpenParent = useCallback(() => {
    void revealInConversation({ taskId: target.parentTaskId, ...(target.parentWorkspaceId ? { workspaceId: target.parentWorkspaceId } : {}) });
  }, [target.parentTaskId, target.parentWorkspaceId]);
  const controls = child ? resolveDelegatedTaskControls(child) : null;
  const notice = !child && !listing.loading ? i18n.t("session:agentProgress.panel.notListed") : null;
  return {
    progress,
    loading: steps.loading || listing.loading,
    notice,
    context,
    hasOlder: steps.hasOlder,
    ...(steps.hasOlder ? { onLoadOlder: steps.loadOlder } : {}),
    onOpenParent,
    ...(child && controls?.canStop && !target.readOnly ? { onStop: () => controller.onStop(child) } : {}),
    stopBusy: Boolean(child && controller.busyDelegationKey === child.delegationKey),
    ...(child ? { onOpenTask: () => controller.onOpen(child) } : {}),
    actionError: child ? controller.errorByDelegationKey[child.delegationKey] ?? null : null,
  };
}
