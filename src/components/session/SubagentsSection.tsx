import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { ActivityDetailDialog } from "@/components/session/ActivityDetailDialog";
import { ExchangeStatusBadge } from "@/components/delegation/ExchangeStatusBadge";
import { ActionButton } from "@/components/system/ActionButton";
import { listAgents } from "@/lib/agents/library";
import {
  isDelegationExchangeLive,
  partitionDelegationExchanges,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { resolveDelegatedTaskControls, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { useAppStore } from "@/store/app.store";
import { useDelegatedTaskRowController } from "./DelegatedTaskRows";
import { useDelegatedTasks } from "./useDelegatedTasks";
import { selectTaskSubagents, subagentResultLine } from "@/lib/delegation/subagent-summary";
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
 * in-turn (a provider subagent), as one list with live rows first. A row says
 * who the subagent is, what it is doing and how it stands, and offers only
 * Open transcript and Stop; its answer folds under the row.
 */
export function SubagentsSection(props: {
  workspaceId: string;
  taskId: string;
  repositoryPath: string;
  /** A managed task's subagents are read-only until the user takes over. */
  readOnly?: boolean;
}) {
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
    () => new Map(listAgents({ custom: customAgents }).map((agent) => [agent.id, agent.name])),
    [customAgents],
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
    const { live, settled } = partitionDelegationExchanges(exchanges);
    return [...live, ...settled.reverse()];
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
          ? "Loading subagents…"
          : listing.error ?? "No subagents yet. An agent calls one when part of its work fits another agent or model."}
      </p>
    );
  }
  return (
    <>
      <ul aria-label="Subagents" className={sx(styles.list)} data-testid="subagents-list">
        {rows.map((exchange) => {
          const child = exchange.ref.delegationKey && exchange.kind === "delegated-task"
            ? controller.children.find((row) => row.delegationKey === exchange.ref.delegationKey)
            : undefined;
          return (
            <SubagentRow
              key={exchange.id}
              exchange={exchange}
              who={whoLabel(exchange, child, agentNames)}
              what={child ? describeWork(child, tasks.find((task) => task.id === child.delegatedTaskId)?.title) : exchange.ask}
              canStop={Boolean(child && !props.readOnly && resolveDelegatedTaskControls(child).canStop)}
              busy={Boolean(child && controller.busyDelegationKey === child.delegationKey)}
              error={child ? controller.errorByDelegationKey[child.delegationKey] : undefined}
              onOpen={child
                ? () => controller.onOpen(child)
                : exchange.ref.toolUseId
                  ? () => focusTranscriptTool({ taskId: props.taskId, toolUseId: exchange.ref.toolUseId! })
                  : undefined}
              onStop={child ? () => controller.onStop(child) : undefined}
              onView={child ? () => setViewingId(exchange.id) : undefined}
            />
          );
        })}
      </ul>
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
  return "Subagent";
}

function SubagentRow(props: {
  exchange: DelegationExchange;
  who: string;
  what: string;
  canStop: boolean;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
  onStop?: () => void;
  onView?: () => void;
}) {
  const { exchange } = props;
  const { error, result } = exchange.outcome;
  // The answer renders like the conversation, and only once it is opened, so
  // a long list never parses every answer it folds away.
  const [answerOpen, setAnswerOpen] = useState(false);
  return (
    <li className={sx(styles.row)} data-subagent-kind={exchange.kind}>
      <div className={sx(styles.head)}>
        <span className={sx(styles.who)}>{props.who}</span>
        <ExchangeStatusBadge status={exchange.outcome.status} />
      </div>
      {props.what !== props.who ? <p className={sx(styles.what)}>{props.what}</p> : null}
      {exchange.outcome.progress?.at(-1) ? <p className={sx(styles.what)}>{exchange.outcome.progress.at(-1)}</p> : null}
      {subagentResultLine(exchange) ? <p className={sx(styles.what)} title={error ?? result}>{subagentResultLine(exchange)}</p> : null}
      {(error ?? result) && !isDelegationExchangeLive(exchange) ? (
        <details
          className={sx(styles.answer)}
          onToggle={(event) => setAnswerOpen(event.currentTarget.open)}
        >
          <summary className={sx(styles.answerSummary)}>
            {error ? "Why it stopped" : "Answer"}
          </summary>
          {error ? (
            <p className={sx(styles.answerText)}>{error}</p>
          ) : answerOpen && result ? (
            <div className={sx(styles.answerBody)}>
              <CollapsibleResponse text={result} label={`${props.who}'s answer`} />
            </div>
          ) : null}
        </details>
      ) : null}
      {props.error ? <p role="alert" className={sx(styles.error)}>{props.error}</p> : null}
      {props.onOpen || props.canStop || props.onView ? (
        <div className={sx(styles.actions)}>
          {props.onView ? (
            <ActionButton size="md" weight="quiet" xstyle={styles.target} onClick={props.onView}>
              View activity
            </ActionButton>
          ) : null}
          {props.onOpen ? (
            <ActionButton size="md" weight="quiet" xstyle={styles.target} onClick={props.onOpen}>
              Open transcript
            </ActionButton>
          ) : null}
          {props.canStop && props.onStop ? (
            <ActionButton size="md" weight="quiet" tone="danger" xstyle={styles.target} disabled={props.busy} onClick={props.onStop}>
              Stop
            </ActionButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const styles = stylex.create({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  who: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  what: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  answer: { minWidth: 0 },
  answerSummary: {
    cursor: "pointer",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  answerBody: { minWidth: 0, marginBlockStart: vars["--ads-space-4"] },
  answerText: {
    margin: 0,
    marginBlockStart: vars["--ads-space-4"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  error: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
  actions: { display: "flex", gap: vars["--ads-space-8"] },
  // Row controls are used often from a narrow rail: keep a 40px target.
  target: { minBlockSize: 40 },
  muted: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
});
