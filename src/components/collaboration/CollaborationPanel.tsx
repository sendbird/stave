import type { ChatMessage } from "@/types/chat";
import { CollaborationHistoryControls } from "./CollaborationHistoryControls";
import { selectWorkerExchanges } from "@/lib/collaboration/worker-exchanges";
import { selectAdvisorTranscriptExchanges } from "@/lib/collaboration/advisor-transcript";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import { AdvisorTranscript } from "./AdvisorTranscript";
import { WorkerExchanges } from "./WorkerExchanges";
import { useEffect, useRef, useState } from "react";
import { ChildTaskRows } from "@/components/session/ChildTaskRows";
import { useChildTasks } from "@/components/session/useChildTasks";
import {
  WorkGraphTree,
  NO_WORK_GRAPH_CAPABILITIES,
} from "@/components/session/WorkGraphTree";
import { ActionButton } from "@/components/system/ActionButton";
import { StatusBadge } from "@/components/system/WorkspaceSurface";
import { selectAdvisorConsultLog } from "@/lib/providers/advisor-consult-log";
import { buildCollaborationReport } from "@/lib/collaboration/report";
import { useAppStore } from "@/store/app.store";
import { DelegateTaskForm, type CollaborationTarget } from "./DelegateTaskForm";
import { WorkflowLibrary } from "./WorkflowLibrary";
import {
  collectCollaborationHistoryExport,
  mergeCollaborationRows,
} from "@/lib/collaboration/history";
import { useCollaborationHistory } from "./useCollaborationHistory";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";
import { focusRing } from "../ads/recipes/focus-ring";

const EMPTY_MESSAGES: ChatMessage[] = [];

export type CollaborationSection = "team" | "workers" | "advice" | "tools";

const DIRECT_SECTION_COPY: Record<
  CollaborationSection,
  { title: string; description: string }
> = {
  team: {
    title: "Team",
    description: "Delegate work and inspect the tasks in this workspace.",
  },
  workers: {
    title: "Workers",
    description:
      "Inspect worker exchanges from this task and its saved history.",
  },
  advice: {
    title: "Advisor",
    description: "Read advisor questions, responses, and saved exchanges.",
  },
  tools: {
    title: "Tools",
    description: "Reuse workflows, macros, presets, and workspace tools.",
  },
};

/** Mounted only on demand; no hidden polling, chat cloning, or secondary executor. */
export function CollaborationPanel({
  target,
  section,
}: {
  target: CollaborationTarget;
  section?: CollaborationSection;
}) {
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
  const consults = useAppStore((s) =>
    selectAdvisorConsultLog(s.advisorConsultLogByTask, target.taskId),
  );
  const messages = useAppStore(
    (state) => state.messagesByTask[target.taskId] ?? EMPTY_MESSAGES,
  );
  const hasAdvice =
    consults.length > 0 ||
    selectAdvisorTranscriptExchanges(messages).length > 0 ||
    Boolean(history.page?.advisors.length);
  const hasWorkers =
    selectWorkerExchanges(messages).length > 0 ||
    Boolean(history.page?.workers.length);
  const activity = useAppStore(
    (s) =>
      s.providerTurnActivityByTask[target.taskId] ??
      s.retainedTurnActivityByTask[target.taskId]?.snapshot ??
      null,
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
      const messages =
        currentState.activeWorkspaceId === target.workspaceId
          ? (currentState.messagesByTask[target.taskId] ?? [])
          : [];
      const report = buildCollaborationReport({
        taskId: target.taskId,
        children: listing.children,
        consults,
        now: new Date().toISOString(),
        workers: mergeCollaborationRows(
          selectWorkerExchanges(messages),
          saved.export.workers,
        ),
        recoveredAdvice: mergeCollaborationRows(
          selectAdvisorTranscriptExchanges(messages),
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

  const team = (
    <div {...stylex.props(styles.panelStack)}>
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
      <ChildTaskRows
        parentTaskId={target.taskId}
        parentWorkspaceId={target.workspaceId}
        projectPath={target.projectPath}
        source={listing}
      />
      {!listing.loading && !listing.error && !listing.children.length ? (
        <p {...stylex.props(styles.body, styles.muted)}>
          No delegated tasks yet.
        </p>
      ) : null}
      {activity?.workGraph ? (
        <section>
          <h3 {...stylex.props(styles.heading, styles.marginBottom2)}>
            Agents in the current or last retained run
          </h3>
          <WorkGraphTree
            graph={activity.workGraph}
            now={Date.now()}
            capabilities={NO_WORK_GRAPH_CAPABILITIES}
          />
        </section>
      ) : null}
      <DelegateTaskForm
        key={target.taskId}
        target={target}
        onCreated={listing.actions.refresh}
      />
    </div>
  );
  const advice = (
    <div {...stylex.props(styles.contentStack)}>
      {consults.length
        ? consults.map(({ key, snapshot: s }) => (
            <article key={key} {...stylex.props(styles.article)}>
              <div {...stylex.props(styles.row)}>
                <h3 {...stylex.props(styles.heading)}>
                  {s.advisorModel ?? s.advisorProviderId ?? "Advisor"}
                </h3>
                <StatusBadge
                  tone={
                    s.outcome === "completed"
                      ? "success"
                      : s.outcome === "pending"
                        ? "active"
                        : "neutral"
                  }
                >
                  {s.outcome}
                </StatusBadge>
              </div>
              <div>
                <h4 {...stylex.props(styles.heading)}>
                  Question from {s.primaryModel ?? s.primaryProviderId}
                </h4>
                <p
                  {...stylex.props(
                    styles.bodyRelaxed,
                    styles.preWrap,
                    styles.breakWords,
                    styles.marginTop1,
                  )}
                >
                  {s.question ?? "No question captured."}
                </p>
              </div>
              <div>
                <h4 {...stylex.props(styles.heading)}>Advisor response</h4>
                <p
                  {...stylex.props(
                    styles.bodyRelaxed,
                    styles.preWrap,
                    styles.breakWords,
                    styles.marginTop1,
                  )}
                >
                  {s.advice ?? s.detail ?? "Waiting for a response…"}
                </p>
              </div>
              <details {...stylex.props(styles.detailsMuted)}>
                <summary {...stylex.props(styles.cursor, focusRing.ring)}>
                  Exchange details
                </summary>
                <p {...stylex.props(styles.marginTop2, styles.breakAll)}>
                  Turn {s.turnId} ·{" "}
                  {s.durationMs === undefined
                    ? "Duration unavailable"
                    : `${Math.round(s.durationMs / 1000)} seconds`}
                </p>
              </details>
            </article>
          ))
        : null}
      <AdvisorTranscript
        taskId={target.taskId}
        history={history}
        showHistory={Boolean(section)}
      />
    </div>
  );
  const directContent =
    section === "team" ? (
      team
    ) : section === "workers" ? (
      <WorkerExchanges
        taskId={target.taskId}
        history={history}
        showHistory={Boolean(section)}
      />
    ) : section === "advice" ? (
      advice
    ) : section === "tools" ? (
      <WorkflowLibrary
        taskId={target.taskId}
        workspaceId={target.workspaceId}
        projectPath={target.projectPath}
      />
    ) : null;
  const directCopy = section ? DIRECT_SECTION_COPY[section] : null;
  return (
    <section
      aria-label={directCopy?.title ?? "Task collaboration"}
      {...stylex.props(styles.minZero, styles.panelStack)}
    >
      <div {...stylex.props(styles.rowBetween)}>
        <p {...stylex.props(styles.body, styles.muted)}>
          Assignments and recorded exchanges for this task
        </p>
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
      {section ? (
        directContent
      ) : (
        <>
          <section
            aria-labelledby="delegated-work-heading"
            {...stylex.props(styles.sectionStack)}
          >
            <h3
              id="delegated-work-heading"
              {...stylex.props(styles.headingBody)}
            >
              Delegated tasks
            </h3>
            {team}
          </section>
          {hasAdvice ? (
            <section
              aria-labelledby="advice-heading"
              {...stylex.props(styles.sectionDivider)}
            >
              <h3 id="advice-heading" {...stylex.props(styles.headingBody)}>
                Consultations
              </h3>
              {advice}
            </section>
          ) : null}
          {hasWorkers ? (
            <section
              aria-labelledby="worker-work-heading"
              {...stylex.props(styles.sectionDivider)}
            >
              <h3
                id="worker-work-heading"
                {...stylex.props(styles.headingBody)}
              >
                Worker assignments
              </h3>
              <WorkerExchanges
                taskId={target.taskId}
                history={history}
                showHistory={Boolean(section)}
              />
            </section>
          ) : null}
          <CollaborationHistoryControls history={history} exchangeKind="all" />
        </>
      )}
    </section>
  );
}
