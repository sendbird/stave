import { getAgentDisplayName } from "@/lib/agents/display";
import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { describeDelegatedWork } from "@/components/agent-progress/use-agent-progress";
import { listAgents } from "@/lib/agents/library";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { orderSubagentList } from "@/lib/delegation/subagent-list";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { resolveDelegatedTaskControls, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { useAppStore } from "@/store/app.store";
import { openAgentProgress } from "@/store/agent-progress-panel-store";
import { useDelegatedTaskRowController } from "./DelegatedTaskRows";
import { useDelegatedTasks } from "./useDelegatedTasks";
import { selectTaskSubagents, subagentWorkState } from "@/lib/delegation/subagent-summary";
import { describeExchangeStatus } from "@/lib/delegation/format";
import { SharedFilesSection, type SharedFilesChildInfo } from "./SharedFilesSection";
import { SubagentsList, type SubagentListItem } from "./SubagentsList";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * The Task panel's Subagents tab: every agent this task called, durable
 * (a Stave task, possibly on the other provider or in its own worktree) or
 * in-turn (a provider subagent), as one list. Children that wait on the user
 * come first and the summary above the list opens the first of them; then
 * the live rows, then the settled ones. A row says who the subagent is, what
 * it is doing, how it stands and for how long, and offers only Open
 * transcript and Stop; its answer folds under the row.
 */
export function SubagentsSection(props: {
  workspaceId: string;
  taskId: string;
  repositoryPath: string;
  /** A managed task's subagents are read-only until the user takes over. */
  readOnly?: boolean;
}) {
  useTranslation();
  const listing = useDelegatedTasks({
    parentTaskId: props.taskId,
    parentWorkspaceId: props.workspaceId,
    repositoryPath: props.repositoryPath,
  });
  const source = useMemo(
    () => ({ children: listing.children, actions: listing.actions }),
    [listing.actions, listing.children],
  );
  const controller = useDelegatedTaskRowController({ source, repositoryPath: props.repositoryPath });
  const graph = useAppStore(
    (state) =>
      state.providerTurnActivityByTask[props.taskId]?.workGraph ??
      state.retainedTurnActivityByTask[props.taskId]?.snapshot.workGraph ??
      null,
  );
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const messages = useAppStore((state) => state.messagesByTask[props.taskId] ?? EMPTY_MESSAGES);
  const tasks = useAppStore((state) => state.tasks);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const agentNames = useMemo(
    () => new Map(listAgents({ custom: customAgents }).map((agent) => [agent.id, getAgentDisplayName(agent)])),
    [customAgents, i18n.language],
  );
  const rows = useMemo(() => {
    const exchanges = selectTaskSubagents({
      messages,
      delegatedTasks: controller.children,
      childBlockedByDelegationKey: controller.blockedByDelegationKey,
      workGraph: graph,
      includeSubagents: true,
    });
    return orderSubagentList(exchanges);
  }, [controller.blockedByDelegationKey, controller.children, graph, messages]);

  if (rows.length === 0) {
    return (
      <p className={sx(styles.muted)} role={listing.loading ? "status" : undefined}>
        {listing.loading
          ? i18n.t("session:subagentsSection.subagentsSection")
          : listing.error ?? i18n.t("session:subagentsSection.subagentsSection2")}
      </p>
    );
  }
  const items: SubagentListItem[] = rows.map((exchange) => {
    const child = exchange.ref.delegationKey && exchange.kind === "delegated-task"
      ? controller.children.find((row) => row.delegationKey === exchange.ref.delegationKey)
      : undefined;
    return {
      exchange,
      who: whoLabel(exchange, child, agentNames),
      accountLabel: child?.accountLabel,
      what: child ? describeDelegatedWork(child, tasks.find((task) => task.id === child.delegatedTaskId)?.title) : exchange.ask,
      canStop: Boolean(child && !props.readOnly && resolveDelegatedTaskControls(child).canStop),
      busy: Boolean(child && controller.busyDelegationKey === child.delegationKey),
      error: child ? controller.errorByDelegationKey[child.delegationKey] : undefined,
      onOpen: child
        ? () => controller.onOpen(child)
        : exchange.ref.toolUseId
          ? () => focusTranscriptTool({ taskId: props.taskId, toolUseId: exchange.ref.toolUseId! })
          : undefined,
      onStop: child ? () => controller.onStop(child) : undefined,
      // The answer and how the subagent got there, beside this conversation.
      onView: () => openAgentProgress(child
        ? {
            kind: "delegated-task",
            parentTaskId: props.taskId,
            parentWorkspaceId: props.workspaceId,
            delegationKey: child.delegationKey,
            delegatedTaskId: child.delegatedTaskId,
            delegatedWorkspaceId: child.delegatedWorkspaceId,
            title: describeDelegatedWork(child, tasks.find((task) => task.id === child.delegatedTaskId)?.title),
            snapshot: exchange,
            ...(props.readOnly ? { readOnly: true } : {}),
          }
        : {
            kind: "subagent",
            parentTaskId: props.taskId,
            parentWorkspaceId: props.workspaceId,
            ...(exchange.ref.toolUseId ? { toolUseId: exchange.ref.toolUseId } : {}),
            ...(exchange.ref.nodeKey ? { nodeKey: exchange.ref.nodeKey } : {}),
            ...(exchange.ref.agentId ? { agentId: exchange.ref.agentId } : {}),
            ...(exchange.identity.providerId ? { providerId: exchange.identity.providerId } : {}),
            title: exchange.title,
            snapshot: exchange,
          }),
      // The same Retry the delegated task's own row offers, for the tray's
      // "Retry failed"; a managed task's subagents stay read-only.
      onRetry: child && !props.readOnly && exchange.outcome.status === "failed" && resolveDelegatedTaskControls(child).canRetry
        ? (prompt: string) => controller.onRetry(child, prompt)
        : undefined,
    };
  });
  // Who each delegated child is and how it stands, for the Shared files columns.
  const infoByDelegationKey = new Map<string, SharedFilesChildInfo>();
  for (const item of items) {
    const key = item.exchange.kind === "delegated-task" ? item.exchange.ref.delegationKey : undefined;
    if (!key) continue;
    infoByDelegationKey.set(key, {
      label: item.what && item.what !== item.who ? `${item.who} · ${item.what}` : item.who,
      state: subagentWorkState(item.exchange),
      stateLabel: describeExchangeStatus(item.exchange.outcome.status).label,
    });
  }
  return (
    <>
      <SubagentsList
        items={items}
        afterTray={
          <SharedFilesSection
            workspaceId={props.workspaceId}
            taskId={props.taskId}
            delegatedTasks={controller.children}
            infoByDelegationKey={infoByDelegationKey}
          />
        }
      />
    </>
  );
}

function whoLabel(
  exchange: DelegationExchange,
  child: DelegatedTaskSummary | undefined,
  agentNames: ReadonlyMap<string, string>,
) {
  const agent = child?.agentConfigId ? agentNames.get(child.agentConfigId) : undefined;
  if (agent) return agent;
  if (exchange.kind === "subagent") return exchange.title;
  const model = exchange.identity.model;
  if (model) return toHumanModelName({ model });
  return i18n.t("session:subagentsSection.whoLabel");
}

const styles = stylex.create({
  muted: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
});
