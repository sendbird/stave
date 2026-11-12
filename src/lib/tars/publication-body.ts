import type { TarsCriterionSource, TarsReportModel } from "./report-model";
import { TARS_PUBLISH_BODY_MAX_CHARS, type TarsPublishSource } from "./publication";

/**
 * The draft pull request's body, built by the host from the responsibility's
 * frozen report so the renderer and the model never supply it: what was
 * asked, each acceptance criterion with its met or unmet status and what
 * decided it, and the verification evidence the report recorded.
 *
 * The body is repository content sent to GitHub, not Stave interface copy, so
 * it is written in English and never translated.
 */

type ReportPart = Pick<TarsReportModel, "state" | "criteria" | "evidenceGroups" | "frozenAt" | "finalRevision" | "outcome">;

const STATUS_WORD = { met: "met", unmet: "unmet", unverified: "unverified", notReported: "not reported" } as const;
const SOURCE_WORD = { stave: "Verified by Stave", provider: "Provider result", agent: "Agent reported" } as const;

/** Keeps run and model text on one line and escapes the characters GitHub would read as markup. */
function inline(text: string) {
  return text.replace(/\s+/g, " ").trim().replace(/([\\`*_[\]<>|])/g, "\\$1");
}

function describeSource(source: TarsCriterionSource) {
  // i18n-ignore: pull request body sent to GitHub
  if (source.kind === "agent") return `agent report in ${inline(source.stageTitle)}${source.revision ? ` on ${source.revision}` : ""}`;
  // i18n-ignore: pull request body sent to GitHub
  if (source.kind === "check") return `${source.exitCode === null ? "check not run" : source.exitCode === 0 ? "check passed" : `check failed (exit ${source.exitCode})`}: ${inline(source.name)}${source.revision ? ` on ${source.revision}` : ""}`;
  return null;
}

export function buildTarsPublicationBody(args: { title: string; report: ReportPart | null; source?: TarsPublishSource }): string {
  const { report } = args;
  // i18n-ignore: pull request body sent to GitHub
  const lines = ["## Summary", "", inline(args.title), ""];
  if (report && report.criteria.length) {
    // i18n-ignore: pull request body sent to GitHub
    lines.push("## Acceptance criteria", "");
    for (const criterion of report.criteria) {
      const source = describeSource(criterion.source);
      lines.push(`- [${criterion.status === "met" ? "x" : " "}] ${inline(criterion.text)} (${STATUS_WORD[criterion.status]}${source ? `; ${source}` : ""})`);
    }
    lines.push("");
  }
  const evidence = report?.evidenceGroups.flatMap((group) => group.evidence.map((item) => ({ group, item }))) ?? [];
  // i18n-ignore: pull request body sent to GitHub
  lines.push("## Verification", "");
  if (evidence.length) {
    for (const { group, item } of evidence.slice(0, 40)) {
      const detail = item.evidence.command ? ` \`${item.evidence.command.replace(/`/g, "'").slice(0, 200)}\`` : "";
      const source = item.verified ? SOURCE_WORD.stave : item.source === "stave" ? "Stave result" : SOURCE_WORD[item.source];
      lines.push(`- ${inline(group.stageTitle)}: ${inline(item.evidence.label)}${detail} (${source}${item.revision ? ` on ${item.revision}` : ""})`);
    }
    // i18n-ignore: pull request body sent to GitHub
    if (evidence.length > 40) lines.push(`- ${evidence.length - 40} more in the Stave report`);
  } else {
    // i18n-ignore: pull request body sent to GitHub
    lines.push("- No verification evidence was recorded in the report.");
  }
  lines.push("");
  if (report?.state === "frozen") {
    // i18n-ignore: pull request body sent to GitHub
    lines.push(`Report frozen at ${report.frozenAt ?? "an unknown time"}${report.finalRevision ? ` on revision ${report.finalRevision}` : ""}.`, "");
  }
  // i18n-ignore: pull request body sent to GitHub
  lines.push("---", "", args.source === "automatic" ? "Opened as a draft automatically by Tars in Stave for the requested publication goal. It was not merged or deployed." : "Opened as a draft by Tars in Stave after the user confirmed it. It was not merged or deployed.");
  const body = lines.join("\n");
  return body.length <= TARS_PUBLISH_BODY_MAX_CHARS ? body : `${body.slice(0, TARS_PUBLISH_BODY_MAX_CHARS - 2)}\n…`;
}
