/**
 * A Mission report as Markdown, for Copy Markdown and, later, for adding it
 * to a pull request description.
 *
 * Pure. Used by `src/components/missions/MissionReportView.tsx`.
 */
import { formatAge } from "./mission-view";
import { EVIDENCE_SOURCE_LABELS, evidenceSourceLabel } from "./evidence";
import type { MissionMetrics, MissionReport } from "./report";

/** "2 replies from you · 1 reminder to report · sign-offs waited 12m on average (longest 20m)". */
export function describeMissionMetrics(metrics: MissionMetrics): string {
  const parts = [
    `${metrics.userReplies} ${metrics.userReplies === 1 ? "reply" : "replies"} from you`,
    `${metrics.nudges} ${metrics.nudges === 1 ? "reminder" : "reminders"} to report`,
    `${metrics.stuckStages} stuck`,
  ];
  if (metrics.signOffWaitAverageMs !== null && metrics.signOffWaitLongestMs !== null) {
    const average = formatAge(metrics.signOffWaitAverageMs);
    const longest = formatAge(metrics.signOffWaitLongestMs);
    parts.push(
      `${metrics.signOffs} ${metrics.signOffs === 1 ? "sign-off" : "sign-offs"} waited ${average} on average${
        metrics.signOffs > 1 ? ` (longest ${longest})` : ""
      }`,
    );
  }
  return parts.join(" · ");
}

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
    `**${report.workflowName}:** ${report.assignment.trim()}`,
  ];
  if (report.reason) lines.push("", `Reason: ${report.reason}`);
  lines.push("", "### Stages");
  for (const stage of report.stages) {
    const summary = stage.summary ?? stage.detail;
    lines.push(`- **${stage.title}** — ${stage.status.replaceAll("-", " ")}${summary ? `: ${summary}` : ""}`);
    for (const item of stage.plan ?? []) {
      lines.push(`  - [${item.status === "completed" ? "x" : " "}] ${item.content}`);
    }
    for (const decision of stage.decisions) {
      lines.push(`  - Decision: ${decision.decision} — ${decision.reason}`);
    }
    for (const evidence of stage.evidence) {
      const ref = evidence.ref ? ` (${evidence.ref})` : evidence.command ? ` (\`${evidence.command}\`)` : "";
      const status = [
        evidence.outcome === "failed" ? "Failed" : null,
        evidence.exitCode !== undefined ? `Exit ${evidence.exitCode ?? "unknown"}` : null,
        evidence.freshness === "stale" ? "Changed since this check" : evidence.freshness === "unknown" && evidence.kind === "check" ? "Current work unverified" : null,
      ].filter(Boolean).join(" · ");
      lines.push(`  - ${evidenceSourceLabel(evidence)}: ${evidence.label}${ref}${status ? ` · ${status}` : ""}`);
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
  if (report.metrics) {
    lines.push("", `_${describeMissionMetrics(report.metrics)}_`);
  }
  return `${lines.join("\n")}\n`;
}

/** A Slack thread link: `https://<team>.slack.com/archives/<channel>/p<ts>`. */
export const SLACK_THREAD_URL = /^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/i;

/** The first Slack thread link in a text, such as the assignment it came from. */
export function findSlackThreadUrl(text: string): string | null {
  const match = text.match(/https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+[^\s)>\]]*/i);
  return match ? match[0] : null;
}

/** The turn that posts a report to a thread: one reply, with the user's Slack tools, no file changes. */
export function buildShareReportPrompt(threadUrl: string, markdown: string): string {
  return [
    `Post this mission report as one reply in the Slack thread ${threadUrl}, using your Slack tools.`,
    "Keep it as it is apart from what Slack formatting needs, post it once, then say where you posted it.",
    "Do not change any files.",
    "",
    markdown,
  ].join("\n");
}

const REPORT_START = "<!-- stave:mission-report -->";
const REPORT_END = "<!-- /stave:mission-report -->";

/**
 * The pull request body with the Mission report section added, or replaced
 * when an earlier report is already there, so adding it twice never repeats.
 */
export function mergeReportIntoPullRequestBody(body: string, reportMarkdown: string): string {
  const section = `${REPORT_START}\n${reportMarkdown.trim()}\n${REPORT_END}`;
  const start = body.indexOf(REPORT_START);
  const end = body.indexOf(REPORT_END);
  if (start !== -1 && end > start) {
    return `${body.slice(0, start)}${section}${body.slice(end + REPORT_END.length)}`;
  }
  const trimmed = body.trimEnd();
  return trimmed ? `${trimmed}\n\n${section}\n` : `${section}\n`;
}
