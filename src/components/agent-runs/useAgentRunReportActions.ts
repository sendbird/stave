import { useMemo } from "react";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentRunReport } from "@/lib/agent-runs/report";
import { findSlackThreadUrl } from "@/lib/agent-runs/report-markdown";
import { REPOSITORY_MEMORY_CONTENT_MAX_CHARS } from "@/lib/repository-memory";

/**
 * The Agent run report's actions. Each resolves to the sentence to show, or
 * throws with one. Both are explicit, user-initiated writes.
 */
export interface AgentRunReportActions {
  addToPullRequest?: () => Promise<string>;
  saveDecisions?: () => Promise<string>;
  /** Posts the report to a Slack thread through a turn on the lead task. */
  shareToSlack?: (threadUrl: string) => Promise<string>;
  /** The Slack thread the assignment came from, to share back to. */
  suggestedSlackThread?: string | null;
}

const MAX_DECISIONS_PER_SAVE = 8;

export function reportMentionsPullRequest(report: AgentRunReport) {
  return (
    report.links.some((link) => /\/pull\/\d+/.test(link.url)) ||
    report.leftBehind.some((item) => /\bPR #\d+/.test(item))
  );
}

/** Decisions as memory facts: one short sentence each, within the store's limit. */
export function decisionsAsMemoryFacts(report: AgentRunReport) {
  return report.stages
    .flatMap((stage) => stage.decisions)
    .slice(0, MAX_DECISIONS_PER_SAVE)
    .map((item) => {
      const content = `${item.decision} — ${item.reason}`;
      return {
        kind: "decision" as const,
        content:
          content.length > REPOSITORY_MEMORY_CONTENT_MAX_CHARS
            ? `${content.slice(0, REPOSITORY_MEMORY_CONTENT_MAX_CHARS - 1)}…`
            : content,
      };
    });
}

export function useAgentRunReportActions(detail: AgentRunDetail | undefined): AgentRunReportActions {
  return useMemo(() => {
    const report = detail?.report;
    if (!detail || !report) return {};
    const { agentRun } = detail;
    const actions: AgentRunReportActions = {};
    if (reportMentionsPullRequest(report)) {
      actions.addToPullRequest = async () => {
        const api = window.api?.agentRuns;
        if (!api) throw new Error("Runs are unavailable here.");
        const result = await api.addReportToPullRequest({ agentRunId: agentRun.id });
        if (!result.ok) throw new Error(result.message ?? "The pull request was not updated.");
        return "Added the report to the pull request description.";
      };
    }
    const facts = decisionsAsMemoryFacts(report);
    if (facts.length > 0) {
      actions.saveDecisions = async () => {
        const remember = window.api?.repositoryMemory?.remember;
        if (!remember) throw new Error("Memory is unavailable here.");
        // Saved as candidates for review, never as always-included memory.
        const result = await remember({
          repositoryPath: agentRun.repositoryPath,
          facts,
          source: "auto",
          sourceTaskId: agentRun.leadTaskId,
        });
        if (!result.ok) throw new Error(result.message ?? "The decisions were not saved.");
        return `Saved ${facts.length} ${facts.length === 1 ? "decision" : "decisions"} as memory candidates. Review them in Memory.`;
      };
    }
    actions.suggestedSlackThread = findSlackThreadUrl(agentRun.assignment);
    actions.shareToSlack = async (threadUrl) => {
      const api = window.api?.agentRuns;
      if (!api?.shareReport) throw new Error("Sharing is available in the desktop app.");
      const result = await api.shareReport({ agentRunId: agentRun.id, threadUrl });
      if (!result.ok) throw new Error(result.message ?? "The report was not shared.");
      return "The task is posting the report to the thread. Its reply shows in the task.";
    };
    return actions;
  }, [detail]);
}
