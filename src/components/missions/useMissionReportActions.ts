import { useMemo } from "react";
import type { MissionDetail } from "@/lib/missions/api";
import type { MissionReport } from "@/lib/missions/report";
import { findSlackThreadUrl } from "@/lib/missions/report-markdown";
import { REPOSITORY_MEMORY_CONTENT_MAX_CHARS } from "@/lib/repository-memory";

/**
 * The Mission report's actions. Each resolves to the sentence to show, or
 * throws with one. Both are explicit, user-initiated writes.
 */
export interface MissionReportActions {
  addToPullRequest?: () => Promise<string>;
  saveDecisions?: () => Promise<string>;
  /** Posts the report to a Slack thread through a turn on the lead task. */
  shareToSlack?: (threadUrl: string) => Promise<string>;
  /** The Slack thread the assignment came from, to share back to. */
  suggestedSlackThread?: string | null;
}

const MAX_DECISIONS_PER_SAVE = 8;

export function reportMentionsPullRequest(report: MissionReport) {
  return (
    report.links.some((link) => /\/pull\/\d+/.test(link.url)) ||
    report.leftBehind.some((item) => /\bPR #\d+/.test(item))
  );
}

/** Decisions as memory facts: one short sentence each, within the store's limit. */
export function decisionsAsMemoryFacts(report: MissionReport) {
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

export function useMissionReportActions(detail: MissionDetail | undefined): MissionReportActions {
  return useMemo(() => {
    const report = detail?.report;
    if (!detail || !report) return {};
    const { mission } = detail;
    const actions: MissionReportActions = {};
    if (reportMentionsPullRequest(report)) {
      actions.addToPullRequest = async () => {
        const api = window.api?.missions;
        if (!api) throw new Error("Missions are unavailable here.");
        const result = await api.addReportToPullRequest({ missionId: mission.id });
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
          repositoryPath: mission.repositoryPath,
          facts,
          source: "auto",
          sourceTaskId: mission.leadTaskId,
        });
        if (!result.ok) throw new Error(result.message ?? "The decisions were not saved.");
        return `Saved ${facts.length} ${facts.length === 1 ? "decision" : "decisions"} as memory candidates. Review them in Memory.`;
      };
    }
    actions.suggestedSlackThread = findSlackThreadUrl(mission.assignment);
    actions.shareToSlack = async (threadUrl) => {
      const api = window.api?.missions;
      if (!api?.shareReport) throw new Error("Sharing is available in the desktop app.");
      const result = await api.shareReport({ missionId: mission.id, threadUrl });
      if (!result.ok) throw new Error(result.message ?? "The report was not shared.");
      return "The task is posting the report to the thread. Its reply shows in the task.";
    };
    return actions;
  }, [detail]);
}
