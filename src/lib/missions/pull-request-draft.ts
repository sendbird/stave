/**
 * The commit message and pull request text a mission's Stave actions use.
 *
 * Deterministic on purpose: the model-drafted versions the Open PR dialog
 * offers depend on the renderer's utility runtime settings, which the host
 * service does not have. The title comes from the branch's own commit
 * subjects (the Verify stage commits with a clear message), and the body
 * carries what the mission did, from its stage reports.
 *
 * Pure. Used by `electron/host-service/supervision/mission-actions.ts`.
 */
import { generateFallbackPullRequestDraft } from "@/lib/source-control-pr";
import { collectAcceptanceCriteria, collectPriorStageSummaries } from "./briefing";
import type { MissionAggregate } from "./domain";

const SUBJECT_MAX_CHARS = 72;

function firstSentence(text: string) {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  const sentence = line.split(/(?<=[.!?])\s/)[0] ?? line;
  return sentence.replace(/[.!?]+$/, "");
}

function lowerFirst(text: string) {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}

function clampSubject(subject: string) {
  if (subject.length <= SUBJECT_MAX_CHARS) return subject;
  return `${subject.slice(0, SUBJECT_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * For work an AI stage left uncommitted. A stage normally commits its own
 * work with a message it wrote; this is the fallback.
 */
export function buildMissionCommitMessage(aggregate: MissionAggregate): string {
  const subject = lowerFirst(firstSentence(aggregate.mission.assignment)) || "apply mission changes";
  return clampSubject(`chore: ${subject}`);
}

export const CHECKS_REPAIR_COMMIT_MESSAGE = "fix: address failing checks";

const CRITERION_MARKS = { met: "[x]", unmet: "[ ]", unverified: "[?]" } as const;

export function buildMissionPullRequestDraft(args: {
  aggregate: MissionAggregate;
  baseBranch: string;
  headBranch: string;
  /** `git log --oneline <base>..HEAD`. */
  commitLog: string;
}): { title: string; body: string } {
  const { mission } = args.aggregate;
  const fallback = generateFallbackPullRequestDraft({
    baseBranch: args.baseBranch,
    headBranch: args.headBranch,
    commitLog: args.commitLog,
  });
  const stages = collectPriorStageSummaries(args.aggregate);
  const criteria = collectAcceptanceCriteria(args.aggregate);
  const body = [
    "## Summary",
    mission.assignment.trim(),
    ...(stages.length
      ? ["", "## What was done", ...stages.map((stage) => `- **${stage.title}:** ${stage.summary}`)]
      : []),
    ...(criteria.length
      ? [
          "",
          "## Acceptance criteria",
          ...criteria.map((criterion) => `- ${CRITERION_MARKS[criterion.status]} ${criterion.text}`),
        ]
      : []),
    "",
    `Opened as a draft by a Stave mission (${mission.workflow.name}).`,
  ].join("\n");
  return { title: fallback.title, body };
}
