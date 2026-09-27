import { useMemo } from "react";
import type { MissionDetail } from "@/lib/missions/api";
import type { MissionReport } from "@/lib/missions/report";
import { duplicatePlaybook, playbooksRunAlike, uniquePlaybookName, upsertPlaybook } from "@/lib/playbooks/library";
import { parsePlaybook } from "@/lib/playbooks/normalize";
import type { Playbook } from "@/lib/playbooks/schema";
import { findSlackThreadUrl } from "@/lib/missions/report-markdown";
import { REPOSITORY_MEMORY_CONTENT_MAX_CHARS } from "@/lib/repository-memory";
import { useAppStore } from "@/store/app.store";

/**
 * The Mission report's actions. Each resolves to the sentence to show, or
 * throws with one. Both are explicit, user-initiated writes.
 */
export interface MissionReportActions {
  addToPullRequest?: () => Promise<string>;
  saveDecisions?: () => Promise<string>;
  /** Saves the playbook the mission ran, with its edits for this run, as a playbook of its own. */
  saveAsPlaybook?: () => Promise<string>;
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

/**
 * Saves a mission's playbook: unchanged from a saved playbook it only names
 * it; otherwise it adds it — under its own name when free — for next time.
 * A copy saved before, by this action or by hand, is named instead of added again.
 */
export function saveMissionPlaybook(ran: Playbook): string {
  const app = useAppStore.getState();
  const saved = app.settings.playbooks;
  // Compared in the shape saved playbooks are kept in.
  const parsed = parsePlaybook(ran);
  const playbook = parsed.ok ? parsed.playbook : ran;
  const same = saved.find((candidate) => candidate.id === playbook.id && playbooksRunAlike(candidate, playbook));
  if (same) return `This mission ran “${same.name}” as it is saved.`;
  const copy = saved.find((candidate) => playbooksRunAlike(candidate, playbook));
  if (copy) return `Already saved as “${copy.name}” in Automations → Playbooks.`;
  const created: Playbook = {
    ...duplicatePlaybook({ playbook, now: new Date(), taken: saved }),
    name: uniquePlaybookName(playbook.name, saved),
  };
  app.updateSettings({ patch: { playbooks: upsertPlaybook(saved, created) } });
  return `Saved as “${created.name}” in Automations → Playbooks.`;
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
    actions.saveAsPlaybook = async () => saveMissionPlaybook(mission.playbook);
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
