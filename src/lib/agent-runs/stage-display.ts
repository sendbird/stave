import { i18n } from "@/i18n/runtime";

const BUILTIN_STAGE_COPY = {
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "work": { canonical: "Work", key: "agentRuns:builtinStages.work" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "reproduce": { canonical: "Reproduce", key: "agentRuns:builtinStages.reproduce" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "cause": { canonical: "Cause", key: "agentRuns:builtinStages.cause" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "fix": { canonical: "Fix", key: "agentRuns:builtinStages.fix" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "report": { canonical: "Report", key: "agentRuns:builtinStages.report" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "validate": { canonical: "Validate", key: "agentRuns:builtinStages.validate" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "open-draft-pr": { canonical: "Open draft PR", key: "agentRuns:builtinStages.openDraftPr" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "watch-checks": { canonical: "Watch checks", key: "agentRuns:builtinStages.watchChecks" },
  // i18n-ignore: canonical built-in stage title used for matching persisted workflows
  "ready-for-review": { canonical: "Ready for review", key: "agentRuns:builtinStages.readyForReview" },
} as const;

/** Localize reserved built-in stage names without changing the stored workflow or model instructions. */
export function getStageDisplayTitle(stage: { id: string; title: string }): string {
  const copy = BUILTIN_STAGE_COPY[stage.id as keyof typeof BUILTIN_STAGE_COPY];
  return copy && stage.title === copy.canonical ? i18n.t(copy.key) : stage.title;
}
