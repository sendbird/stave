import type { ChatMessage, ToolUsePart } from "@/types/chat";
import { CollaborationHistoryControls } from "./CollaborationHistoryControls";
import { selectWorkerExchanges } from "@/lib/collaboration/worker-exchanges";
import { selectAdvisorTranscriptExchanges } from "@/lib/collaboration/advisor-transcript";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChildTaskRowActions,
  useChildTaskRowController,
} from "@/components/session/ChildTaskRows";
import { useChildTasks } from "@/components/session/useChildTasks";
import {
  WorkGraphTree,
  NO_WORK_GRAPH_CAPABILITIES,
} from "@/components/session/WorkGraphTree";
import {
  DelegationsBlock,
  useDelegationClock,
} from "@/components/delegation/DelegationsBlock";
import { ActionButton } from "@/components/system/ActionButton";
import { selectAdvisorConsultLog } from "@/lib/providers/advisor-consult-log";
import { buildCollaborationReport } from "@/lib/collaboration/report";
import {
  isDelegationExchangeLive,
  partitionDelegationExchanges,
  selectDelegationExchanges,
  type DelegationActionId,
  type DelegationExchange,
  type DelegationExchangeKind,
} from "@/lib/delegation/exchange";
import type { WorkerExecutionMetadata } from "@/lib/providers/worker-mode";
import { useAppStore } from "@/store/app.store";
import { DelegateTaskForm, type CollaborationTarget } from "./DelegateTaskForm";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import {
  collectCollaborationHistoryExport,
  mergeCollaborationRows,
} from "@/lib/collaboration/history";
import { useCollaborationHistory } from "./useCollaborationHistory";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";
import { delegationStyles } from "@/components/delegation/delegation.styles";
import { sx } from "@/components/ads/utils/stylex";

const EMPTY_MESSAGES: ChatMessage[] = [];

export type DelegationFilter = "all" | "advisor" | "worker" | "tasks";

const FILTERS: ReadonlyArray<{ id: DelegationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "advisor", label: "Advisor" },
  { id: "worker", label: "Worker" },
  { id: "tasks", label: "Tasks" },
];

const FILTER_KINDS: Record<DelegationFilter, readonly DelegationExchangeKind[]> = {
  all: ["advisor", "worker", "child-task", "subagent"],
  advisor: ["advisor"],
  worker: ["worker"],
  tasks: ["child-task", "subagent"],
};

/** Execution metadata the live transcript still holds, by tool-use id. */
function collectWorkerExecutions(messages: readonly ChatMessage[]) {
  const byToolUseId: Record<string, WorkerExecutionMetadata | undefined> = {};
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool_use") continue;
      const toolPart = part as ToolUsePart;
      if (toolPart.toolUseId && toolPart.workerExecution) {
        byToolUseId[toolPart.toolUseId] = toolPart.workerExecution;
      }
    }
  }
  return byToolUseId;
}

/**
 * The right-rail Delegations panel: every advisor consult, worker run, child
 * task and subagent this task made, as one chronological list of exchange
 * rows, live first. Mounted only on demand; no hidden polling, chat cloning,
 * or secondary executor.
 */
export function CollaborationPanel({ target }: { target: CollaborationTarget }) {
  const [filter, setFilter] = useState<DelegationFilter>("all");
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const history = useCollaborationHistory({
    workspaceId: target.workspaceId,
    taskId: target.taskId,
  });
  const listing = useChildTasks({
    parentTaskId: target.taskId,
    parentWorkspaceId: target.workspaceId,
    projectPath: target.projectPath,
  });
  const childSource = useMemo(
    () => ({ children: listing.children, actions: listing.actions }),
    [listing.actions, listing.children],
  );
  const childController = useChildTaskRowController({
    source: childSource,
    projectPath: target.projectPath,
  });
  const consults = useAppStore((s) =>
    selectAdvisorConsultLog(s.advisorConsultLogByTask, target.taskId),
  );
  const advisorSnapshot = useAppStore(
    (s) => s.advisorExchangeByTask[target.taskId] ?? null,
  );
  const activeTurnId = useAppStore(
    (s) => s.activeTurnIdsByTask[target.taskId] ?? null,
  );
  const messages = useAppStore(
    (state) => state.messagesByTask[target.taskId] ?? EMPTY_MESSAGES,
  );
  const activity = useAppStore(
    (s) =>
      s.providerTurnActivityByTask[target.taskId] ??
      s.retainedTurnActivityByTask[target.taskId]?.snapshot ??
      null,
  );
  const focusTranscriptTool = useAppStore((s) => s.focusTranscriptTool);
  const openAdvisorConsultLog = useAppStore((s) => s.openAdvisorConsultLog);
  const skipTaskAdvisor = useAppStore((s) => s.skipTaskAdvisor);

  const liveWorkers = useMemo(() => selectWorkerExchanges(messages), [messages]);
  const liveAdvisors = useMemo(
    () => selectAdvisorTranscriptExchanges(messages),
    [messages],
  );
  const workerExecutionByToolUseId = useMemo(
    () => collectWorkerExecutions(messages),
    [messages],
  );
  const workers = useMemo(
    () => mergeCollaborationRows(liveWorkers, history.page?.workers ?? []),
    [history.page?.workers, liveWorkers],
  );
  const advisorTranscript = useMemo(
    () => mergeCollaborationRows(liveAdvisors, history.page?.advisors ?? []),
    [history.page?.advisors, liveAdvisors],
  );

  const exchanges = useMemo(
    () =>
      selectDelegationExchanges({
        consults,
        advisorSnapshot,
        activeTurnId,
        advisorTranscript,
        workers,
        workerExecutionByToolUseId,
        childTasks: childController.children,
        childBlockedByDelegationKey: childController.blockedByDelegationKey,
        workGraph: activity?.workGraph ?? null,
        includeSubagents: true,
        advisorOptions: {
          canCancel: advisorSnapshot?.turnId === activeTurnId,
        },
      }),
    [
      activeTurnId,
      activity?.workGraph,
      advisorSnapshot,
      advisorTranscript,
      childController.blockedByDelegationKey,
      childController.children,
      consults,
      workerExecutionByToolUseId,
      workers,
    ],
  );
  const hasLive = exchanges.some(isDelegationExchangeLive);
  const nowMs = useDelegationClock(hasLive);
  const ordered = useMemo(() => {
    const kinds = FILTER_KINDS[filter];
    const filtered = exchanges.filter((exchange) => kinds.includes(exchange.kind));
    const { live, settled } = partitionDelegationExchanges(filtered);
    // History reads newest first; live work stays on top.
    return [...live, ...settled.reverse()];
  }, [exchanges, filter]);

  const handleAction = useCallback(
    (action: DelegationActionId, exchange: DelegationExchange) => {
      switch (action) {
        case "show-in-conversation":
          if (exchange.ref.toolUseId) {
            focusTranscriptTool({
              taskId: target.taskId,
              toolUseId: exchange.ref.toolUseId,
            });
          }
          return;
        case "open-log":
          openAdvisorConsultLog({
            taskId: target.taskId,
            ...(exchange.ref.entryKey ? { entryKey: exchange.ref.entryKey } : {}),
          });
          return;
        case "cancel":
          skipTaskAdvisor({ taskId: target.taskId });
          return;
        default:
          return;
      }
    },
    [focusTranscriptTool, openAdvisorConsultLog, skipTaskAdvisor, target.taskId],
  );
  const renderExtraActions = useCallback(
    (exchange: DelegationExchange) => {
      if (exchange.kind !== "child-task" || !exchange.ref.delegationKey) {
        return null;
      }
      const child = childController.children.find(
        (row) => row.delegationKey === exchange.ref.delegationKey,
      );
      if (!child) {
        return null;
      }
      return (
        <ChildTaskRowActions
          child={child}
          busy={childController.busyDelegationKey === child.delegationKey}
          onOpen={childController.onOpen}
          onFollowUp={childController.onFollowUp}
          onRetry={childController.onRetry}
          onStop={childController.onStop}
          onDetach={childController.onDetach}
        />
      );
    },
    [childController],
  );
  const statusNoteFor = useCallback(
    (exchange: DelegationExchange) =>
      exchange.ref.delegationKey
        ? childController.errorByDelegationKey[exchange.ref.delegationKey]
        : undefined,
    [childController.errorByDelegationKey],
  );
  // Child-task rows keep their descriptor list empty here: the shared action
  // row renders the real controls (with the prompt composer follow-up and
  // retry need), so descriptor buttons would double every control.
  const rows = useMemo(
    () =>
      ordered.map((exchange) =>
        exchange.kind === "child-task" ? { ...exchange, actions: [] } : exchange,
      ),
    [ordered],
  );

  useEffect(() => {
    return () => exportAbortRef.current?.abort();
  }, []);

  async function exportReport() {
    if (exportAbortRef.current) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true);
    setExportNotice(null);
    try {
      const saved = await collectCollaborationHistoryExport({
        loadPage: ({ limit, offset }) =>
          loadTaskMessagesPage({
            workspaceId: target.workspaceId,
            taskId: target.taskId,
            limit,
            offset,
          }),
        isCancelled: () => controller.signal.aborted,
      });
      if (saved.status === "cancelled") {
        setExportNotice({
          text: "Export cancelled. No report was downloaded.",
          tone: "status",
        });
        return;
      }
      const currentState = useAppStore.getState();
      const currentMessages =
        currentState.activeWorkspaceId === target.workspaceId
          ? (currentState.messagesByTask[target.taskId] ?? [])
          : [];
      const report = buildCollaborationReport({
        taskId: target.taskId,
        children: listing.children,
        consults,
        now: new Date().toISOString(),
        workers: mergeCollaborationRows(
          selectWorkerExchanges(currentMessages),
          saved.export.workers,
        ),
        recoveredAdvice: mergeCollaborationRows(
          selectAdvisorTranscriptExchanges(currentMessages),
          saved.export.advisors,
        ),
        historyExport: saved.export,
      });
      const url = URL.createObjectURL(
        new Blob([report], { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "collaboration-report.md";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice({
        text: "Saved-history report downloaded.",
        tone: "status",
      });
    } catch {
      if (controller.signal.aborted) {
        setExportNotice({
          text: "Export cancelled. No report was downloaded.",
          tone: "status",
        });
      } else {
        setExportNotice({
          text: "Saved-history export failed. No report was downloaded.",
          tone: "error",
        });
      }
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
        setExporting(false);
      }
    }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
  }

  // The tree only earns its heading once the graph has rows; a root-only
  // graph would print "Agent tree" over nothing.
  const workGraph = activity?.workGraph ?? null;
  const showTree =
    (filter === "all" || filter === "tasks") &&
    workGraph !== null &&
    summarizeWorkGraph(workGraph).totalCount > 0;

  return (
    <section
      aria-label="Delegations"
      data-testid="delegations-panel"
      {...stylex.props(styles.minZero, styles.panelStack)}
    >
      <p {...stylex.props(styles.body, styles.muted)}>
        Every advisor consult, worker run and delegated task for this task
      </p>

      <div {...stylex.props(styles.toolbar)}>
        <div
          role="group"
          aria-label="Filter delegations"
          className={sx(delegationStyles.filterRow)}
        >
          {FILTERS.map((option) => (
            <ActionButton
              key={option.id}
              size="xs"
              weight={filter === option.id ? "secondary" : "quiet"}
              aria-pressed={filter === option.id}
              data-delegation-filter={option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>
        {exporting ? (
          <ActionButton size="xs" tone="danger" onClick={cancelExport}>
            Cancel export
          </ActionButton>
        ) : (
          <ActionButton
            size="xs"
            weight="quiet"
            onClick={exportReport}
            disabled={listing.loading || history.loading}
          >
            Export report
          </ActionButton>
        )}
      </div>
      {exportNotice ? (
        <p
          role={exportNotice.tone === "error" ? "alert" : "status"}
          {...stylex.props(styles.body)}
        >
          {exportNotice.text}
        </p>
      ) : null}

      {listing.loading ? (
        <p role="status" {...stylex.props(styles.body, styles.muted)}>
          Loading delegated tasks…
        </p>
      ) : null}
      {listing.error ? (
        <p role="alert" {...stylex.props(styles.body, styles.danger)}>
          {listing.error}{" "}
          <ActionButton onClick={listing.actions.refresh}>
            Retry loading
          </ActionButton>
        </p>
      ) : null}

      {rows.length > 0 ? (
        <DelegationsBlock
          exchanges={rows}
          nowMs={nowMs}
          showHeader={false}
          onAction={handleAction}
          renderExtraActions={renderExtraActions}
          statusNoteFor={statusNoteFor}
          data-testid="delegations-list"
        />
      ) : !listing.loading && !history.loading ? (
        <p className={sx(delegationStyles.empty)}>
          {filter === "all"
            ? "No delegations yet. Arm the Advisor or Worker in the composer, or delegate a task below."
            : "Nothing matches this filter in the current conversation or the saved slice."}
        </p>
      ) : null}

      {showTree && activity?.workGraph ? (
        <section>
          <h3 {...stylex.props(styles.heading, styles.marginBottom2)}>
            Agent tree
          </h3>
          <WorkGraphTree
            graph={activity.workGraph}
            now={nowMs}
            capabilities={NO_WORK_GRAPH_CAPABILITIES}
          />
        </section>
      ) : null}

      <CollaborationHistoryControls history={history} exchangeKind="all" />

      <div {...stylex.props(styles.composerDock)}>
        <DelegateTaskForm
          key={target.taskId}
          target={target}
          onCreated={listing.actions.refresh}
        />
      </div>
    </section>
  );
}
