import { getAgentDisplayName } from "@/lib/agents/display";
import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ActivityDetailDialog } from "@/components/session/ActivityDetailDialog";
import { listAgents } from "@/lib/agents/library";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { orderSubagentList } from "@/lib/delegation/subagent-list";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { resolveDelegatedTaskControls, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { useAppStore } from "@/store/app.store";
import { useDelegatedTaskRowController } from "./DelegatedTaskRows";
import { useDelegatedTasks } from "./useDelegatedTasks";
import { selectTaskSubagents } from "@/lib/delegation/subagent-summary";
import { SubagentsList, type SubagentListItem } from "./SubagentsList";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

/** A delegation key reads as its prompt once the derived digest is dropped. */
function describeWork(child: DelegatedTaskSummary, title: string | undefined) {
  if (title) return title;
  const readable = child.delegationKey.replace(/-[0-9a-f]{12}$/, "").replace(/[-_.]+/g, " ").trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : child.delegationKey;
}

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
  // The answer and how the subagent got there, without leaving this task.
  const [viewingId, setViewingId] = useState<string | null>(null);
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

  const viewing = useMemo(() => {
    const exchange = viewingId ? rows.find((row) => row.id === viewingId) : undefined;
    const child = exchange?.ref.delegationKey
      ? controller.children.find((row) => row.delegationKey === exchange.ref.delegationKey)
      : undefined;
    if (!exchange || !child) return null;
    const title = describeWork(child, tasks.find((task) => task.id === child.delegatedTaskId)?.title);
    return {
      title,
      child,
      // Only the controls this surface offers; follow-up and retry stay on the task.
      exchange: {
        ...exchange,
        title,
        actions: exchange.actions.filter(
          (action) => action.id === "open" || (action.id === "stop" && !props.readOnly),
        ),
      },
    };
  }, [controller.children, props.readOnly, rows, tasks, viewingId]);
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
      what: child ? describeWork(child, tasks.find((task) => task.id === child.delegatedTaskId)?.title) : exchange.ask,
      canStop: Boolean(child && !props.readOnly && resolveDelegatedTaskControls(child).canStop),
      busy: Boolean(child && controller.busyDelegationKey === child.delegationKey),
      error: child ? controller.errorByDelegationKey[child.delegationKey] : undefined,
      onOpen: child
        ? () => controller.onOpen(child)
        : exchange.ref.toolUseId
          ? () => focusTranscriptTool({ taskId: props.taskId, toolUseId: exchange.ref.toolUseId! })
          : undefined,
      onStop: child ? () => controller.onStop(child) : undefined,
      onView: child ? () => setViewingId(exchange.id) : undefined,
    };
  });
  return (
    <>
      <SubagentsList items={items} />
      {viewing ? (
        <ActivityDetailDialog
          key={viewing.exchange.id}
          selection={{ title: viewing.title, exchange: viewing.exchange }}
          taskId={props.taskId}
          workspaceId={props.workspaceId}
          repositoryPath={props.repositoryPath}
          onClose={() => setViewingId(null)}
          onAction={(action) => {
            if (action === "open") {
              setViewingId(null);
              controller.onOpen(viewing.child);
            } else if (action === "stop" && !props.readOnly) {
              controller.onStop(viewing.child);
            }
          }}
        />
      ) : null}
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
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
});
