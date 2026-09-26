/**
 * A Mission report as Markdown, for Copy Markdown and, later, for adding it
 * to a pull request description.
 *
 * Pure. Used by `src/components/missions/MissionReportView.tsx`.
 */
import { formatAge } from "./mission-view";
import { EVIDENCE_SOURCE_LABELS } from "./evidence";
import type { MissionReport } from "./report";

const OUTCOME_TITLES: Record<MissionReport["outcome"], string> = {
  completed: "Mission complete",
  cancelled: "Mission cancelled",
  stopped: "Mission stopped",
};

const CRITERION_MARKS = { met: "[x]", unmet: "[ ]", unverified: "[?]" } as const;

export function describeReportTitle(report: MissionReport): string {
  const duration = formatAge(Date.parse(report.endedAt) - Date.parse(report.startedAt));
  return `${OUTCOME_TITLES[report.outcome]} · ${duration} · ${report.turnCount} ${report.turnCount === 1 ? "turn" : "turns"}`;
}

export function formatMissionReportMarkdown(report: MissionReport): string {
  const lines: string[] = [
    `## ${describeReportTitle(report)}`,
    "",
    `**${report.playbookName}:** ${report.assignment.trim()}`,
  ];
  if (report.reason) lines.push("", `Reason: ${report.reason}`);
  lines.push("", "### Stages");
  for (const stage of report.stages) {
    const summary = stage.summary ?? stage.detail;
    lines.push(`- **${stage.title}** — ${stage.status.replaceAll("-", " ")}${summary ? `: ${summary}` : ""}`);
    for (const decision of stage.decisions) {
      lines.push(`  - Decision: ${decision.decision} — ${decision.reason}`);
    }
    for (const evidence of stage.evidence) {
      const ref = evidence.ref ? ` (${evidence.ref})` : evidence.command ? ` (\`${evidence.command}\`)` : "";
      lines.push(`  - ${EVIDENCE_SOURCE_LABELS[evidence.source]}: ${evidence.label}${ref}`);
    }
  }
  if (report.acceptanceCriteria.length > 0) {
    lines.push("", "### Acceptance criteria");
    for (const criterion of report.acceptanceCriteria) {
      lines.push(`- ${CRITERION_MARKS[criterion.status]} ${criterion.text}`);
    }
  }
  if (report.links.length > 0) {
    lines.push("", "### Links");
    for (const link of report.links) {
      lines.push(`- [${link.label}](${link.url}) — ${EVIDENCE_SOURCE_LABELS[link.source]}`);
    }
  }
  if (report.leftBehind.length > 0) {
    lines.push("", "### Left behind");
    for (const item of report.leftBehind) lines.push(`- ${item}`);
  }
  return `${lines.join("\n")}\n`;
}
